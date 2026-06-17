// ==========================================
// MOTORE DINAMICO DI CALCOLO (SCAFFOLDING)
// ==========================================
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { CustomWindow } from '../types.js';

const MODULE_TABLE = 'calculation_modules';

interface CalcModuleRow {
  id: string;
  active_version_id: string | null;
  calculation_versions: {
    id: string;
    version: number;
    status: string;
    dsl: unknown;
    created_at: string;
  }[] | null;
}

export type OperationHandler = (node: any, ctx: any, evaluate: (node: any, ctx: any) => any, engine: CalculationEngine) => any;

// Limitiamo le operazioni consentite per sicurezza.
const DEFAULT_OPERATIONS: Record<string, OperationHandler> = {
  constant: ({ value }) => value,
  input: ({ path }, ctx) => path ? getByPath(ctx, path) : ctx,
  sum: ({ source, selector }, ctx) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) { return 0; }
    return data.reduce((acc, item) => {
      if (selector) {
        return acc + (Number(getByPath(item, selector)) || 0);
      }
      return acc + (Number(item) || 0);
    }, 0);
  },
  multiply: ({ value, by }, ctx, evaluate) => {
    const left = evaluate(value, ctx);
    const right = evaluate(by, ctx);
    return Number(left || 0) * Number(right || 0);
  },
  subtract: ({ minuend, subtrahend }, ctx, evaluate) => {
    const a = evaluate(minuend, ctx);
    const b = evaluate(subtrahend, ctx);
    return Number(a || 0) - Number(b || 0);
  },
  divide: ({ dividend, divisor, precision = 2 }, ctx, evaluate) => {
    const a = Number(evaluate(dividend, ctx) || 0);
    const b = Number(evaluate(divisor, ctx) || 1);
    if (b === 0) { return 0; }
    const result = a / b;
    return typeof precision === 'number' ? Number(result.toFixed(precision)) : result;
  },
  condition: ({ test, then, else: elseNode }, ctx, evaluate) => {
    const outcome = evaluate(test, ctx);
    if (truthy(outcome)) {
      return then ? evaluate(then, ctx) : outcome;
    }
    return elseNode ? evaluate(elseNode, ctx) : null;
  },
  pipeline: ({ steps = [] }, ctx, evaluate) => {
    return steps.reduce((acc: any, step: any) => evaluate(step, acc), ctx);
  },
  map: ({ source, iteratee }, ctx, evaluate) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) { return []; }
    return data.map(item => evaluate(iteratee, item));
  },
  function: ({ name, args = {} }, ctx, evaluate, engine) => {
    const fn = engine.customFunctions.get(name);
    if (!fn) {
      console.warn(`Funzione custom "${name}" non registrata`);
      return null;
    }
    const resolvedArgs: Record<string, any> = {};
    for (const [key, val] of Object.entries(args)) {
      resolvedArgs[key] = evaluate(val, ctx);
    }
    return fn(resolvedArgs, ctx);
  }
};

export const CALCULATION_SCOPES = {
  CHIUSURE_TOTALE: 'chiusure.totale_teorico',
  CHIUSURE_CONTANTI: 'chiusure.incassi_contanti',
  KPI_VENDUTO: 'dashboard.kpi_venduto',
  KPI_EROGATO: 'dashboard.kpi_erogato',
  CHIUSURE_MOVIMENTI: 'chiusure.movimenti',
  CHIUSURE_TOTALE_ATTESO: 'chiusure.totale_atteso',
  CHIUSURE_CASH_METRICS: 'chiusure.cash_metrics',
  DEFAULT: 'generic'
};

class CalculationEngine {
  private cache: Map<string, (ctx: any) => any> = new Map();
  private pending: Map<string, Promise<((ctx: any) => any) | null>> = new Map();
  private fallbacks: Map<string, (ctx: any) => any> = new Map();
  public customFunctions: Map<string, (args: any, ctx: any) => any> = new Map();
  public operations: Map<string, OperationHandler> = new Map(Object.entries(DEFAULT_OPERATIONS));
  private lastFetchTime: Map<string, number> = new Map();
  private staleAfterMs: number = 5 * 60 * 1000; // 5 minuti

  constructor() { }

  public registerFallback(scope: string, evaluator: (ctx: any) => any): void {
    this.fallbacks.set(scope, evaluator);
  }

  public registerFunction(name: string, fn: (args: any, ctx: any) => any): void {
    this.customFunctions.set(name, fn);
  }

  public registerOperation(name: string, handler: OperationHandler): void {
    this.operations.set(name, handler);
  }

