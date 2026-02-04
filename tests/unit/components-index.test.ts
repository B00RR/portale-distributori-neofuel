import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all component files to prevent side effects (customElement definition) during this test
// We just want to verifying the index file exports/imports them.
vi.mock('../../js/ui/components/ClosureWizard.js', () => ({}));
vi.mock('../../js/ui/components/ShiftOpener.js', () => ({}));
vi.mock('../../js/ui/components/ProductCard.js', () => ({}));
vi.mock('../../js/ui/components/TransactionList.js', () => ({}));
// Add others if index.ts grows

describe('Components Index', () => {
    it('should load without error', async () => {
        const modules = await import('../../js/ui/components/index.js');
        expect(modules).toBeDefined();
    });
});
