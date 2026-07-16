// ==========================================
// MOTORE DINAMICO DI CALCOLO (SCAFFOLDING)
// ==========================================
import { supabase, safeSupabaseQuery } from '../core/api.js';
import { logger } from '../core/logger.js';
import { CustomWindow } from '../types.js';

const MODULE_TABLE = 'calculation_modules';

interface CalcModuleRow {
  id: string;
  active_version_id: string | null;
  calculation_versions:
    | {
        id: string;
        version: number;
        status: string;
        dsl: unknown;
        created_at: string;
      }[]
    | null;
}

/** A value flowing through the calculation engine — genuinely dynamic data. */
export type CalcValue = unknown;
/** The evaluation context passed to a compiled scope. */
export type CalcContext = unknown;
/** A DSL operation node: an object carrying an `op` discriminator plus operation-specific fields. */
export type DslOpNode = { op?: string } & Record<string, unknown>;
/** A DSL node is either an operation node or a literal value. */
export type DslNode = CalcValue;
/** Recursive evaluator handed to operation handlers. */
export type EvaluateFn = (node: DslNode, ctx: CalcContext) => CalcValue;
/** A compiled scope: takes a context and returns the computed value. */
export type CompiledScope = (context: CalcContext) => CalcValue;
/** A custom function registered against the engine. */
export type CustomFunction = (args: Record<string, unknown>, ctx: CalcContext) => CalcValue;

export type OperationHandler = (
  node: DslOpNode,
  ctx: CalcContext,
  evaluate: EvaluateFn,
  engine: CalculationEngine
) => CalcValue;

// Coercizione numerica che preserva la semantica `Number(x || 0)`.
function toNumber(value: unknown): number {
  return Number((value as number) || 0);
}

