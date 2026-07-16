import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import type { AppSupabaseClient } from '../../js/core/api.js';
import {
  computeExportSummaryMetrics,
  createPopulatedClosureWorkbook,
  fetchShiftPistolsForBulkExport,
  type ExportMetrics
} from '../../js/utils/export_utils.js';
import { closureTemplateXlsxBase64 } from '../../js/utils/template_chiusura_base64.js';
import { base64ToArrayBuffer } from '../../js/utils/utils.js';

type QueryResult = {
  data: unknown;
  error: Error | null;
};

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: PromiseLike<QueryResult>['then'];
};

type TableFixture = {
  data: unknown;
  error?: Error | null;
};

function createQueryChain(fixture: TableFixture): QueryChain {
  const result: QueryResult = { data: fixture.data, error: fixture.error ?? null };
  const chain = {} as QueryChain;

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  chain.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);

  return chain;
}

function createAdminClient(fixtures: Record<string, TableFixture>): {
  client: AppSupabaseClient;
  from: ReturnType<typeof vi.fn>;
  queries: Record<string, QueryChain[]>;
} {
  const queries: Record<string, QueryChain[]> = {};
  const from = vi.fn((tableName: string) => {
    const chain = createQueryChain(fixtures[tableName] ?? { data: null });
    queries[tableName] ??= [];
    queries[tableName]?.push(chain);
    return chain;
  });

  return {
    client: { from } as unknown as AppSupabaseClient,
    from,
    queries
  };
}

function createPistola(
  id: number,
  nome: string,
  tipoCarburante: string,
  islandId: number,
  islandName: string
): {
  id: number;
  nome: string;
  tipo_carburante: string;
  island_id: number;
  islands: { island_id: number; island_name: string; nome: string };
} {
  return {
    id,
    nome,
    tipo_carburante: tipoCarburante,
    island_id: islandId,
    islands: { island_id: islandId, island_name: islandName, nome: islandName }
  };
}

