import { describe, expect, it } from 'vitest';

import {
  aggregateShiftAnalytics,
  createEmptyAnalyticsTotals,
  createEmptyDayStats,
  createItalianCalendarRange
} from '../../js/admin/analytics-aggregation.js';

describe('Analytics aggregation', () => {
  it.each([
    {
      label: 'numeric values',
      closingData: {
        ricavo_teorico: 100,
        litri_benzina: 40,
        litri_gasolio: 60,
        scontrino_self: {
          banconote_incassate: 20,
          banconote_erogate: 5,
          bancomat_erogati: 10,
          transazioni_uta: 7,
          id_gestore: 6
        },
        dettaglio_incasso: {
          contanti_operatore: 35,
          pos_operatore: 20,
          crediti: 15,
          voucher: 5,
          uta_dkv_operatore: 8
        }
      }
    },
    {
      label: 'numeric strings',
      closingData: {
        ricavo_teorico: '100',
        litri_benzina: '40',
        litri_gasolio: '60',
        scontrino_self: {
          banconote_incassate: '20',
          banconote_erogate: '5',
          bancomat_erogati: '10',
          transazioni_uta: '7',
          id_gestore: '6'
        },
        dettaglio_incasso: {
          contanti_operatore: '35',
          pos_operatore: '20',
          crediti: '15',
          voucher: '5',
          uta_dkv_operatore: '8'
        }
      }
    }
  ])('aggregates all metrics from $label', ({ closingData }) => {
    const result = aggregateShiftAnalytics(
      [{ closed_at: '2026-07-02T18:30:00.000Z', closing_data: closingData }],
      [createEmptyDayStats('2026-07-02')]
    );

    expect(result).toEqual({
      daily: [
        {
          date: '2026-07-02',
          revenue: 100,
          liters_benzina: 40,
          liters_gasolio: 60
        }
      ],
      totals: {
        benzina: 40,
        gasolio: 60,
        contanti: 50,
        pos: 30,
        crediti: 15,
        voucher: 5,
        utaDkv: 15,
        idGestore: 6,
        revenue: 100
      }
    });
  });

  it('sums multiple shifts and returns seeded days in chronological order', () => {
    const result = aggregateShiftAnalytics(
      [
        {
          closed_at: '2026-07-01T18:00:00.000Z',
          closing_data: {
            ricavo_teorico: 10,
            litri_benzina: 4,
            dettaglio_incasso: { contanti_operatore: 6 }
          }
        },
        {
          closed_at: '2026-07-01T20:00:00.000Z',
          closing_data: {
            ricavo_teorico: 15,
            litri_gasolio: 5,
            dettaglio_incasso: { pos_operatore: 9 }
          }
        },
        {
          closed_at: '2026-07-02T20:00:00.000Z',
          closing_data: { ricavo_teorico: 20, litri_benzina: 3, litri_gasolio: 7 }
        }
      ],
      [createEmptyDayStats('2026-07-02'), createEmptyDayStats('2026-07-01')]
    );

    expect(result.daily).toEqual([
      { date: '2026-07-01', revenue: 25, liters_benzina: 4, liters_gasolio: 5 },
      { date: '2026-07-02', revenue: 20, liters_benzina: 3, liters_gasolio: 7 }
    ]);
    expect(result.totals).toEqual({
      ...createEmptyAnalyticsTotals(),
      benzina: 7,
      gasolio: 12,
      contanti: 6,
      pos: 9,
      revenue: 45
    });
  });

  it.each([null, [], 'invalid', 42, true])(
    'treats non-record closing_data (%s) as empty',
    closingData => {
      const result = aggregateShiftAnalytics(
        [{ closed_at: '2026-07-01T20:00:00.000Z', closing_data: closingData }],
        [createEmptyDayStats('2026-07-01')]
      );

      expect(result.daily).toEqual([createEmptyDayStats('2026-07-01')]);
      expect(result.totals).toEqual(createEmptyAnalyticsTotals());
    }
  );

  it('keeps compatibility with legacy flat payment fields', () => {
    const result = aggregateShiftAnalytics(
      [
        {
          closed_at: '2026-07-01T18:00:00.000Z',
          closing_data: {
            soldi_contanti: 10,
            soldi_pos_totale: 20,
            soldi_crediti: 3,
            soldi_voucher: 4,
            incasso_uta_dkv: 5,
            incasso_id_gestore: 6
          }
        }
      ],
      [createEmptyDayStats('2026-07-01')]
    );

    expect(result.totals).toMatchObject({
      contanti: 10,
      pos: 20,
      crediti: 3,
      voucher: 4,
      utaDkv: 5,
      idGestore: 6
    });
  });

  it('builds query boundaries and seed days in the Italian timezone', () => {
    const summer = createItalianCalendarRange('30d', new Date('2026-07-14T12:00:00.000Z'));
    expect(summer.days).toHaveLength(30);
    expect(summer.days[0]?.date).toBe('2026-06-15');
    expect(summer.days.at(-1)?.date).toBe('2026-07-14');
    expect(summer.startIso).toBe('2026-06-14T22:00:00.000Z');
    expect(summer.endExclusiveIso).toBe('2026-07-14T22:00:00.000Z');

    const winter = createItalianCalendarRange('month', new Date('2026-01-15T12:00:00.000Z'));
    expect(winter.startIso).toBe('2025-12-31T23:00:00.000Z');
    expect(winter.endExclusiveIso).toBe('2026-01-15T23:00:00.000Z');
  });

  it('groups late-evening UTC closures into the Italian calendar day', () => {
    const result = aggregateShiftAnalytics(
      [{ closed_at: '2026-07-01T22:30:00.000Z', closing_data: { ricavo_teorico: 25 } }],
      [createEmptyDayStats('2026-07-02')]
    );

    expect(result.daily[0]?.revenue).toBe(25);
  });

  it('ignores non-finite metric values instead of poisoning chart totals', () => {
    const result = aggregateShiftAnalytics(
      [
        {
          closed_at: '2026-07-01T20:00:00.000Z',
          closing_data: {
            ricavo_teorico: 'not-a-number',
            litri_benzina: 'Infinity',
            dettaglio_incasso: { contanti_operatore: Number.NaN }
          }
        }
      ],
      [createEmptyDayStats('2026-07-01')]
    );

    expect(result.daily).toEqual([createEmptyDayStats('2026-07-01')]);
    expect(result.totals).toEqual(createEmptyAnalyticsTotals());
  });

  it('ignores shifts without a closure date or outside the seeded range', () => {
    const result = aggregateShiftAnalytics(
      [
        { closed_at: null, closing_data: { ricavo_teorico: 100 } },
        { closed_at: '2026-07-03T20:00:00.000Z', closing_data: { ricavo_teorico: 200 } }
      ],
      [createEmptyDayStats('2026-07-01')]
    );

    expect(result.daily).toEqual([createEmptyDayStats('2026-07-01')]);
    expect(result.totals).toEqual(createEmptyAnalyticsTotals());
  });

  it('does not mutate shifts or seeded days', () => {
    const shifts = [
      {
        closed_at: '2026-07-01T20:00:00.000Z',
        closing_data: { ricavo_teorico: 25 }
      }
    ];
    const seedDays = [createEmptyDayStats('2026-07-01')];
    const shiftsSnapshot = structuredClone(shifts);
    const seedDaysSnapshot = structuredClone(seedDays);

    aggregateShiftAnalytics(shifts, seedDays);

    expect(shifts).toEqual(shiftsSnapshot);
    expect(seedDays).toEqual(seedDaysSnapshot);
  });
});
