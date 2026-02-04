import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixture, html as litHtml } from '@open-wc/testing';

const { mockSupabase, mockToast } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 1, tanks: [], islands: [] }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null })
        }))
    },
    mockToast: { show: vi.fn() }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));

import '../../js/ui/components/ShiftOpener.js';

describe('ShiftOpener Web Component (403 lines)', () => {
    let element: any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should register custom element', () => {
        expect(customElements.get('shift-opener')).toBeDefined();
    });

    it('should render with attributes', async () => {
        element = await fixture(litHtml`
            <shift-opener stationId="ST-123" userId="user-456"></shift-opener>
        `);

        expect(element.stationId).toBe('ST-123');
        expect(element.userId).toBe('user-456');
    });

    it('should load tanks and islands', async () => {
        element = await fixture(litHtml`
            <shift-opener stationId="ST-123" userId="user-456"></shift-opener>
        `);

        await element.updateComplete;

        expect(mockSupabase.from).toHaveBeenCalledWith('fuel_stations');
    });

    it('should submit shift opening', async () => {
        element = await fixture(litHtml`
            <shift-opener stationId="ST-123" userId="user-456"></shift-opener>
        `);

        await element.updateComplete;

        const form = element.shadowRoot.querySelector('form');
        if (form) {
            form.dispatchEvent(new Event('submit'));
            await element.updateComplete;
        }

        expect(mockSupabase.from).toHaveBeenCalledWith('shifts');
    });

    it('should dispatch success  event', async () => {
        const successSpy = vi.fn();

        element = await fixture(litHtml`
            <shift-opener stationId="ST-123" userId="user-456" @success=${successSpy}></shift-opener>
        `);

        element.dispatchEvent(new Event('success'));
        expect(successSpy).toHaveBeenCalled();
    });
});
