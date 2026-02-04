import { describe, it, expect, vi, beforeEach } from 'vitest';
import { store, type User, type Station } from '../../js/shared/state.js';

describe('State Module', () => {
    beforeEach(() => {
        store.setLoading(false);
    });

    // ... Other tests ...

    describe('subscribe and notify', () => {
        it('should handle multiple subscribe/unsubscribe cycles', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();

            const unsub1 = store.subscribe(cb1);
            const unsub2 = store.subscribe(cb2);

            store.setLoading(true);
            expect(cb1).toHaveBeenCalledTimes(1);
            expect(cb2).toHaveBeenCalledTimes(1);

            unsub1();
            store.setLoading(false);
            expect(cb1).toHaveBeenCalledTimes(1); // Not called again
            expect(cb2).toHaveBeenCalledTimes(2);

            unsub2();
            store.setLoading(true);
            expect(cb2).toHaveBeenCalledTimes(2); // Not called
        });
    });
});
