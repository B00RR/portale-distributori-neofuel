import { beforeEach, vi } from 'vitest';

import { logger } from '../js/core/logger.js';

/**
 * Il setup globale (#263) mocka logger.error/warn per eliminare il noise nei
 * log di test. I file che verificano proprio l'output del logger (via spy su
 * console.*) chiamano questo helper a livello di modulo per ripristinare le
 * implementazioni reali prima di ogni test.
 */
export function useRealLogger(): void {
  beforeEach(() => {
    if (vi.isMockFunction(logger.error)) {
      logger.error.mockRestore();
    }
    if (vi.isMockFunction(logger.warn)) {
      logger.warn.mockRestore();
    }
  });
}