function createWorkbookMetrics(sections: ExportMetrics['sections'] = []): ExportMetrics {
  return {
    meta: {
      stationSlug: 'neofuel',
      dateSlug: '2026-07-14',
      dateDisplay: '14/07/2026',
      prices: { gasolio: 1.7, benzina: 1.8 },
      totals: {
        ltGasolio: 10,
        ltBenzina: 5,
        ltOther: 0,
        euroGasolio: 17,
        euroBenzina: 9,
        totalEuro: 26
      }
    },
    sections,
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
}

function getXmlCell(document: Document, address: string): Element {
  const cell = Array.from(document.getElementsByTagName('c')).find(
    candidate => candidate.getAttribute('r') === address
  );
  if (!cell) {
    throw new Error(`Cella ${address} non trovata nel test`);
  }
  return cell;
}

function getNumericCellValue(document: Document, address: string): number {
  return Number(getXmlCell(document, address).getElementsByTagName('v')[0]?.textContent);
}

describe('computeExportSummaryMetrics', () => {
  it('adatta lo schema corrente e calcola contatori, prezzi e incassi dalla chiusura', async () => {
    const { client, from } = createAdminClient({});

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        id: 44,
        station_id: 10,
        closed_at: '2026-07-03T08:30:00.000Z',
        created_at: '2026-07-03T08:00:00.000Z',
        fuel_stations: { station_name: 'Neofuel Centro' },
        closing_data: {
          prezzo_gasolio: 1.7,
          prezzo_benzina: 1.9,
          scontrino_self: {
            banconote_incassate: 100,
            banconote_erogate: 20,
            bancomat_erogati: 40,
            transazioni_uta: 5
          },
          dettaglio_incasso: {
            contanti_operatore: 120.5,
            pos_operatore: 85,
            crediti: 30,
            uta_dkv_operatore: 7
          }
        },
        shift_pistols: [
          {
            pistola_id: 1,
            opened_at_counter: 100,
            closed_at_counter: 150,
            liters_dispensed: 50,
            pistole: createPistola(1, 'Gasolio 1', 'gasolio', 2, 'Isola 2')
          },
          {
            pistola_id: 2,
            opened_at_counter: 200,
            closed_at_counter: 230,
            liters_dispensed: 30,
            pistole: createPistola(2, 'Benzina Verde', 'benzina', 1, 'Isola 1')
          }
        ]
      },
      10
    );

    expect(from).not.toHaveBeenCalled();
    expect(metrics.meta.stationSlug).toBe('neofuel-centro');
    expect(metrics.meta.dateSlug).toBe('2026-07-03');
    expect(metrics.meta.prices).toMatchObject({ gasolio: 1.7, benzina: 1.9 });
    expect(metrics.meta.totals).toEqual({
      ltGasolio: 50,
      ltBenzina: 30,
      ltOther: 0,
      euroGasolio: 85,
      euroBenzina: 57,
      totalEuro: 142
    });
    expect(metrics.sections.map(section => section.label)).toEqual(['Isola 1', 'Isola 2']);
    expect(metrics.sections[0]?.pistole[0]).toMatchObject({
      label: 'Benzina Verde',
      apertura: 200,
      chiusura: 230,
      venduti: 30,
      totaleEuro: 57,
      tipo: 'benzina',
      tipoSigla: 'B'
    });
    expect(metrics.summary).toEqual({
      self: 80,
      carteSelf: 40,
      contanti: 120.5,
      cartePos: 85,
      nonErogato: 0,
      lubrAdblue: 0,
      crediti: 30,
      utaDkv: 12
    });
  });

  it('carica le pistole mancanti con una sola query relazionale tipizzata', async () => {
    const shiftPistols = [
      {
        pistola_id: 7,
        opened_at_counter: 10,
        closed_at_counter: 25,
        liters_dispensed: 15,
        pistole: createPistola(7, 'Diesel HiQ', 'gasolio', 3, 'Isola 3')
      }
    ];
    const { client, from, queries } = createAdminClient({
      shift_pistols: { data: shiftPistols }
    });

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        id: 99,
        fuel_stations: { station_name: 'Stazione Nord' },
        closing_data: { prezzo_gasolio: 2 }
      },
      3
    );

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('shift_pistols');
    const query = queries.shift_pistols?.[0];
    expect(query?.select).toHaveBeenCalledWith(
      expect.stringContaining('pistole!shift_pistols_pistola_id_fkey')
    );
    expect(query?.select).toHaveBeenCalledWith(
      expect.stringContaining('islands!pistole_island_fk')
    );
    expect(query?.eq).toHaveBeenCalledWith('shift_id', 99);
    expect(query?.order).toHaveBeenCalledWith('pistola_id', { ascending: true });
    expect(metrics.meta.totals).toMatchObject({
      ltGasolio: 15,
      euroGasolio: 30,
      totalEuro: 30
    });
    expect(metrics.sections[0]?.pistole[0]?.tipo).toBe('gasolio');
  });

  it('carica le pistole di più turni con una sola query per il bulk export', async () => {
    const { client, from, queries } = createAdminClient({
      shift_pistols: {
        data: [
          {
            shift_id: 10,
            pistola_id: 1,
            opened_at_counter: 0,
            closed_at_counter: 10,
            liters_dispensed: 10,
            pistole: createPistola(1, 'Gasolio 1', 'gasolio', 1, 'Isola 1')
          },
          {
            shift_id: 20,
            pistola_id: 2,
            opened_at_counter: 5,
            closed_at_counter: 12,
            liters_dispensed: 7,
            pistole: createPistola(2, 'Benzina 1', 'benzina', 2, 'Isola 2')
          }
        ]
      }
    });

    const byShift = await fetchShiftPistolsForBulkExport(client, [10, 20, 10]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('shift_pistols');
    const query = queries.shift_pistols?.[0];
    expect(query?.select).toHaveBeenCalledWith(expect.stringContaining('shift_id'));
    expect(query?.in).toHaveBeenCalledWith('shift_id', [10, 20]);
    expect(query?.order).toHaveBeenCalledWith('pistola_id', { ascending: true });
    expect(byShift.get(10)).toHaveLength(1);
    expect(byShift.get(20)?.[0]).toMatchObject({ pistola_id: 2, liters_dispensed: 7 });
    expect(byShift.get(20)?.[0]).not.toHaveProperty('shift_id');
  });

  it('propaga gli errori PostgREST senza produrre un export parziale', async () => {
    const queryError = new Error('permission denied for shift_pistols');
    const { client } = createAdminClient({
      shift_pistols: { data: null, error: queryError }
    });

    await expect(
      computeExportSummaryMetrics(
        client,
        { id: 12, fuel_stations: { station_name: 'Neofuel' }, closing_data: {} },
        1
      )
    ).rejects.toBe(queryError);
  });

  it('propaga anche gli errori di caricamento della stazione', async () => {
    const queryError = new Error('station lookup failed');
    const { client } = createAdminClient({
      fuel_stations: { data: null, error: queryError }
    });

    await expect(
      computeExportSummaryMetrics(client, { shift_pistols: [], closing_data: {} }, 7)
    ).rejects.toBe(queryError);
  });

  it('rifiuta relazioni pistola mancanti invece di usare etichette fittizie', async () => {
    const { client } = createAdminClient({});

    await expect(
      computeExportSummaryMetrics(
        client,
        {
          fuel_stations: { station_name: 'Neofuel' },
          closing_data: {},
          shift_pistols: [
            {
              pistola_id: 404,
              opened_at_counter: 0,
              closed_at_counter: 0,
              liters_dispensed: 0,
              pistole: null
            }
          ]
        },
        1
      )
    ).rejects.toThrow('Pistola 404 non disponibile');
  });

  it('gestisce un turno valido senza pistole con totali a zero', async () => {
    const { client } = createAdminClient({});

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        fuel_stations: { station_name: 'Neofuel' },
        closing_data: {},
        shift_pistols: []
      },
      1
    );

    expect(metrics.sections).toEqual([]);
    expect(metrics.meta.totals).toEqual({
      ltGasolio: 0,
      ltBenzina: 0,
      ltOther: 0,
      euroGasolio: 0,
      euroBenzina: 0,
      totalEuro: 0
    });
  });

  it('mantiene il riepilogo delle chiusure salvate nel formato storico', async () => {
    const { client } = createAdminClient({});

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        fuel_stations: { station_name: 'Neofuel' },
        closing_data: {
          cash_in_finale: 50,
          cash_out_finale: 5,
          incasso_contanti: 100,
          incasso_pos: 80,
          incasso_uta_dkv: 20,
          non_erogato: 4
        },
        shift_pistols: []
      },
      1
    );

    expect(metrics.summary).toMatchObject({
      self: 45,
      contanti: 100,
      cartePos: 80,
      utaDkv: 20,
      nonErogato: 4
    });
  });

  it('usa i fallback storici per campo quando i dati annidati sono solo parziali', async () => {
    const { client } = createAdminClient({});

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        fuel_stations: { station_name: 'Neofuel' },
        closing_data: {
          cash_in_finale: 50,
          cash_out_finale: 5,
          incasso_contanti: 100,
          incasso_pos: 80,
          incasso_uta_dkv: 20,
          scontrino_self: { bancomat_erogati: 30 },
          dettaglio_incasso: { crediti: 7 }
        },
        shift_pistols: []
      },
      1
    );

    expect(metrics.summary).toMatchObject({
      self: 45,
      carteSelf: 30,
      contanti: 100,
      cartePos: 80,
      crediti: 7,
      utaDkv: 20
    });
  });

  it('normalizza i valori numerici non validi senza introdurre NaN', async () => {
    const { client } = createAdminClient({});

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        fuel_stations: { station_name: 'Neofuel' },
        closing_data: {
          prezzo_gasolio: 'invalid',
          dettaglio_incasso: { contanti_operatore: 'invalid' }
        },
        shift_pistols: [
          {
            pistola_id: 1,
            opened_at_counter: 0,
            closed_at_counter: null,
            liters_dispensed: null,
            pistole: createPistola(1, 'Gasolio 2', 'gasolio', 1, 'Isola 1')
          }
        ]
      },
      null
    );

    expect(metrics.sections[0]?.pistole[0]).toMatchObject({
      chiusura: 0,
      apertura: 0,
      venduti: 0,
      totaleEuro: 0
    });
    expect(metrics.meta.totals.totalEuro).toBe(0);
    expect(metrics.summary.contanti).toBe(0);
  });

  it('arrotonda i prezzi per evitare errori di accumulo IEEE754', async () => {
    const { client } = createAdminClient({});

    // 20 rows: 10.1 liters at 1.5 €/L = 15.15 € per row (rounded)
    // Total euro: 20 * 15.15 = 303 euros exactly (no floating-point drift)
    const shiftPistols = Array.from({ length: 20 }, (_, i) => ({
      pistola_id: i + 1,
      opened_at_counter: i * 10,
      closed_at_counter: i * 10 + 10,
      liters_dispensed: 10.1,
      pistole: createPistola(i + 1, `Gasolio ${i + 1}`, 'gasolio', 1, 'Isola 1')
    }));

    const metrics = await computeExportSummaryMetrics(
      client,
      {
        fuel_stations: { station_name: 'Neofuel' },
        closing_data: { prezzo_gasolio: 1.5 },
        shift_pistols: shiftPistols
      },
      1
    );

    // Each pistola should round 10.1 * 1.5 = 15.15 to exactly 15.15 €
    metrics.sections[0]?.pistole.forEach(pistola => {
      expect(pistola.totaleEuro).toBe(15.15);
    });

    // Total euro should be exactly 20 * 15.15 = 303, no drift from accumulating unrounded values
    expect(metrics.meta.totals.euroGasolio).toBe(303); // 20 * 15.15 exactly
    expect(metrics.meta.totals.totalEuro).toBe(303);
  });
});

