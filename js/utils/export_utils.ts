// ==========================================
// EXPORT FUNCTIONS (PDF / EXCEL)
// ==========================================
import { supabase } from '../core/api.js';
import { CustomWindow } from '../types.js';
import { Toast } from '../ui/toast.js';

import { closureTemplateXlsxBase64 } from './template_chiusura_base64.js';
import { formatDate, slugifyLabel, base64ToArrayBuffer } from './utils.js';

// Costanti per export
const SUMMARY_TEMPLATE_START_ROW = 42;
const ISLAND_TEMPLATE_BLOCKS = [
  {
    startRow: 9,
    endRow: 16,
    pistolaRows: 6,
    totals: [
      { type: 'gasolio', valueCell: 'F15', priceCell: 'E15', priceType: 'gasolio' },
      { type: 'benzina', valueCell: 'P15', priceCell: 'O15', priceType: 'benzina' },
      { type: 'totale', valueCell: 'O16', priceCell: 'U16', priceType: 'totale' }
    ]
  },
  {
    startRow: 21,
    endRow: 28,
    pistolaRows: 6,
    totals: [
      { type: 'gasolio', valueCell: 'F27', priceCell: 'E27', priceType: 'gasolio' },
      { type: 'benzina', valueCell: 'P27', priceCell: 'O27', priceType: 'benzina' },
      { type: 'totale', valueCell: 'O28', priceCell: 'U28', priceType: 'totale' }
    ]
  },
  {
    startRow: 33,
    endRow: 40,
    pistolaRows: 2,
    totals: [
      { type: 'totale', valueCell: 'O38', priceCell: 'U38', priceType: 'totale' }
    ]
  }
];

export interface ExportPistola {
    label: string;
    chiusura: number;
    apertura: number;
    venduti: number;
    totaleEuro: number;
    tipo: string;
    tipoSigla: string;
}

export interface ExportSection {
    id: number | string;
    label: string;
    pistole: ExportPistola[];
}

export interface ExportSummary {
    self: number;
    carteSelf: number;
    contanti: number;
    cartePos: number;
    nonErogato: number;
    lubrAdblue: number;
    crediti: number;
    utaDkv: number;
}

export interface ExportMetrics {
    meta: {
        stationSlug: string;
        dateSlug: string;
        dateDisplay: string;
        prices: Record<string, any>;
        totals: {
            ltGasolio: number;
            ltBenzina: number;
            ltOther: number;
            euroGasolio: number;
            euroBenzina: number;
            totalEuro: number;
        };
    };
    sections: ExportSection[];
    summary: ExportSummary;
}

function inferFuelTypeFromNameExport(nomePistola: string = ''): string {
  const n = nomePistola.toLowerCase();
  if (n.includes('adblue')) { return 'adblue'; }
  if (n.includes('blue') || n.includes('supreme') || n.includes('hiq')) { return 'supreme'; }
  if (n.includes('gasolio') || n.includes('diesel')) { return 'gasolio'; }
  if (n.includes('benzina') || n.includes('verde')) { return 'benzina'; }
  if (n.includes('gpl')) { return 'gpl'; }
  if (n.includes('metano')) { return 'metano'; }
  return 'altro';
}

function fuelTypeSigla(tipo: string): string {
  if (tipo === 'gasolio') { return 'D'; }
  if (tipo === 'benzina') { return 'B'; }
  if (tipo === 'supreme') { return 'S'; }
  if (tipo === 'gpl') { return 'G'; }
  if (tipo === 'metano') { return 'M'; }
  if (tipo === 'adblue') { return 'A'; }
  return '';
}

function getClosureTemplateBase64(): string | null {
  return closureTemplateXlsxBase64 || null;
}

