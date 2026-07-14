import { calculationEngine } from './calculation-engine.js';

let presetFunctionsRegistered = false;

/** Narrow an unknown value to a property bag, defaulting to an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function round(value: number | string, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round((Number(value) || 0) * factor) / factor;
}

function registerPresetFunctions(): void {
  if (presetFunctionsRegistered) {
    return;
  }
  presetFunctionsRegistered = true;

  calculationEngine.registerFunction('dashboard_kpi_venduto', (args = {}, ctx = {}) => {
    const source = { ...asRecord(ctx), ...args };
    const manual = Number(source.salesEuro ?? source.manualValue ?? source.value ?? 0);
    if (Number.isFinite(manual) && manual !== 0) {
      return manual;
    }

    const litersB = Number(source.totalLitriBenzina ?? 0);
    const litersG = Number(source.totalLitriGasolio ?? 0);
    const priceB = Number(source.prezzoBenzina ?? 0);
    const priceG = Number(source.prezzoGasolio ?? 0);
    const computed = litersB * priceB + litersG * priceG;
    if (computed > 0) {
      return round(computed);
    }

    const fallback = Number(source.fallback ?? 0);
    return round(fallback);
  });

  calculationEngine.registerFunction('closure_movimenti_summary', (args = {}, ctx = {}) => {
    const rawMovimenti = asRecord(ctx).movimenti ?? args.movimenti;
    const movimenti: Record<string, unknown>[] = Array.isArray(rawMovimenti)
      ? rawMovimenti.map(asRecord)
      : [];
    const normalize = (value: unknown): number => Number(value) || 0;
    const toLower = (value: unknown): string => String(value || '').toLowerCase();

    const sumBy = (filterFn: (m: Record<string, unknown>) => boolean): number =>
      movimenti.reduce((sum, m) => sum + (filterFn(m) ? normalize(m.importo) : 0), 0);

    const credits = sumBy(m => {
      const descr = toLower(m.descrizione);
      return m.tipo === 'credito' || (descr.includes('credito') && m.tipo !== 'incasso');
    });

    const vouchers = sumBy(m => {
      const descr = toLower(m.descrizione);
      return (
        m.tipo === 'voucher' ||
        m.tipo === 'punti' ||
        descr.includes('voucher') ||
        descr.includes('punti')
      );
    });

    const refunds = sumBy(m => {
      const descr = toLower(m.descrizione);
      return m.tipo === 'pagamento' || m.tipo === 'uscita' || descr.includes('rimborso');
    });

    const extraCash = sumBy(m => m.tipo === 'incasso');

    return {
      credits,
      vouchers,
      refunds,
      extra_cash: extraCash
    };
  });

  calculationEngine.registerFunction('closure_totale_atteso', (args = {}, ctx = {}) => {
    const source = { ...asRecord(ctx), ...args };
    const includeCounters = Boolean(source.includeCounters ?? source.include_counters ?? true);
    const litersB = Number(source.totalLitriBenzina ?? source.litri_benzina ?? 0);
    const litersG = Number(source.totalLitriGasolio ?? source.litri_gasolio ?? 0);
    const priceB = Number(source.prezzoBenzina ?? source.prezzo_benzina ?? 0);
    const priceG = Number(source.prezzoGasolio ?? source.prezzo_gasolio ?? 0);
    const selfTotal = Number(source.selfTotalVenduto ?? source.self_total_venduto ?? 0);

    const ricavoTeorico = round(litersB * priceB + litersG * priceG);
    const totaleAtteso = includeCounters ? ricavoTeorico : selfTotal;

    return {
      ricavo_teorico: ricavoTeorico,
      totale_atteso: round(totaleAtteso)
    };
  });

  calculationEngine.registerFunction('closure_expected_cash', (args = {}, ctx = {}) => {
    const source: Record<string, unknown> = { tolerance: 5, ...asRecord(ctx), ...args };
    const carburante = Number(source.carburanteAtteso ?? source.carburante_atteso ?? 0);
    const totalPosOperatore = Number(source.totalPosOperatore ?? source.pos_operatore ?? 0);
    const totalUtaOperatore = Number(source.totalUtaOperatore ?? source.uta_operatore ?? 0);
    const selfPos = Number(source.selfPos ?? source.pos_self ?? 0);
    const credits = Number(source.creditsSum ?? source.crediti ?? 0);
    const vouchers = Number(source.vouchersSum ?? source.voucher ?? 0);
    const selfCashIn = Number(source.selfCashIn ?? source.self_cash_in ?? 0);
    const selfCashOut = Number(source.selfCashOut ?? source.self_cash_out ?? 0);
    const refunds = Number(source.refundsSum ?? source.rimborsi ?? 0);
    const extraCash = Number(source.extraCashSum ?? source.incassi_extra ?? 0);
    const cashReal = Number(source.cashReal ?? source.contanti_cassa ?? 0);
    const tolerance = Number(source.tolerance ?? 5);

    const deltaSelf = selfCashIn - selfCashOut;
    const expectedCash =
      carburante -
      totalPosOperatore -
      totalUtaOperatore -
      selfPos -
      credits -
      vouchers +
      deltaSelf -
      refunds +
      extraCash;

    const roundedExpected = round(expectedCash);
    const cashDiff = round(cashReal - roundedExpected);
    const isValid = Math.abs(cashDiff) <= tolerance;

    return {
      expected_cash: roundedExpected,
      cash_diff: cashDiff,
      discrepanza: cashDiff,
      is_valid: isValid
    };
  });
}

export function initializeCalculationPresets(): void {
  registerPresetFunctions();
}
