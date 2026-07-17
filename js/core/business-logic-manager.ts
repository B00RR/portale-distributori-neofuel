import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';

import { supabase } from './api.js';
import {
  BusinessRulesSchema,
  DEFAULT_BUSINESS_RULES,
  type BusinessRules
} from './business-rules-schema.js';
import { logger } from './logger.js';

const BUCKET_NAME = 'system';
const FILE_PATH = 'configs/business_rules.json'; // Ensure no spaces
const DOWNLOAD_TIMEOUT_MS = 5000;

/** TTL delle regole caricate con successo dallo Storage. */
export const RULES_CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * TTL breve applicato dopo un load fallito: evita che ogni chiamata successiva
 * ritenti il download (#348) pur riprovando entro poco tempo.
 */
export const RULES_FALLBACK_TTL_MS = 30 * 1000;

export interface RulesCacheInfo {
  /** `updated_at` delle regole remote; null per i default di fallback. */
  version: string | null;
  source: 'remote' | 'default';
  expiresAt: number;
}

interface RulesCacheEntry extends RulesCacheInfo {
  rules: BusinessRules;
}

let cacheEntry: RulesCacheEntry | null = null;
let inFlightLoad: Promise<BusinessRules> | null = null;
// Incrementata a ogni invalidazione: un load partito prima dell'invalidazione
// non deve ripopolare la cache con dati ormai superati.
let cacheGeneration = 0;

async function fetchRemoteRules(): Promise<BusinessRules> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Storage download timeout')),
        DOWNLOAD_TIMEOUT_MS
      );
    });

    const { data, error } = await Promise.race([
      supabase.storage.from(BUCKET_NAME).download(FILE_PATH),
      timeoutPromise
    ]);

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error('Business rules file is empty');
    }

    const jsonText = await data.text();
    const parsed: unknown = JSON.parse(jsonText);
    return BusinessRulesSchema.parse(parsed);
  } finally {
    clearTimeout(timeoutId);
  }
}

function storeRemoteEntry(rules: BusinessRules): void {
  cacheEntry = {
    rules,
    source: 'remote',
    version: rules.updated_at ?? null,
    expiresAt: Date.now() + RULES_CACHE_TTL_MS
  };
}

/**
 * Business Logic Manager
 * Syncs JSON config with Supabase Storage.
 *
 * Contratto cache (#348): singola entry versionata con TTL, coalescenza delle
 * richieste concorrenti, negative-cache dei fallback e invalidazione esplicita.
 */
export const BusinessLogicManager = {
  /**
   * Load settings from Storage, the cache, or defaults.
   * Concurrent calls share a single download; failures serve the last known
   * good rules (or defaults) for a short window before retrying.
   */
  async loadRules(): Promise<BusinessRules> {
    if (cacheEntry && Date.now() < cacheEntry.expiresAt) {
      return cacheEntry.rules;
    }
    if (inFlightLoad) {
      return inFlightLoad;
    }

    const generation = cacheGeneration;
    // Riferimento alla promise per il cleanup: il finally gira sempre dopo
    // l'await del download, quindi dopo l'assegnazione qui sotto.
    let loadRef: Promise<BusinessRules> | null = null;
    const load = (async (): Promise<BusinessRules> => {
      try {
        const rules = await fetchRemoteRules();
        if (generation === cacheGeneration) {
          storeRemoteEntry(rules);
        }
        return rules;
      } catch (err) {
        logger.error('businessLogic', 'Load failed:', err);
        if (generation !== cacheGeneration) {
          return cacheEntry?.rules ?? DEFAULT_BUSINESS_RULES;
        }
        if (cacheEntry?.source === 'remote') {
          // Stale-while-error: meglio le ultime regole valide dei default.
          cacheEntry = { ...cacheEntry, expiresAt: Date.now() + RULES_FALLBACK_TTL_MS };
        } else {
          cacheEntry = {
            rules: DEFAULT_BUSINESS_RULES,
            source: 'default',
            version: null,
            expiresAt: Date.now() + RULES_FALLBACK_TTL_MS
          };
        }
        return cacheEntry.rules;
      } finally {
        if (inFlightLoad === loadRef) {
          inFlightLoad = null;
        }
      }
    })();

    loadRef = load;
    inFlightLoad = load;
    return load;
  },

  /**
   * Save settings to Storage
   */
  async saveRules(rules: Partial<BusinessRules>): Promise<void> {
    try {
      const current = await this.loadRules();
      const updated = {
        ...current,
        ...rules,
        updated_at: new Date().toISOString()
      };

      // Validate before saving
      const validated = BusinessRulesSchema.parse(updated);

      const blob = new Blob([JSON.stringify(validated, null, 2)], { type: 'application/json' });
      const file = new File([blob], 'business_rules.json');

      const { error } = await supabase.storage.from(BUCKET_NAME).upload(FILE_PATH, file, {
        upsert: true,
        contentType: 'application/json'
      });

      if (error) {
        throw error;
      }

      // Write-through: la copia appena salvata è la versione più recente e
      // nessun load partito prima del salvataggio può sovrascriverla.
      cacheGeneration += 1;
      inFlightLoad = null;
      storeRemoteEntry(validated);
      Toast.show('Regole di business aggiornate con successo', 'success');
    } catch (err) {
      handleError(err, 'businessLogicSaveRules');
      throw err;
    }
  },

  /**
   * Invalidazione esplicita: il prossimo loadRules() scarica dati freschi e
   * nessun load ancora in volo può ripopolare la cache.
   */
  invalidateCache(): void {
    cacheGeneration += 1;
    cacheEntry = null;
    inFlightLoad = null;
  },

  /**
   * Stato osservabile della cache (versione, sorgente, scadenza).
   */
  getCacheInfo(): RulesCacheInfo | null {
    if (!cacheEntry) {
      return null;
    }
    return {
      version: cacheEntry.version,
      source: cacheEntry.source,
      expiresAt: cacheEntry.expiresAt
    };
  }
};