export async function computeExportSummaryMetrics(adminClient: any, closure: any, stationId: number | string | null): Promise<ExportMetrics> {
  const safeNumber = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const metrics: ExportMetrics = {
    meta: {
      stationSlug: 'stazione',
      dateSlug: 'data',
      dateDisplay: '',
      prices: {},
      totals: {
        ltGasolio: 0,
        ltBenzina: 0,
        ltOther: 0,
        euroGasolio: 0,
        euroBenzina: 0,
        totalEuro: 0
      }
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

  try {
    // 1. Dati Stazione (Nome)
    let stationName = 'Stazione';
    if (stationId) {
      const { data: st } = await adminClient
        .from('fuel_stations')
        .select('station_name')
        .eq('station_id', stationId)
        .single();
      if (st) { stationName = st.station_name; }
    }
    const closingData = closure.closing_data || {};

    metrics.meta.stationSlug = slugifyLabel(stationName);
    const dateRaw = closure.closed_at || closure.created_at || closure.data_chiusura;
    metrics.meta.dateSlug = dateRaw ? dateRaw.split('T')[0] : 'date';
    metrics.meta.dateDisplay = formatDate(dateRaw);

    // Prices might be in 'prezzi' (legacy) or 'closing_data.prezzi' or 'closing_data.prices'
    metrics.meta.prices = closure.prezzi || closingData.prezzi || closingData.prices || {};

    // 2. Fetch Pistole e Tank Pumps
    let shiftPistols = closure.shift_pistols;
    if (!shiftPistols) {
      const targetId = closure.id || closure.shift_id;
      if (targetId) {
        const { data: sp } = await adminClient
          .from('shift_pistols')
          .select('*')
          .eq('shift_id', targetId);

        const rawPistols = sp || [];

        if (rawPistols.length > 0) {
          const pistolIds = [...new Set(rawPistols.map((p: any) => p.pistol_id))];

          // 2a. Fetch Pistols (Flat)
          const { data: pistolsFlat } = await adminClient
            .from('pistols')
            .select('pistol_id, pistol_name, pump_id')
            .in('pistol_id', pistolIds);

          const pistolsMap = new Map();
          const pumpIds = new Set();
          (pistolsFlat || []).forEach((p: any) => {
            pistolsMap.set(String(p.pistol_id), { ...p });
            if (p.pump_id) { pumpIds.add(p.pump_id); }
          });

          // 2b. Fetch Pumps (Flat)
          const pumpsMap = new Map();
          const islandIds = new Set();
          if (pumpIds.size > 0) {
            const { data: pumpsFlat } = await adminClient
              .from('fuel_pumps')
              .select('pump_id, pump_name, island_id')
              .in('pump_id', [...pumpIds]);

            (pumpsFlat || []).forEach((p: any) => {
              pumpsMap.set(String(p.pump_id), p);
              if (p.island_id) { islandIds.add(p.island_id); }
            });
          }

          // 2c. Fetch Islands (Flat)
          const islandsMapRef = new Map();
          if (islandIds.size > 0) {
            const { data: islandsFlat } = await adminClient
              .from('islands')
              .select('island_id, island_name')
              .in('island_id', [...islandIds]);

            (islandsFlat || []).forEach((i: any) => islandsMapRef.set(String(i.island_id), i));
          }

          // Step 3: Deep Merge in JS
          shiftPistols = rawPistols.map((rp: any) => {
            const pId = parseInt(rp.pistol_id, 10);
            const pistolBase = pistolsMap.get(String(pId));

            let constructedPistol: any = {};
            if (pistolBase) {
              const pump = pumpsMap.get(String(pistolBase.pump_id));
              const island = pump ? islandsMapRef.get(String(pump.island_id)) : null;

              constructedPistol = {
                pistol_name: pistolBase.pistol_name,
                pump_id: pistolBase.pump_id,
                fuel_pumps: pump ? {
                  pump_name: pump.pump_name,
                  island_id: pump.island_id,
                  islands: island ? { island_name: island.island_name } : null
                } : null
              };
            } else {
              constructedPistol = {
                pistol_name: `[Pistola ${pId} non trovata]`,
                fuel_pumps: { islands: { island_name: 'Isola ?' } }
              };
            }

            return {
              ...rp,
              pistols: constructedPistol
            };
          });
        } else {
          shiftPistols = [];
        }
      } else {
        shiftPistols = [];
      }
    }

    const islandsMap = new Map<number | string, ExportSection>();

    shiftPistols.forEach((sp: any) => {
      const pistolName = sp.pistols?.pistol_name || `Pistola ${sp.pistol_id}`;
      const islandName = sp.pistols?.fuel_pumps?.islands?.island_name || 'Isola ?';
      const islandId = sp.pistols?.fuel_pumps?.island_id || 999;
      const pumpName = sp.pistols?.fuel_pumps?.pump_name || '';

      if (!islandsMap.has(islandId)) {
        islandsMap.set(islandId, { id: islandId, label: islandName, pistole: [] });
      }

      const tipo = inferFuelTypeFromNameExport(pistolName);
      const venduto = safeNumber(sp.liters_dispensed);
      const prezzoUnitario = safeNumber(sp.end_price);
      const totaleEuro = venduto * prezzoUnitario;

            islandsMap.get(islandId)!.pistole.push({
              label: `${pumpName} ${pistolName}`.trim(),
              chiusura: safeNumber(sp.end_counter),
              apertura: safeNumber(sp.start_counter),
              venduti: venduto,
              totaleEuro: totaleEuro,
              tipo: tipo,
              tipoSigla: fuelTypeSigla(tipo)
            });

            // Meta totals accumulation
            if (tipo === 'gasolio') {
              metrics.meta.totals.ltGasolio += venduto;
              metrics.meta.totals.euroGasolio += totaleEuro;
            } else if (tipo === 'benzina') {
              metrics.meta.totals.ltBenzina += venduto;
              metrics.meta.totals.euroBenzina += totaleEuro;
            } else {
              metrics.meta.totals.ltOther += venduto;
            }
            metrics.meta.totals.totalEuro += totaleEuro;
    });

    // Ordina isole e pistole
    const sortedIslands = Array.from(islandsMap.values()).sort((a: any, b: any) => a.id - b.id);
    metrics.sections = sortedIslands;

    // 3. Summary Totals (Incassi)
    const incassi = closure.incassi || {};
    metrics.summary.contanti = safeNumber(incassi.contanti || 0);
    metrics.summary.cartePos = safeNumber(incassi.pos || 0);
    metrics.summary.crediti = safeNumber(incassi.credito || 0);
    metrics.summary.self = safeNumber(incassi.self_service || 0);
    metrics.summary.nonErogato = safeNumber(incassi.non_erogato || 0);
    metrics.summary.lubrAdblue = safeNumber(incassi.accessori || 0);

    return metrics;

  } catch (e) {
    console.error('Error computing metrics', e);
    return metrics;
  }
}

export async function fetchClosureExportData(closureId: string | number): Promise<any> {
  const { data: closure, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', Number(closureId))
    .single();

  if (error) { throw error; }
  if (!closure) { throw new Error('Chiusura non trovata'); }

  const { data: sp } = await supabase
    .from('shift_pistols')
    .select('*')
    .eq('shift_id', Number(closureId));

  const rawPistols = sp || [];
  let enrichedPistols = [];

  if (rawPistols.length > 0) {
    const pistolIds = [...new Set(rawPistols.map((p: any) => p.pistol_id))];
    const { data: pistolDetails } = await supabase
      .from('pistole')
      .select(`
                pistol_id,
                pistol_name,
                pump_id,
                fuel_pumps (
                    pump_name,
                    island_id,
                    islands ( island_name, island_id )
                )
            `)
      .in('pistol_id', pistolIds);

    const pxMap = new Map();
    if (pistolDetails) {
      pistolDetails.forEach((p: any) => pxMap.set(p.pistol_id, p));
    }

    enrichedPistols = rawPistols.map((rp: any) => ({
      ...rp,
      pistols: pxMap.get(rp.pistol_id) || {}
    }));
  }

  (closure as Record<string, unknown>).shift_pistols = enrichedPistols;
  return closure;
}

function populateClosureSheet(sheet: any, templateData: ExportMetrics): void {
  const setCell = (addr: string, value: any) => {
    const cell = sheet.cell(addr);
    if (cell) { cell.value(value ?? ''); }
  };

  const meta = templateData.meta || {};
  const prices = meta.prices || {};
  const totals = meta.totals || {};
  const summary = templateData.summary || {};
  const sections = templateData.sections || [];

  // Intestazione
  setCell('C2', meta.dateDisplay || '');
  // Prezzi Unitari (Header)
  setCell('M2', Number(prices.diesel_servito || prices.gasolio) || 0);
  setCell('X2', Number(prices.benzina_servito || prices.benzina) || 0);

  // Totali Generali (in alto)
  setCell('F5', totals.euroGasolio || 0);
  setCell('P5', totals.euroBenzina || 0);
  setCell('U5', totals.totalEuro || 0);
  setCell('F6', totals.ltGasolio || 0);
  setCell('P6', totals.ltBenzina || 0);
  setCell('U6', 'LT TOTALI');
  setCell('V6', (totals.ltGasolio + totals.ltBenzina + totals.ltOther).toFixed(2));

  const fillPistolaRow = (rowIndex: number, pistola: ExportPistola | null) => {
    const rowLetter = (col: string) => `${col}${rowIndex}`;
    if (pistola) {
      setCell(rowLetter('A'), pistola.label || '');
      setCell(rowLetter('B'), pistola.chiusura || 0);
      setCell(rowLetter('G'), '-');
      setCell(rowLetter('H'), pistola.apertura || 0);
      setCell(rowLetter('M'), '=');
      setCell(rowLetter('N'), pistola.venduti || 0);
      setCell(rowLetter('S'), pistola.tipoSigla || '');
      setCell(rowLetter('T'), pistola.totaleEuro || 0);
    } else {
      ['A', 'B', 'G', 'H', 'M', 'N', 'S', 'T'].forEach(c => setCell(rowLetter(c), null));
    }
  };

  const activeCount = Math.min(sections.length, ISLAND_TEMPLATE_BLOCKS.length);

  ISLAND_TEMPLATE_BLOCKS.forEach((block, index) => {
    const section = sections[index];
    const isActive = index < activeCount && !!section;

    if (!isActive) {
      setCell(`A${block.startRow}`, '');
      for (let i = 0; i < block.pistolaRows; i++) {
        fillPistolaRow(block.startRow + 2 + i, null);
      }
      block.totals.forEach(t => {
        setCell(t.valueCell, null);
        if (t.priceCell) { setCell(t.priceCell, null); }
      });
      return;
    }

    setCell(`A${block.startRow}`, section.label || `Isola ${index + 1}`);

    const pistole = section.pistole || [];
    for (let i = 0; i < block.pistolaRows; i++) {
      fillPistolaRow(block.startRow + 2 + i, pistole[i] || null);
    }
  });

  const sRow = SUMMARY_TEMPLATE_START_ROW;
  setCell(`A${sRow + 1}`, summary.self || 0);
  setCell(`D${sRow + 1}`, summary.carteSelf || 0);
  setCell(`G${sRow + 1}`, summary.contanti || 0);
  setCell(`J${sRow + 1}`, summary.cartePos || 0);
  setCell(`M${sRow + 1}`, summary.nonErogato || 0);
  setCell(`P${sRow + 1}`, summary.lubrAdblue || 0);
  setCell(`S${sRow + 1}`, summary.crediti || 0);
  setCell(`V${sRow + 1}`, summary.utaDkv || 0);
}

export async function generateClosureExcel(templateData: ExportMetrics): Promise<void> {
  const customWindow = window as unknown as CustomWindow;
  if (!customWindow.XlsxPopulate) {
    Toast.show('Libreria Excel non caricata', 'error');
    return;
  }
  const templateBase64 = getClosureTemplateBase64();
  if (!templateBase64) {
    Toast.show('Template Excel mancante', 'error');
    return;
  }

  try {
    const wb = await customWindow.XlsxPopulate.fromDataAsync(base64ToArrayBuffer(templateBase64));
    const sheet = wb.sheet(0);
    populateClosureSheet(sheet, templateData);

    const blob = await wb.outputAsync();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chiusura_${templateData.meta?.dateSlug || 'export'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error('Excel generation error:', e);
    Toast.show('Errore generazione Excel', 'error');
  }
}

export async function generateMultiClosureExcel(closuresData: ExportMetrics[]): Promise<void> {
  const customWindow = window as unknown as CustomWindow;
  if (!customWindow.XlsxPopulate) {
    Toast.show('Libreria Excel non caricata', 'error');
    return;
  }
  const templateBase64 = getClosureTemplateBase64();
  if (!templateBase64) {
    Toast.show('Template Excel mancante', 'error');
    return;
  }

  try {
    Toast.show('Generazione Excel Unico in corso...', 'info');

    const wb = await customWindow.XlsxPopulate.fromDataAsync(base64ToArrayBuffer(templateBase64));
    const templateSheet = wb.sheet(0);
    templateSheet.name('Template');

    if (typeof templateSheet.clone !== 'function') {
      throw new Error('Funzione clone() non supportata dal browser.');
    }

    for (let i = 0; i < closuresData.length; i++) {
      const data = closuresData[i];
      if (!data) {continue;}

      const dateStr = data.meta?.dateSlug || `C${i + 1}`;
      const sheetName = `${dateStr}_${i + 1}`.substring(0, 31);

      const newSheet = templateSheet.clone();
      newSheet.name(sheetName);
      populateClosureSheet(newSheet, data);
    }

    templateSheet.delete();
    if (wb.sheets().length > 0) { wb.sheet(0).active(true); }

    const blob = await wb.outputAsync();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `chiusure_multi_${today}_completo.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    Toast.show('Export completato!', 'success');
    return;

  } catch (e) {
    console.warn('Clone failed, falling back to ZIP strategy:', e);
    Toast.show('Export unico non supportato dal browser. Generazione ZIP...', 'warning');
  }

  if (!customWindow.JSZip) {
    Toast.show('Libreria ZIP mancante, impossibile procedere.', 'error');
    return;
  }

  try {
    const zip = new customWindow.JSZip();

    for (let i = 0; i < closuresData.length; i++) {
      const data = closuresData[i];
      if (!data) {continue;}

      const dateStr = data.meta?.dateSlug || `C${i + 1}`;
      const fileName = `chiusura_${dateStr}_${i + 1}.xlsx`;

      const wb = await customWindow.XlsxPopulate.fromDataAsync(base64ToArrayBuffer(templateBase64));
      const sheet = wb.sheet(0);
      populateClosureSheet(sheet, data);

      const blob = await wb.outputAsync();
      zip.file(fileName, blob);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `chiusure_multi_export_${today}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    Toast.show('Download ZIP completato!', 'success');

  } catch (e: any) {
    console.error('ZIP Fallback error:', e);
    Toast.show('Errore fatale export: ' + e.message, 'error');
  }
}
