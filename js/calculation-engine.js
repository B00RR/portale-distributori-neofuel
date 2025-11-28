// ==========================================
// MOTORE DINAMICO DI CALCOLO (SCAFFOLDING)
// ==========================================
import { supabase, safeSupabaseQuery } from "./api.js";

const MODULE_TABLE = "calculation_modules";
const VERSION_TABLE = "calculation_versions";

// Limitiamo le operazioni consentite per sicurezza.
const DEFAULT_OPERATIONS = {
  constant: ({ value }) => value,
  input: ({ path }, ctx) => path ? getByPath(ctx, path) : ctx,
  sum: ({ source, selector }, ctx) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) return 0;
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
    if (b === 0) return 0;
    const result = a / b;
    return typeof precision === "number" ? Number(result.toFixed(precision)) : result;
  },
  condition: ({ test, then, else: elseNode }, ctx, evaluate) => {
    const outcome = evaluate(test, ctx);
    if (truthy(outcome)) {
      return then ? evaluate(then, ctx) : outcome;
    }
    return elseNode ? evaluate(elseNode, ctx) : null;
  },
  pipeline: ({ steps = [] }, ctx, evaluate) => {
    return steps.reduce((acc, step) => evaluate(step, acc), ctx);
  },
  map: ({ source, iteratee }, ctx, evaluate) => {
    const data = source ? getByPath(ctx, source) : ctx;
    if (!Array.isArray(data)) return [];
    return data.map(item => evaluate(iteratee, item));
  },
  function: ({ name, args = {} }, ctx, evaluate, engine) => {
    const fn = engine.customFunctions.get(name);
    if (!fn) {
      console.warn(`Funzione custom "${name}" non registrata`);
      return null;
    }
    const resolvedArgs = {};
    for (const [key, val] of Object.entries(args)) {
      resolvedArgs[key] = evaluate(val, ctx);
    }
    return fn(resolvedArgs, ctx);
  }
};

export const CALCULATION_SCOPES = {
  CHIUSURE_TOTALE: "chiusure.totale_teorico",
  CHIUSURE_CONTANTI: "chiusure.incassi_contanti",
  KPI_VENDUTO: "dashboard.kpi_venduto",
  KPI_EROGATO: "dashboard.kpi_erogato",
  CHIUSURE_MOVIMENTI: "chiusure.movimenti",
  CHIUSURE_TOTALE_ATTESO: "chiusure.totale_atteso",
  CHIUSURE_CASH_METRICS: "chiusure.cash_metrics",
  DEFAULT: "generic"
};

class CalculationEngine {
  constructor() {
    this.cache = new Map();
    this.pending = new Map();
    this.fallbacks = new Map();
    this.customFunctions = new Map();
    this.operations = new Map(Object.entries(DEFAULT_OPERATIONS));
    this.lastFetchTime = new Map();
    this.staleAfterMs = 5 * 60 * 1000; // 5 minuti
  }

  registerFallback(scope, evaluator) {
    this.fallbacks.set(scope, evaluator);
  }

  registerFunction(name, fn) {
    this.customFunctions.set(name, fn);
  }

  registerOperation(name, handler) {
    this.operations.set(name, handler);
  }

  invalidate(scope = null) {
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

  async run(scope, context = {}, options = {}) {
    const compiled = await this.loadScope(scope, options.forceRefresh);
    if (!compiled) {
      const fallback = this.fallbacks.get(scope) || this.fallbacks.get(CALCULATION_SCOPES.DEFAULT);
      if (fallback) return fallback(context);
      console.warn(`Nessun motore disponibile per lo scope "${scope}"`);
      return null;
    }
    return compiled(context);
  }

  async loadScope(scope, force = false) {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(scope) || 0;
    if (!force && this.cache.has(scope) && now - lastFetch < this.staleAfterMs) {
      return this.cache.get(scope);
    }

    if (this.pending.has(scope)) {
      return this.pending.get(scope);
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

  async fetchAndCompile(scope) {
    try {
      const { data, error } = await safeSupabaseQuery(() =>
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
          .eq("scope", scope)
          .maybeSingle()
      );

      if (error) throw error;
      if (!data || !data.active_version_id) {
        console.info(`Nessuna versione attiva per scope "${scope}"`);
        return null;
      }

      // Accedi alle versioni usando il nome corretto della relazione
      const versions = data.calculation_versions || data[VERSION_TABLE] || [];
      const activeVersion = Array.isArray(versions)
        ? versions.find(v => v.id === data.active_version_id && v.status === "published")
        : null;

      if (!activeVersion || !activeVersion.dsl) {
        console.warn(`Versione attiva non valida per scope "${scope}"`);
        return null;
      }

      const parsedDsl = typeof activeVersion.dsl === "string"
        ? JSON.parse(activeVersion.dsl)
        : activeVersion.dsl;

      validateDsl(parsedDsl);
      return this.compile(parsedDsl);
    } catch (err) {
      console.error(`Errore caricando lo scope "${scope}":`, err);
      return null;
    }
  }

  compile(dsl) {
    const evaluator = (node, ctx) => {
      if (node === null || node === undefined) return node;
      if (typeof node !== "object") return node;

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

    return (context) => evaluator(dsl, context);
  }
}

// Helpers ------------------------------------------------------------
function getByPath(obj, path) {
  if (!path) return obj;
  const segments = path.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  return current;
}

function truthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}

function validateDsl(dsl) {
  if (!dsl || typeof dsl !== "object") throw new Error("DSL non valido");
  if (!dsl.op) throw new Error("Ogni DSL deve avere la proprietà 'op'");
  if (!DEFAULT_OPERATIONS[dsl.op] && dsl.op !== "function") {
    console.warn(`Opzione "${dsl.op}" non predefinita: assicurarsi di registrare l'operazione custom prima dell'uso.`);
  }
}

export const calculationEngine = new CalculationEngine();
window.calculationEngine = calculationEngine;
calculationEngine.registerFallback(CALCULATION_SCOPES.DEFAULT, () => null);