  /**
     * Invalidate cache for a scope or all
     * @param {string|null} scope 
     */
  public invalidate(scope: string | null = null): void {
    if (scope) {
      this.cache.delete(scope);
      this.lastFetchTime.delete(scope);
      this.pending.delete(scope);
      return;
    }
    this.cache.clear();
    this.lastFetchTime.clear();
    this.pending.clear();
  }

  public async run(scope: string, context: any = {}, options: { forceRefresh?: boolean } = {}): Promise<any> {
    const compiled = await this.loadScope(scope, options.forceRefresh);
    if (!compiled) {
      const fallback = this.fallbacks.get(scope) || this.fallbacks.get(CALCULATION_SCOPES.DEFAULT);
      if (fallback) { return fallback(context); }
      console.warn(`Nessun motore disponibile per lo scope "${scope}"`);
      return null;
    }
    return compiled(context);
  }

  public async loadScope(scope: string, force: boolean = false): Promise<((ctx: any) => any) | null> {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(scope) || 0;
    if (!force && this.cache.has(scope) && now - lastFetch < this.staleAfterMs) {
      return this.cache.get(scope) || null;
    }

    if (this.pending.has(scope)) {
      return this.pending.get(scope) || null;
    }

    const fetchPromise = this.fetchAndCompile(scope)
      .then(compiled => {
        if (compiled) {
          this.cache.set(scope, compiled);
          this.lastFetchTime.set(scope, Date.now());
        }
        return compiled;
      })
      .finally(() => {
        this.pending.delete(scope);
      });

    this.pending.set(scope, fetchPromise);
    return fetchPromise;
  }

  private async fetchAndCompile(scope: string): Promise<((ctx: any) => any) | null> {
    try {
      const { data, error } = await safeSupabaseQuery<CalcModuleRow | null>(() =>
        supabase
          .from(MODULE_TABLE)
          .select(`
            id,
            scope,
            active_version_id,
            calculation_versions!calculation_versions_module_id_fkey(
              id,
              version,
              status,
              dsl,
              created_at
            )
          `)
          .eq('scope', scope)
          .maybeSingle()
      );

      if (error) { throw error; }
      if (!data || !data.active_version_id) {
        console.info(`Nessuna versione attiva per scope "${scope}"`);
        return null;
      }

      // Accedi alle versioni usando il nome corretto della relazione
      const versions = data.calculation_versions || [];
      const activeVersion = Array.isArray(versions)
        ? versions.find((v) => v.id === data.active_version_id && v.status === 'published')
        : null;

      if (!activeVersion || !activeVersion.dsl) {
        console.warn(`Versione attiva non valida per scope "${scope}"`);
        return null;
      }

      const parsedDsl = typeof activeVersion.dsl === 'string'
        ? JSON.parse(activeVersion.dsl)
        : activeVersion.dsl;

      validateDsl(parsedDsl);
      return this.compile(parsedDsl);
    } catch (err) {
      console.error(`Errore caricando lo scope "${scope}":`, err);
      return null;
    }
  }

  public compile(dsl: any): (context: any) => any {
    const evaluator = (node: any, ctx: any): any => {
      if (node === null || node === undefined) { return node; }
      if (typeof node !== 'object') { return node; }

      const { op } = node;
      if (!op) {
        console.warn("Nodo DSL senza 'op', restituisco il blob originale");
        return node;
      }

      const handler = this.operations.get(op);
      if (!handler) {
        console.warn(`Operazione non supportata: ${op}`);
        return null;
      }
      return handler(node, ctx, evaluator, this);
    };

    return (context: any) => evaluator(dsl, context);
  }
}

// Helpers ------------------------------------------------------------
function getByPath(obj: any, path: string): any {
  if (!path) { return obj; }
  const segments = path.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) { return undefined; }
    current = current[segment];
  }
  return current;
}

function truthy(value: any): boolean {
  if (Array.isArray(value)) { return value.length > 0; }
  return !!value;
}

function validateDsl(dsl: any): void {
  if (!dsl || typeof dsl !== 'object') { throw new Error('DSL non valido'); }
  if (!dsl.op) { throw new Error("Ogni DSL deve avere la proprietà 'op'"); }
  if (!DEFAULT_OPERATIONS[dsl.op] && dsl.op !== 'function') {
    console.warn(`Opzione "${dsl.op}" non predefinita: assicurarsi di registrare l'operazione custom prima dell'uso.`);
  }
}

export const calculationEngine = new CalculationEngine();
(window as unknown as CustomWindow).calculationEngine = calculationEngine;
calculationEngine.registerFallback(CALCULATION_SCOPES.DEFAULT, () => null);
