import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';

import { computeExportSummaryMetrics } from '../../js/utils/export_utils.js';

type TableFixture = Record<string, unknown> | Record<string, unknown>[] | null;

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (resolve: (value: { data: TableFixture; error: null }) => unknown) => Promise<unknown>;
};

function createQueryChain(data: TableFixture): QueryChain {
  const result = { data, error: null };
  const chain = {} as QueryChain;

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  chain.then = resolve => Promise.resolve(resolve(result));

  return chain;
}

function createAdminClient(fixtures: Record<string, TableFixture>): SupabaseClient {
  return {
    from: vi.fn((tableName: string) => createQueryChain(fixtures[tableName] ?? null))
  } as unknown as SupabaseClient;
}

describe('computeExportSummaryMetrics', () => {
  it('calcola totali, sezioni e riepilogo incassi da shift_pistols inline', async () => {
    const adminClient = createAdminClient({
      fuel_stations: { station_name: 'Neofuel Centro' }
    });

    const metrics = await computeExportSummaryMetrics(
      adminClient,
      {
        closed_at: '2026-07-03T08:30:00.000Z',
        prezzi: { gasolio: 1.7, benzina: 1.9 },
        incassi: {
          contanti: 120.5,
          pos: 85,
          credito: 30,
          self_service: 40,
          non_erogato: 5,
          accessori: 12.25
        },
        shift_pistols: [
          {
            pistol_id: 1,
            start_counter: 100,
            end_counter: 150,
            liters_dispensed: 50,
            end_price: 1.7,
            pistols: {
              pistol_name: 'Gasolio 1',
              fuel_pumps: {
                pump_name: 'Pompa 1',
                island_id: 2,
                islands: { island_name: 'Isola 2' }
              }
            }
          },
          {
            pistol_id: 2,
            start_counter: 200,
            end_counter: 230,
            liters_dispensed: 30,
            end_price: 1.9,
            pistols: {
              pistol_name: 'Benzina Verde',
              fuel_pumps: {
                pump_name: 'Pompa 2',
                island_id: 1,
                islands: { island_name: 'Isola 1' }
              }
            }
          }
        ]
      },
      10
    );

    expect(metrics.meta.stationSlug).toBe('neofuel-centro');
    expect(metrics.meta.dateSlug).toBe('2026-07-03');
    expect(metrics.meta.prices).toEqual({ gasolio: 1.7, benzina: 1.9 });
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
      label: 'Pompa 2 Benzina Verde',
      venduti: 30,
      totaleEuro: 57,
      tipo: 'benzina',
      tipoSigla: 'B'
    });
    expect(metrics.sections[1]?.pistole[0]).toMatchObject({
      label: 'Pompa 1 Gasolio 1',
      venduti: 50,
      totaleEuro: 85,
      tipo: 'gasolio',
      tipoSigla: 'D'
    });
    expect(metrics.summary).toMatchObject({
      contanti: 120.5,
      cartePos: 85,
      crediti: 30,
      self: 40,
      nonErogato: 5,
      lubrAdblue: 12.25
    });
  });

  it('inferisce tipo carburante e sigla da gasolio, benzina e adblue', async () => {
    const metrics = await computeExportSummaryMetrics(
      createAdminClient({}),
      {
        shift_pistols: [
          { pistol_id: 1, liters_dispensed: 10, end_price: 2, pistols: { pistol_name: 'Diesel HiQ' } },
          { pistol_id: 2, liters_dispensed: 5, end_price: 3, pistols: { pistol_name: 'Verde 95' } },
          { pistol_id: 3, liters_dispensed: 7, end_price: 1, pistols: { pistol_name: 'AdBlue' } }
        ]
      },
      null
    );

    const pistole = metrics.sections.flatMap(section => section.pistole);

    expect(pistole.map(pistola => pistola.tipo)).toEqual(['supreme', 'benzina', 'adblue']);
    expect(pistole.map(pistola => pistola.tipoSigla)).toEqual(['S', 'B', 'A']);
    expect(metrics.meta.totals.ltBenzina).toBe(5);
    expect(metrics.meta.totals.ltOther).toBe(17);
    expect(metrics.meta.totals.totalEuro).toBe(42);
  });

  it('gestisce chiusure vuote o parziali senza eccezioni e con totali a zero', async () => {
    const metrics = await computeExportSummaryMetrics(createAdminClient({}), {}, null);

    expect(metrics.sections).toEqual([]);
    expect(metrics.meta.totals).toEqual({
      ltGasolio: 0,
      ltBenzina: 0,
      ltOther: 0,
      euroGasolio: 0,
      euroBenzina: 0,
      totalEuro: 0
    });
    expect(metrics.summary).toEqual({
      self: 0,
      carteSelf: 0,
      contanti: 0,
      cartePos: 0,
      nonErogato: 0,
      lubrAdblue: 0,
      crediti: 0,
      utaDkv: 0
    });
  });

  it('normalizza valori numerici non validi evitando NaN nelle metriche', async () => {
    const metrics = await computeExportSummaryMetrics(
      createAdminClient({}),
      {
        incassi: { contanti: 'not-a-number', pos: undefined },
        shift_pistols: [
          {
            pistol_id: 1,
            start_counter: 'inizio',
            end_counter: undefined,
            liters_dispensed: 'NaN',
            end_price: 'invalid',
            pistols: {
              pistol_name: 'Gasolio 2',
              fuel_pumps: { pump_name: 'Pompa 3', island_id: 1, islands: { island_name: 'Isola 1' } }
            }
          }
        ]
      },
      null
    );

    expect(metrics.sections[0]?.pistole[0]).toMatchObject({
      chiusura: 0,
      apertura: 0,
      venduti: 0,
      totaleEuro: 0,
      tipo: 'gasolio',
      tipoSigla: 'D'
    });
    expect(metrics.meta.totals.euroGasolio).toBe(0);
    expect(metrics.meta.totals.totalEuro).toBe(0);
    expect(metrics.summary.contanti).toBe(0);
    expect(metrics.summary.cartePos).toBe(0);
  });
});