describe('createPopulatedClosureWorkbook', () => {
  it('preserva la struttura OOXML quando aggiorna una cella self-closing', async () => {
    const templateBuffer = base64ToArrayBuffer(closureTemplateXlsxBase64);
    expect(templateBuffer).not.toBeNull();

    const originalArchive = await JSZip.loadAsync(templateBuffer as ArrayBuffer);
    const originalSheet = await originalArchive.file('xl/worksheets/sheet1.xml')?.async('string');
    expect(originalSheet).toBeTruthy();

    const metrics = createWorkbookMetrics();

    const populatedBlob = await createPopulatedClosureWorkbook(metrics);
    const populatedArchive = await JSZip.loadAsync(await populatedBlob.arrayBuffer());
    const populatedSheet = await populatedArchive.file('xl/worksheets/sheet1.xml')?.async('string');
    expect(populatedSheet).toBeTruthy();

    const originalRows = originalSheet?.match(/<row\b/gu) ?? [];
    const populatedRows = populatedSheet?.match(/<row\b/gu) ?? [];
    expect(populatedRows).toHaveLength(originalRows.length);
    expect(populatedSheet?.match(/\br="V6"/gu)).toHaveLength(1);
    expect(populatedSheet).toContain('<row r="7"');
    expect(populatedSheet).toContain('<row r="8"');
    expect(populatedSheet).toContain('r="A9"');

    const parsed = new DOMParser().parseFromString(populatedSheet ?? '', 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(getXmlCell(parsed, 'V6').getAttribute('t')).toBeNull();
    expect(getNumericCellValue(parsed, 'V6')).toBe(15);

    expect(populatedArchive.file('xl/calcChain.xml')).toBeNull();
    const relationships = await populatedArchive
      .file('xl/_rels/workbook.xml.rels')
      ?.async('string');
    const contentTypes = await populatedArchive.file('[Content_Types].xml')?.async('string');
    const workbook = await populatedArchive.file('xl/workbook.xml')?.async('string');
    expect(relationships).not.toContain('calcChain');
    expect(contentTypes).not.toContain('calcChain');
    expect(workbook).toContain('fullCalcOnLoad="1"');
    expect(workbook).toContain('forceFullCalc="1"');
  });

  it('materializza i subtotali dai dati effettivi senza formule hardcoded', async () => {
    const metrics = createWorkbookMetrics([
      {
        id: 1,
        label: 'Isola 1',
        pistole: [
          {
            label: 'Diesel',
            apertura: 0,
            chiusura: 10,
            venduti: 10,
            totaleEuro: 17,
            tipo: 'gasolio',
            tipoSigla: 'D'
          },
          {
            label: 'Benzina',
            apertura: 0,
            chiusura: 5,
            venduti: 5,
            totaleEuro: 9,
            tipo: 'benzina',
            tipoSigla: 'B'
          }
        ]
      }
    ]);

    const blob = await createPopulatedClosureWorkbook(metrics);
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const sheetXml = await archive.file('xl/worksheets/sheet1.xml')?.async('string');
    const sheet = new DOMParser().parseFromString(sheetXml ?? '', 'application/xml');

    expect(getNumericCellValue(sheet, 'O18')).toBe(10);
    expect(getNumericCellValue(sheet, 'U18')).toBe(17);
    expect(getNumericCellValue(sheet, 'O19')).toBe(5);
    expect(getNumericCellValue(sheet, 'U19')).toBe(9);
    expect(sheetXml).not.toContain('<f');
  });

  it('rifiuta dati che il template troncherebbe', async () => {
    const fourIslands = createWorkbookMetrics(
      [1, 2, 3, 4].map(id => ({ id, label: `Isola ${id}`, pistole: [] }))
    );
    await expect(createPopulatedClosureWorkbook(fourIslands)).rejects.toThrow(
      'supporta al massimo 3 isole'
    );

    const oversizedThirdIsland = createWorkbookMetrics([
      { id: 1, label: 'Isola 1', pistole: [] },
      { id: 2, label: 'Isola 2', pistole: [] },
      {
        id: 3,
        label: 'Isola 3',
        pistole: [1, 2, 3].map(id => ({
          label: `Pistola ${id}`,
          apertura: 0,
          chiusura: 0,
          venduti: 0,
          totaleEuro: 0,
          tipo: 'gasolio',
          tipoSigla: 'D'
        }))
      }
    ]);
    await expect(createPopulatedClosureWorkbook(oversizedThirdIsland)).rejects.toThrow(
      'supporta al massimo 2'
    );
  });
});
