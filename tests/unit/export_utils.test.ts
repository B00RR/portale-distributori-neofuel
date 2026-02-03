import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    computeExportSummaryMetrics,
    fetchClosureExportData,
    generateClosureExcel,
    generateMultiClosureExcel,
    type ExportMetrics,
    type ExportPistola,
    type ExportSection
} from '../../js/utils/export_utils.js';

// Mock dependencies
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
                })),
                in: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
        }))
    }
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

vi.mock('../../js/utils/utils.js', () => ({
    formatDate: vi.fn((date) => date || '2024-01-01'),
    slugifyLabel: vi.fn((label) => label?.toLowerCase().replace(/\s+/g, '-') || 'slug'),
    base64ToArrayBuffer: vi.fn((base64) => new ArrayBuffer(100))
}));

vi.mock('../../js/utils/template_chiusura_base64.js', () => ({
    closureTemplateXlsxBase64: 'mock-base64-template-data'
}));

describe('Export Utils Module', () => {

    describe('computeExportSummaryMetrics', () => {

        it('should return empty metrics for minimal closure', async () => {
            const mockClient = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({ data: { station_name: 'Test Station' }, error: null }))
                        })),
                        in: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            };

            const closure = {
                id: 1,
                closed_at: '2024-01-01T10:00:00Z',
                shift_pistols: [],
                incassi: {}
            };

            const result = await computeExportSummaryMetrics(mockClient, closure, 1);

            expect(result).toBeDefined();
            expect(result.meta).toBeDefined();
            expect(result.sections).toEqual([]);
            expect(result.summary).toBeDefined();
        });

        it('should compute metrics with pistol data', async () => {
            const mockClient = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({
                                data: { station_name: 'Station A' },
                                error: null
                            }))
                        })),
                        in: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            };

            const closure = {
                id: 1,
                closed_at: '2024-01-15T12:00:00Z',
                shift_pistols: [
                    {
                        pistol_id: 1,
                        liters_dispensed: 100,
                        end_price: 1.5,
                        end_counter: 1000,
                        start_counter: 900,
                        pistols: {
                            pistol_name: 'Pistola Gasolio 1',
                            fuel_pumps: {
                                pump_name: 'Pompa 1',
                                island_id: 1,
                                islands: { island_name: 'Isola A' }
                            }
                        }
                    }
                ],
                incassi: {
                    contanti: 100,
                    pos: 50,
                    credito: 20
                }
            };

            const result = await computeExportSummaryMetrics(mockClient, closure, 1);

            expect(result.sections.length).toBeGreaterThan(0);
            expect(result.meta.totals.ltGasolio).toBe(100);
            expect(result.meta.totals.euroGasolio).toBe(150);
            expect(result.summary.contanti).toBe(100);
            expect(result.summary.cartePos).toBe(50);
        });

        it('should handle missing station data', async () => {
            const mockClient = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({ data: null, error: new Error('Not found') }))
                        }))
                    }))
                }))
            };

            const closure = { id: 1, shift_pistols: [] };

            const result = await computeExportSummaryMetrics(mockClient, closure, null);

            expect(result).toBeDefined();
            expect(result.meta.stationSlug).toBe('stazione');
        });

        it('should classify fuel types correctly', async () => {
            const mockClient = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({ data: { station_name: 'Test' }, error: null }))
                        })),
                        in: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            };

            const closure = {
                id: 1,
                shift_pistols: [
                    {
                        pistol_id: 1,
                        liters_dispensed: 50,
                        end_price: 1.6,
                        end_counter: 500,
                        start_counter: 450,
                        pistols: {
                            pistol_name: 'Benzina Verde',
                            fuel_pumps: {
                                island_id: 1,
                                islands: { island_name: 'Isola 1' }
                            }
                        }
                    },
                    {
                        pistol_id: 2,
                        liters_dispensed: 75,
                        end_price: 1.4,
                        end_counter: 800,
                        start_counter: 725,
                        pistols: {
                            pistol_name: 'GPL Linea 2',
                            fuel_pumps: {
                                island_id: 2,
                                islands: { island_name: 'Isola 2' }
                            }
                        }
                    }
                ],
                incassi: {}
            };

            const result = await computeExportSummaryMetrics(mockClient, closure, 1);

            expect(result.meta.totals.ltBenzina).toBe(50);
            expect(result.meta.totals.ltOther).toBe(75); // GPL is 'altro'
        });

        it('should handle corrupt data gracefully', async () => {
            const mockClient = {
                from: vi.fn(() => ({
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({ data: { station_name: 'Test' }, error: null }))
                        }))
                    }))
                }))
            };

            const closure = {
                id: 1,
                shift_pistols: [
                    {
                        pistol_id: 'invalid',
                        liters_dispensed: 'abc',
                        end_price: null,
                        pistols: null
                    }
                ],
                incassi: { contanti: 'not-a-number' }
            };

            const result = await computeExportSummaryMetrics(mockClient, closure, 1);

            expect(result.summary.contanti).toBe(0); // Should default to 0
            expect(result.meta.totals.totalEuro).toBe(0);
        });
    });

    describe('fetchClosureExportData', () => {
        it('should fetch closure with enriched pistols', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: { id: 1, closed_at: '2024-01-01' },
                            error: null
                        }))
                    })),
                    in: vi.fn(() => Promise.resolve({
                        data: [
                            { pistol_id: 1, shift_id: 1, liters_dispensed: 100 }
                        ],
                        error: null
                    }))
                }))
            } as any);

            const result = await fetchClosureExportData(1);

            expect(result).toBeDefined();
            expect(result.id).toBe(1);
        });

        it('should throw error when closure not found', async () => {
            const { supabase } = await import('../../js/core/api.js');

            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({
                            data: null,
                            error: new Error('Not found')
                        }))
                    }))
                }))
            } as any);

            await expect(fetchClosureExportData(999)).rejects.toThrow();
        });
    });

    describe('generateClosureExcel', () => {
        it('should show error when XlsxPopulate not loaded', async () => {
            const { Toast } = await import('../../js/ui/toast.js');

            (window as any).XlsxPopulate = undefined;

            const mockData: ExportMetrics = {
                meta: {
                    stationSlug: 'test',
                    dateSlug: '2024-01-01',
                    dateDisplay: '01/01/2024',
                    prices: {},
                    totals: { ltGasolio: 0, ltBenzina: 0, ltOther: 0, euroGasolio: 0, euroBenzina: 0, totalEuro: 0 }
                },
                sections: [],
                summary: {
                    self: 0,
                    carteSelf: 0,
                    contanti: 0,
                    cartePos: 0,
                    nonErogato: 0,
                    lubrAdblue: 0,
                    crediti: 0,
                    utaDkv: 0
                }
            };

            await generateClosureExcel(mockData);

            expect(Toast.show).toHaveBeenCalledWith('Libreria Excel non caricata', 'error');
        });

        it('should generate Excel when library is loaded', async () => {
            const mockWorkbook = {
                sheet: vi.fn(() => ({
                    cell: vi.fn(() => ({
                        value: vi.fn()
                    }))
                })),
                outputAsync: vi.fn(() => Promise.resolve(new Blob(['test'])))
            };

            (window as any).XlsxPopulate = {
                fromDataAsync: vi.fn(() => Promise.resolve(mockWorkbook))
            };

            // Mock DOM methods
            const mockLink = {
                click: vi.fn(),
                href: '',
                download: ''
            };
            document.createElement = vi.fn(() => mockLink as any);
            document.body.appendChild = vi.fn();
            document.body.removeChild = vi.fn();

            const mockData: ExportMetrics = {
                meta: {
                    stationSlug: 'test',
                    dateSlug: '2024-01-01',
                    dateDisplay: '01/01/2024',
                    prices: { diesel_servito: 1.5 },
                    totals: { ltGasolio: 100, ltBenzina: 50, ltOther: 0, euroGasolio: 150, euroBenzina: 75, totalEuro: 225 }
                },
                sections: [],
                summary: {
                    self: 0,
                    carteSelf: 0,
                    contanti: 100,
                    cartePos: 50,
                    nonErogato: 0,
                    lubrAdblue: 0,
                    crediti: 20,
                    utaDkv: 0
                }
            };

            await generateClosureExcel(mockData);

            expect(mockWorkbook.outputAsync).toHaveBeenCalled();
        });
    });

    describe('generateMultiClosureExcel', () => {
        it('should show error when XlsxPopulate not loaded', async () => {
            const { Toast } = await import('../../js/ui/toast.js');

            (window as any).XlsxPopulate = undefined;

            await generateMultiClosureExcel([]);

            expect(Toast.show).toHaveBeenCalledWith('Libreria Excel non caricata', 'error');
        });

        it('should fall back to ZIP when clone not supported', async () => {
            const mockWorkbook = {
                sheet: vi.fn(() => ({
                    name: vi.fn(),
                    clone: undefined, // Not supported
                    cell: vi.fn(() => ({ value: vi.fn() }))
                })),
                sheets: vi.fn(() => []),
                outputAsync: vi.fn(() => Promise.resolve(new Blob(['test'])))
            };

            (window as any).XlsxPopulate = {
                fromDataAsync: vi.fn(() => Promise.resolve(mockWorkbook))
            };

            (window as any).JSZip = undefined;

            const mockData: ExportMetrics = {
                meta: {
                    stationSlug: 'test',
                    dateSlug: '2024-01-01',
                    dateDisplay: '01/01/2024',
                    prices: {},
                    totals: { ltGasolio: 0, ltBenzina: 0, ltOther: 0, euroGasolio: 0, euroBenzina: 0, totalEuro: 0 }
                },
                sections: [],
                summary: {
                    self: 0,
                    carteSelf: 0,
                    contanti: 0,
                    cartePos: 0,
                    nonErogato: 0,
                    lubrAdblue: 0,
                    crediti: 0,
                    utaDkv: 0
                }
            };

            await generateMultiClosureExcel([mockData]);

            const { Toast } = await import('../../js/ui/toast.js');
            expect(Toast.show).toHaveBeenCalledWith(
                expect.stringContaining('ZIP'),
                'warning'
            );
        });
    });
});
