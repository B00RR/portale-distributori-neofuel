import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    computeExportSummaryMetrics,
    fetchClosureExportData,
    generateMultiClosureExcel,
    ExportMetrics
} from '../../js/utils/export_utils.js';

// --- MOCKS ---

const mocks = vi.hoisted(() => ({
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    in: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: mocks.select,
            eq: mocks.eq,
            in: mocks.in,
            single: mocks.single
        }))
    }
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

// Template Base64 Mock
vi.mock('../../js/utils/template_chiusura_base64.js', () => ({
    closureTemplateXlsxBase64: 'base64simulatedcontent'
}));

// Utils (mock partial)
vi.mock('../../js/utils/utils.js', async (importOriginal) => {
    const mod = await importOriginal();
    return {
        ...(mod as any),
        base64ToArrayBuffer: vi.fn(() => new ArrayBuffer(8)),
        slugifyLabel: (s: string) => s ? s.toLowerCase().replace(/ /g, '-') : 'slug'
    };
});

describe('Export Utils Module', () => {

    // --- GLOBAL MOCKS (Window) ---
    let mockSheet: any;
    let mockWorkbook: any;
    let mockJSZip: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Supabase Chain Defaults
        mocks.select.mockReturnValue({ eq: mocks.eq, in: mocks.in });
        mocks.eq.mockReturnValue({ single: mocks.single });
        mocks.in.mockResolvedValue({ data: [], error: null });

        // DOM Mocks
        document.body.appendChild = vi.fn();
        document.body.removeChild = vi.fn();
        URL.createObjectURL = vi.fn(() => 'blob:url');

        // Excel Mock
        mockSheet = {
            cell: vi.fn().mockReturnThis(),
            value: vi.fn(),
            name: vi.fn(),
            clone: vi.fn().mockReturnThis(),
            delete: vi.fn(),
            active: vi.fn()
        };
        // clone returns a new sheet-like object (or self for simplicity in mock)
        mockSheet.clone.mockReturnValue({ ...mockSheet, name: vi.fn() });

        mockWorkbook = {
            sheet: vi.fn().mockReturnValue(mockSheet),
            sheets: vi.fn().mockReturnValue([mockSheet]),
            outputAsync: vi.fn().mockResolvedValue(new Blob(['excel'])),
        };

        (window as any).XlsxPopulate = {
            fromDataAsync: vi.fn().mockResolvedValue(mockWorkbook)
        };

        // JSZip Mock
        mockJSZip = {
            file: vi.fn(),
            generateAsync: vi.fn().mockResolvedValue(new Blob(['zip']))
        };
        (window as any).JSZip = vi.fn(() => mockJSZip);
    });

    describe('fetchClosureExportData', () => {
        it('should fetch and enrich closure data', async () => {
            const closureId = 123;
            const mockClosure = { id: 123, shift_id: 123, shift_pistols: [] };

            // 1. Fetch Closure
            mocks.single.mockResolvedValue({ data: mockClosure, error: null });

            // 2. Fetch Shift Pistols
            const mockSPs = [{ pistol_id: 1, liters: 10 }];
            mocks.eq.mockReturnValueOnce({ single: mocks.single }) // closure
                .mockReturnValueOnce({ data: mockSPs, error: null }); // shift_pistols query (no single)

            // Adjust mock chain for strict sequence:
            const { supabase } = await import('../../js/core/api.js');
            const fromSpy = supabase.from;

            (fromSpy as any).mockImplementation((table: string) => {
                if (table === 'shifts') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockClosure, error: null }) }) }) } as any;
                if (table === 'shift_pistols') return { select: () => ({ eq: () => Promise.resolve({ data: mockSPs, error: null }) }) } as any;
                if (table === 'pistols') return { select: () => ({ in: () => Promise.resolve({ data: [{ pistol_id: 1, pistol_name: 'P1' }], error: null }) }) } as any;
                return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) } as any;
            });

            const result = await fetchClosureExportData(closureId);

            expect(result.id).toBe(123);
            expect(result.shift_pistols[0].pistols.pistol_name).toBe('P1');
        });

        it('should throw error if closure not found', async () => {
            const { supabase } = await import('../../js/core/api.js');
            const fromSpy = supabase.from;
            (fromSpy as any).mockImplementation(() => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) } as any));

            await expect(fetchClosureExportData(999)).rejects.toThrow('Chiusura non trovata');
        });
    });

    describe('computeExportSummaryMetrics', () => {
        it('should compute metrics with pistol data', async () => {
            const closure = {
                shift_pistols: [
                    {
                        pistol_id: 1,
                        liters_dispensed: 10,
                        end_price: 2,
                        start_counter: 0,
                        end_counter: 10,
                        pistols: {
                            pistol_name: 'Gasolio 1',
                            fuel_pumps: {
                                pump_name: 'Pump 1',
                                island_id: 1,
                                islands: { island_name: 'Isola 1' }
                            }
                        }
                    }
                ],
                incassi: { contanti: 50 }
            };

            // Fix clientMock to support chaining .from().select().eq().single()
            // This is used for fetching station name if stationId is provided
            // We are passing null as stationId, so this branch might not be hit,
            // BUT let's be safe.
            const clientMock = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({ data: { station_name: 'Test Station' } })
                        }))
                    }))
                }))
            };

            const metrics = await computeExportSummaryMetrics(clientMock as any, closure, null);

            expect(metrics.sections.length).toBe(1);
            expect(metrics.sections[0].pistole[0].venduti).toBe(10);
            expect(metrics.sections[0].pistole[0].totaleEuro).toBe(20);
            expect(metrics.summary.contanti).toBe(50);
            expect(metrics.meta.totals.ltGasolio).toBe(10);
        });

        it('should handle missing station data', async () => {
            const clientMock = { from: vi.fn() }; // Won't be called if stationId null
            const metrics = await computeExportSummaryMetrics(clientMock as any, {}, null);
            expect(metrics.meta.stationSlug).toBe('stazione');
        });

        it('should classify all fuel types correctly', async () => {
            const closure = {
                shift_pistols: [
                    { pistol_id: 1, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'Benzina' } },
                    { pistol_id: 2, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'AdBlue' } },
                    { pistol_id: 3, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'Supreme Diesel' } },
                    { pistol_id: 4, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'GPL' } },
                    { pistol_id: 5, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'Metano' } },
                    { pistol_id: 6, liters_dispensed: 1, end_price: 1, pistols: { pistol_name: 'XYZ' } } // Fallback to 'other'
                ]
            };
            const clientMock = { from: vi.fn() };
            const metrics = await computeExportSummaryMetrics(clientMock as any, closure, null);

            // Check meta totals aggregation
            expect(metrics.meta.totals.ltBenzina).toBe(1);
            expect(metrics.meta.totals.ltOther).toBe(5); // AdBlue + Supreme + GPL + Metano + XYZ

            // Verify section details (siglas)
            const p = metrics.sections[0].pistole;
            // Benzina -> B
            expect(p.find(x => x.label.includes('Benzina'))?.tipoSigla).toBe('B');
            // AdBlue -> A
            expect(p.find(x => x.label.includes('AdBlue'))?.tipoSigla).toBe('A');
            // Supreme -> S
            expect(p.find(x => x.label.includes('Supreme'))?.tipoSigla).toBe('S');
            // GPL -> G
            expect(p.find(x => x.label.includes('GPL'))?.tipoSigla).toBe('G');
            // Metano -> M
            expect(p.find(x => x.label.includes('Metano'))?.tipoSigla).toBe('M');
            // XYZ -> ''
            expect(p.find(x => x.label.includes('XYZ'))?.tipoSigla).toBe('');
        });

        it('should handle broken pistol references', async () => {
            const closure = {
                shift_pistols: [
                    {
                        pistol_id: 99,
                        liters_dispensed: 0,
                        end_price: 0,
                        pistols: null // Broken usage
                    }
                ]
            };
            const clientMock = { from: vi.fn() };
            const metrics = await computeExportSummaryMetrics(clientMock as any, closure, null);

            expect(metrics.sections[0].pistole[0].label).toContain('Pistola 99');
            expect(metrics.sections[0].label).toBe('Isola ?');
        });
    });

    describe('generateMultiClosureExcel', () => {
        const dummyMetrics: ExportMetrics = {
            meta: { dateSlug: '2023-01-01', totals: {}, prices: {} } as any,
            sections: [],
            summary: {} as any
        };

        let cleanupXlsx: any;
        let cleanupZip: any;

        beforeEach(async () => {
            // Clear Toast mock
            const { Toast } = await import('../../js/ui/toast.js');
            (Toast.show as any).mockClear();

            // Save original
            cleanupXlsx = (window as any).XlsxPopulate;
            cleanupZip = (window as any).JSZip;

            // Re-setup default success spies for this block
            (window as any).XlsxPopulate = {
                fromDataAsync: vi.fn().mockImplementation(async () => {
                    return mockWorkbook;
                })
            };
            (window as any).JSZip = vi.fn(() => mockJSZip);

            // Ensure mockSheet is fresh
            mockSheet.clone.mockClear();
            // Re-apply return value just in case
            mockSheet.clone.mockReturnValue({ ...mockSheet, name: vi.fn() });
        });

        afterEach(() => {
            // Restore
            if (cleanupXlsx !== undefined) (window as any).XlsxPopulate = cleanupXlsx;
            if (cleanupZip !== undefined) (window as any).JSZip = cleanupZip;
        });

        // Use .only to isolate this test first
        it('should generate multi-sheet Excel using clone', async () => {
            await generateMultiClosureExcel([dummyMetrics, dummyMetrics]);

            expect((window as any).XlsxPopulate.fromDataAsync).toHaveBeenCalled();

            // We expect clone to be called for EACH item in the array (2 times)
            // But wait, the loop is i=0..len.
            // Inside loop: newSheet = templateSheet.clone().
            // Yes.
            expect(mockSheet.clone).toHaveBeenCalled();
            expect(mockWorkbook.outputAsync).toHaveBeenCalled();
            expect(document.body.appendChild).toHaveBeenCalled();

            const link = (document.body.appendChild as any).mock.calls[0][0];
            expect(link.download).toContain('.xlsx');
        });

        it('should warn if library missing', async () => {
            (window as any).XlsxPopulate = undefined;
            const { Toast } = await import('../../js/ui/toast.js');

            await generateMultiClosureExcel([dummyMetrics]);

            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('non caricata'), 'error');
        });

        it('should fall back to ZIP when clone not supported', async () => {
            mockSheet.clone = undefined;

            const { Toast } = await import('../../js/ui/toast.js');

            await generateMultiClosureExcel([dummyMetrics]);

            expect((window as any).JSZip).toHaveBeenCalled();
            expect(Toast.show).toHaveBeenCalled();
        });

        it('should handle ZIP failure', async () => {
            mockSheet.clone = undefined;
            mockJSZip.generateAsync.mockRejectedValue(new Error('ZIP Boom'));
            const { Toast } = await import('../../js/ui/toast.js');

            await generateMultiClosureExcel([dummyMetrics]);

            expect(Toast.show).toHaveBeenCalledWith(expect.stringContaining('Errore fatale'), 'error');
        });
    });
});
