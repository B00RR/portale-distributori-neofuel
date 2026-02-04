import { describe, it, expect } from 'vitest';

import { APP_CONFIG, API_ENDPOINTS, UI_CONSTANTS } from '../../js/core/config.js';

describe('Config Module', () => {
    it('should export APP_CONFIG', () => {
        expect(APP_CONFIG).toBeDefined();
    });

    it('should export API_ENDPOINTS', () => {
        expect(API_ENDPOINTS).toBeDefined();
    });

    it('should export UI_CONSTANTS', () => {
        expect(UI_CONSTANTS).toBeDefined();
    });
});
