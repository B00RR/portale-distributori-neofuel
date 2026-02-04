import { describe, it, expect } from 'vitest';
// Correct path based on previous file content
import { Validators } from '../../js/shared/validators.js';

describe('Validators Module', () => {
    it('should validate email', () => {
        expect(Validators.email('test@example.com')).toBe(true);
        expect(Validators.email('invalid')).not.toBe(true);
    });

    it('should validate required', () => {
        expect(Validators.required('text')).toBe(true);
        expect(Validators.required('')).not.toBe(true);
    });
});
