import { supabase, safeSupabaseQuery } from "../core/api.js";
import { calculationEngine, CALCULATION_SCOPES } from "./calculation-engine.js";

const presetState = {
  functionsRegistered: false,
  syncPromise: null
};

const CALCULATION_PRESETS = [
  {
    scope: CALCULATION_SCOPES.KPI_VENDUTO,
    name: "Dashboard KPI Venduto",
    description: "Calcolo dinamico del venduto giornaliero dalle chiusure",
    dsl: {
      op: "input",
      path: "salesEuro"
    }
  },
  {
    scope: CALCULATION_SCOPES.KPI_EROGATO,
    name: "Dashboard KPI Erogato",
    description: "Calcolo dinamico dei litri erogati (benzina e gasolio) dalle chiusure",
    dsl: {
      op: "input",
      path: "erogatoData"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_MOVIMENTI,
    name: "Chiusure - Somme movimenti",
    description: "Aggrega crediti, voucher, rimborsi e incassi extra",
    dsl: {
      op: "function",
      name: "closure_movimenti_summary"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_TOTALE_ATTESO,
    name: "Chiusure - Totale teorico carburante",
    description: "Calcola ricavo teorico e totale atteso",
    dsl: {
      op: "function",
      name: "closure_totale_atteso"
    }
  },
  {
    scope: CALCULATION_SCOPES.CHIUSURE_CASH_METRICS,
    name: "Chiusure - Contanti attesi",
    description: "Determina i contanti attesi e la discrepanza",
    dsl: {
      op: "function",
      name: "closure_expected_cash"
    }
  }
];

function round(value, precision = 2) {
  const factor = Math.pow(10, precision);
  return Math.round((Number(value) || 0) * factor) / factor;
}

function registerPresetFunctions() {
  if (presetState.functionsRegistered) return;
  presetState.functionsRegistered = true;

  calculationEngine.registerFunction("dashboard_kpi_venduto", (args = {}, ctx = {}) => {
    const source = { ...ctx, ...args };
    const manual = Number(source.salesEuro ?? source.manualValue ?? source.value ?? 0);
    if (Number.isFinite(manual) && manual !== 0) return manual;

    const litersB = Number(source.totalLitriBenzina ?? 0);
    const litersG = Number(source.totalLitriGasolio ?? 0);
    const priceB = Number(source.prezzoBenzina ?? 0);
    const priceG = Number(source.prezzoGasolio ?? 0);
    const computed = litersB * priceB + litersG * priceG;
    if (computed > 0) return round(computed);

    const fallback = Number(source.fallback ?? 0);
    return round(fallback);
  });

  calculationEngine.registerFunction("closure_movimenti_summary", (args = {}, ctx = {}) => {
    const movimenti = Array.isArray(ctx.movimenti || args.movimenti) ? (ctx.movimenti || args.movimenti) : [];
    const normalize = value => Number(value) || 0;
    const toLower = value => (value || "").toString().toLowerCase();

    const sumBy = filterFn => movimenti.reduce((sum, m) => sum + (filterFn(m) ? normalize(m.importo) : 0), 0);

    const credits = sumBy(m => {
      const descr = toLower(m.descrizione);
      return m.tipo === "credito" || (descr.includes("credito") && m.tipo !== "incasso");
    });

    const vouchers = sumBy(m => {
      const descr = toLower(m.descrizione);
      return m.tipo === "voucher" || m.tipo === "punti" || descr.includes("voucher") || descr.includes("punti");
    });

    const refunds = sumBy(m => {
      const descr = toLower(m.descrizione);
      return m.tipo === "pagamento" || m.tipo === "uscita" || descr.includes("rimborso");
    });

    const extraCash = sumBy(m => m.tipo === "incasso");

    return {
      credits,
      vouchers,
      refunds,
      extra_cash: extraCash
    };
  });

  calculationEngine.registerFunction("closure_totale_atteso", (args = {}, ctx = {}) => {
    const source = { ...ctx, ...args };
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

  calculationEngine.registerFunction("closure_expected_cash", (args = {}, ctx = {}) => {
    const source = { tolerance: 5, ...ctx, ...args };
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
    const expectedCash = carburante
      - totalPosOperatore
      - totalUtaOperatore
      - selfPos
      - credits
      - vouchers
      + deltaSelf
      - refunds
      + extraCash;

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

async function syncCalculationPreset(preset) {
  const existingModule = await safeSupabaseQuery(
    () => supabase
      .from("calculation_modules")
      .select("id, active_version_id")
      .eq("scope", preset.scope)
      .maybeSingle(),
    "Errore caricamento modulo calcoli"
  );

  let moduleId = existingModule?.data?.id;

  if (!moduleId) {
    const insertResult = await safeSupabaseQuery(
      () => supabase
        .from("calculation_modules")
        .insert([{
          name: preset.name,
          scope: preset.scope,
          description: preset.description,
          created_by: null
        }])
        .select("id")
        .single(),
      "Errore creazione modulo calcoli"
    );
    moduleId = insertResult.data.id;
  }

  const existingPublished = await safeSupabaseQuery(
    () => supabase
      .from("calculation_versions")
      .select("id")
      .eq("module_id", moduleId)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Errore ricerca versioni calcoli"
  );

  if (!existingPublished?.data?.id) {
    const versionResult = await safeSupabaseQuery(
      () => supabase
        .from("calculation_versions")
        .insert([{
          module_id: moduleId,
          version: 1,
          status: "published",
          dsl: preset.dsl,
          notes: "Preset automatico",
          published_at: new Date().toISOString()
        }])
        .select("id")
        .single(),
      "Errore creazione versione calcoli"
    );

    await safeSupabaseQuery(
      () => supabase
        .from("calculation_modules")
        .update({ active_version_id: versionResult.data.id })
        .eq("id", moduleId),
      "Errore aggiornamento modulo attivo"
    );
  }
}

async function syncAllPresets() {
  for (const preset of CALCULATION_PRESETS) {
    try {
      await syncCalculationPreset(preset);
    } catch (err) {
      console.warn(`Preset calcoli "${preset.scope}" non sincronizzato:`, err);
    }
  }
}

export function initializeCalculationPresets() {
  registerPresetFunctions();
}

export async function ensureCalculationPresetsSynced() {
  registerPresetFunctions();
  if (!presetState.syncPromise) {
    presetState.syncPromise = syncAllPresets().catch((err) => {
      console.warn("Impossibile sincronizzare i preset del motore di calcolo:", err);
    });
  }
  return presetState.syncPromise;
}