// Limitiamo le operazioni consentite per sicurezza.
const DEFAULT_OPERATIONS: Record<string, OperationHandler> = {
  constant: ({ value }) => value,
  input: ({ path }, ctx) => (path ? getByPath(ctx, String(path)) : ctx),
  sum: ({ source, selector }, ctx) => {
    const data = source ? getByPath(ctx, String(source)) : ctx;
    if (!Array.isArray(data)) {
      return 0;
    }
    return data.reduce((acc: number, item) => {
      if (selector) {
        return acc + (Number(getByPath(item, String(selector))) || 0);
      }
      return acc + (Number(item) || 0);
    }, 0);
  },
  multiply: ({ value, by }, ctx, evaluate) => {
    const left = evaluate(value, ctx);
    const right = evaluate(by, ctx);
    return toNumber(left) * toNumber(right);
  },
  subtract: ({ minuend, subtrahend }, ctx, evaluate) => {
    const a = evaluate(minuend, ctx);
    const b = evaluate(subtrahend, ctx);
    return toNumber(a) - toNumber(b);
  },
  divide: ({ dividend, divisor, precision = 2 }, ctx, evaluate) => {
    const a = Number(evaluate(dividend, ctx) || 0);
    // Il default 1 vale solo per divisore ASSENTE (null/undefined): uno zero
    // valutato deve arrivare al guard, non essere coartato a 1 con `|| 1` (#291)
    const rawDivisor = evaluate(divisor, ctx);
    const b = rawDivisor == null ? 1 : Number(rawDivisor);
    if (b === 0 || Number.isNaN(b)) {
      return 0;
    }
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
  pipeline: ({ steps }, ctx, evaluate) => {
    const list = Array.isArray(steps) ? steps : [];
    return list.reduce((acc, step) => evaluate(step, acc), ctx);
  },
  map: ({ source, iteratee }, ctx, evaluate) => {
    const data = source ? getByPath(ctx, String(source)) : ctx;
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(item => evaluate(iteratee, item));
  },
  function: ({ name, args }, ctx, evaluate, engine) => {
    const fnName = String(name);
    const fn = engine.customFunctions.get(fnName);
    if (!fn) {
      logger.warn('calcEngine', `Funzione custom "${fnName}" non registrata`);
      return null;
    }
    const resolvedArgs: Record<string, unknown> = {};
    const argEntries =
      args && typeof args === 'object' ? Object.entries(args as Record<string, unknown>) : [];
    for (const [key, val] of argEntries) {
      // eslint-disable-next-line security/detect-object-injection -- key comes from Object.entries() of a local DSL arg object, written to a fresh local Record
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
  private cache: Map<string, CompiledScope> = new Map();
  private pending: Map<string, Promise<CompiledScope | null>> = new Map();
  private fallbacks: Map<string, CompiledScope> = new Map();
  public customFunctions: Map<string, CustomFunction> = new Map();
  public operations: Map<string, OperationHandler> = new Map(Object.entries(DEFAULT_OPERATIONS));
  private lastFetchTime: Map<string, number> = new Map();
  private staleAfterMs: number = 5 * 60 * 1000; // 5 minuti

  constructor() {}

  public registerFallback(scope: string, evaluator: CompiledScope): void {
    this.fallbacks.set(scope, evaluator);
  }

  public registerFunction(name: string, fn: CustomFunction): void {
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

  public async run(
    scope: string,
    context: CalcContext = {},
    options: { forceRefresh?: boolean } = {}
  ): Promise<CalcValue> {
    const compiled = await this.loadScope(scope, options.forceRefresh);
    if (!compiled) {
      const fallback = this.fallbacks.get(scope) || this.fallbacks.get(CALCULATION_SCOPES.DEFAULT);
      if (fallback) {
        return fallback(context);
      }
      logger.warn('calcEngine', `Nessun motore disponibile per lo scope "${scope}"`);
      return null;
    }
    return compiled(context);
  }

  public async loadScope(scope: string, force: boolean = false): Promise<CompiledScope | null> {
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

  private async fetchAndCompile(scope: string): Promise<CompiledScope | null> {
    try {
      const { data, error } = await safeSupabaseQuery<CalcModuleRow | null>(() =>
        supabase
          .from(MODULE_TABLE)
          .select(
            `
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
          `
          )
          .eq('scope', scope)
          .maybeSingle()
      );

      if (error) {
        throw error;
      }
      if (!data || !data.active_version_id) {
        return null;
      }

      // Accedi alle versioni usando il nome corretto della relazione
      const versions = data.calculation_versions || [];
      const activeVersion = Array.isArray(versions)
        ? versions.find(v => v.id === data.active_version_id && v.status === 'published')
        : null;

      if (!activeVersion || !activeVersion.dsl) {
        logger.warn('calcEngine', `Versione attiva non valida per scope "${scope}"`);
        return null;
      }

      const parsedDsl: DslNode =
        typeof activeVersion.dsl === 'string' ? JSON.parse(activeVersion.dsl) : activeVersion.dsl;

      validateDsl(parsedDsl);
      return this.compile(parsedDsl);
    } catch (err) {
      logger.error('calcEngine', `Errore caricando lo scope "${scope}":`, err);
      return null;
    }
  }

  public compile(dsl: DslNode): CompiledScope {
    const evaluator: EvaluateFn = (node, ctx) => {
      if (node === null || node === undefined) {
        return node;
      }
      if (typeof node !== 'object') {
        return node;
      }

      const { op } = node as DslOpNode;
      if (!op) {
        logger.warn('calcEngine', "Nodo DSL senza 'op', restituisco il blob originale");
        return node;
      }

      const handler = this.operations.get(op);
      if (!handler) {
        logger.warn('calcEngine', `Operazione non supportata: ${op}`);
        return null;
      }
      return handler(node as DslOpNode, ctx, evaluator, this);
    };

    return context => evaluator(dsl, context);
  }
}

// Helpers ------------------------------------------------------------
// Keys that must never be traversed: walking them would expose the prototype
// chain and enable prototype-pollution style reads through a crafted path.
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function getByPath(obj: unknown, path: string): unknown {
  if (!path) {
    return obj;
  }
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    // eslint-disable-next-line security/detect-object-injection -- segment is guarded above (forbidden keys rejected, own-property checked)
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return !!value;
}

function validateDsl(dsl: unknown): void {
  if (!dsl || typeof dsl !== 'object') {
    throw new Error('DSL non valido');
  }
  const op = (dsl as DslOpNode).op;
  if (!op) {
    throw new Error("Ogni DSL deve avere la proprietà 'op'");
  }
  if (!(op in DEFAULT_OPERATIONS) && op !== 'function') {
    logger.warn(
      'calcEngine',
      `Opzione "${op}" non predefinita: assicurarsi di registrare l'operazione custom prima dell'uso.`
    );
  }
}

export const calculationEngine = new CalculationEngine();
(window as unknown as CustomWindow).calculationEngine = calculationEngine;
calculationEngine.registerFallback(CALCULATION_SCOPES.DEFAULT, () => null);
