// ==========================================
// EXPORT FUNCTIONS (PDF / EXCEL)
// ==========================================
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../core/api.js';
import { logger } from '../core/logger.js';
import { handleError, AppError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';

/** Narrow an unknown value to a property bag, defaulting to an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

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
    totals: [{ type: 'totale', valueCell: 'O38', priceCell: 'U38', priceType: 'totale' }]
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
    prices: Record<string, number>;
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
  if (n.includes('adblue')) {
    return 'adblue';
  }
  if (n.includes('blue') || n.includes('supreme') || n.includes('hiq')) {
    return 'supreme';
  }
  if (n.includes('gasolio') || n.includes('diesel')) {
    return 'gasolio';
  }
  if (n.includes('benzina') || n.includes('verde')) {
    return 'benzina';
  }
  if (n.includes('gpl')) {
    return 'gpl';
  }
  if (n.includes('metano')) {
    return 'metano';
  }
  return 'altro';
}

function fuelTypeSigla(tipo: string): string {
  if (tipo === 'gasolio') {
    return 'D';
  }
  if (tipo === 'benzina') {
    return 'B';
  }
  if (tipo === 'supreme') {
    return 'S';
  }
  if (tipo === 'gpl') {
    return 'G';
  }
  if (tipo === 'metano') {
    return 'M';
  }
  if (tipo === 'adblue') {
    return 'A';
  }
  return '';
}

function getClosureTemplateBase64(): string | null {
  return closureTemplateXlsxBase64 || null;
}

export async function computeExportSummaryMetrics(
  adminClient: SupabaseClient,
  closure: Record<string, unknown>,
  stationId: unknown
): Promise<ExportMetrics> {
  const safeNumber = (value: unknown): number => {
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
      if (st) {
        stationName = st.station_name;
      }
    }
    const closingData = asRecord(closure.closing_data);

    metrics.meta.stationSlug = slugifyLabel(stationName);
    const dateRaw = (closure.closed_at || closure.created_at || closure.data_chiusura) as
      string | undefined;
    metrics.meta.dateSlug = dateRaw ? (dateRaw.split('T')[0] ?? 'date') : 'date';
    metrics.meta.dateDisplay = formatDate(dateRaw);

    // Prices might be in 'prezzi' (legacy) or 'closing_data.prezzi' or 'closing_data.prices'
    metrics.meta.prices = (closure.prezzi ||
      closingData.prezzi ||
      closingData.prices ||
      {}) as Record<string, number>;

    // 2. Fetch Pistole e Tank Pumps
    let shiftPistols: Record<string, unknown>[] = Array.isArray(closure.shift_pistols)
      ? closure.shift_pistols.map(asRecord)
      : [];
    if (!Array.isArray(closure.shift_pistols)) {
      const targetId = closure.id || closure.shift_id;
      if (targetId) {
        const { data: sp } = await adminClient
          .from('shift_pistols')
          .select('*')
          .eq('shift_id', targetId);

        const rawPistols = sp || [];

        if (rawPistols.length > 0) {
          const pistolIds = [
            ...new Set(rawPistols.map((p: Record<string, unknown>) => p.pistol_id))
          ];

          // 2a. Fetch Pistols (Flat)
          const { data: pistolsFlat } = await adminClient
            .from('pistols')
            .select('pistol_id, pistol_name, pump_id')
            .in('pistol_id', pistolIds);

          const pistolsMap = new Map<string, Record<string, unknown>>();
          const pumpIds = new Set<unknown>();
          (pistolsFlat || []).forEach((p: Record<string, unknown>) => {
            pistolsMap.set(String(p.pistol_id), { ...p });
            if (p.pump_id) {
              pumpIds.add(p.pump_id);
            }
          });

          // 2b. Fetch Pumps (Flat)
          const pumpsMap = new Map<string, Record<string, unknown>>();
          const islandIds = new Set<unknown>();
          if (pumpIds.size > 0) {
            const { data: pumpsFlat } = await adminClient
              .from('fuel_pumps')
              .select('pump_id, pump_name, island_id')
              .in('pump_id', [...pumpIds]);

            (pumpsFlat || []).forEach((p: Record<string, unknown>) => {
              pumpsMap.set(String(p.pump_id), p);
              if (p.island_id) {
                islandIds.add(p.island_id);
              }
            });
          }

          // 2c. Fetch Islands (Flat)
          const islandsMapRef = new Map<string, Record<string, unknown>>();
          if (islandIds.size > 0) {
            const { data: islandsFlat } = await adminClient
              .from('islands')
              .select('island_id, island_name')
              .in('island_id', [...islandIds]);

            (islandsFlat || []).forEach((i: Record<string, unknown>) =>
              islandsMapRef.set(String(i.island_id), i)
            );
          }

          // Step 3: Deep Merge in JS
          shiftPistols = rawPistols.map((rp: Record<string, unknown>) => {
            const pId = parseInt(String(rp.pistol_id), 10);
            const pistolBase = pistolsMap.get(String(pId));

            let constructedPistol: Record<string, unknown> = {};
            if (pistolBase) {
              const pump = pumpsMap.get(String(pistolBase.pump_id));
              const island = pump ? islandsMapRef.get(String(pump.island_id)) : null;

              constructedPistol = {
                pistol_name: pistolBase.pistol_name,
                pump_id: pistolBase.pump_id,
                fuel_pumps: pump
                  ? {
                      pump_name: pump.pump_name,
                      island_id: pump.island_id,
                      islands: island ? { island_name: island.island_name } : null
                    }
                  : null
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

    shiftPistols.forEach((sp: Record<string, unknown>) => {
      const pistolsInfo = asRecord(sp.pistols);
      const fuelPumps = asRecord(pistolsInfo.fuel_pumps);
      const islandsInfo = asRecord(fuelPumps.islands);
      const pistolName = (pistolsInfo.pistol_name as string) || `Pistola ${String(sp.pistol_id)}`;
      const islandName = (islandsInfo.island_name as string) || 'Isola ?';
      const islandId = (fuelPumps.island_id as number | string) || 999;
      const pumpName = (fuelPumps.pump_name as string) || '';

      let section = islandsMap.get(islandId);
      if (!section) {
        section = { id: islandId, label: islandName, pistole: [] };
        islandsMap.set(islandId, section);
      }

      const tipo = inferFuelTypeFromNameExport(pistolName);
      const venduto = safeNumber(sp.liters_dispensed);
      const prezzoUnitario = safeNumber(sp.end_price);
      const totaleEuro = venduto * prezzoUnitario;

      section.pistole.push({
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
    const sortedIslands = Array.from(islandsMap.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );
    metrics.sections = sortedIslands;

    // 3. Summary Totals (Incassi)
    const incassi = asRecord(closure.incassi);
    metrics.summary.contanti = safeNumber(incassi.contanti);
    metrics.summary.cartePos = safeNumber(incassi.pos);
    metrics.summary.crediti = safeNumber(incassi.credito);
    metrics.summary.self = safeNumber(incassi.self_service);
    metrics.summary.nonErogato = safeNumber(incassi.non_erogato);
    metrics.summary.lubrAdblue = safeNumber(incassi.accessori);

    return metrics;
  } catch (e) {
    logger.error('exportUtils', 'Error computing metrics', e);
    return metrics;
  }
}

export async function fetchClosureExportData(
  closureId: string | number
): Promise<Record<string, unknown>> {
  const { data: closure, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', Number(closureId))
    .single();

  if (error) {
    throw error;
  }
  if (!closure) {
    throw new Error('Chiusura non trovata');
  }

  const { data: sp } = await supabase
    .from('shift_pistols')
    .select('*')
    .eq('shift_id', Number(closureId));

  const rawPistols = sp || [];
  let enrichedPistols: Record<string, unknown>[] = [];

  if (rawPistols.length > 0) {
    const pistolIds = [...new Set(rawPistols.map((p: Record<string, unknown>) => p.pistol_id))];
    const { data: pistolDetails } = await supabase
      .from('pistole')
      .select(
        `
                pistol_id,
                pistol_name,
                pump_id,
                fuel_pumps (
                    pump_name,
                    island_id,
                    islands ( island_name, island_id )
                )
            `
      )
      .in('pistol_id', pistolIds);

    const pxMap = new Map<unknown, Record<string, unknown>>();
    // The generated DB types don't model the legacy 'pistole' relation/columns
    // queried here (see CLAUDE.md: repo types can lag the live DB), so the row
    // shape is treated as a generic record. Runtime query is unchanged.
    const pistolRows = (pistolDetails ?? []) as unknown as Record<string, unknown>[];
    pistolRows.forEach(p => pxMap.set(p.pistol_id, p));

    enrichedPistols = rawPistols.map((rp: Record<string, unknown>) => ({
      ...rp,
      pistols: pxMap.get(rp.pistol_id) || {}
    }));
  }

  (closure as Record<string, unknown>).shift_pistols = enrichedPistols;
  return closure;
}

interface XlsxTemplateArchive {
  file(path: string): XlsxTemplateFile | null;
  file(path: string, data: string | Blob): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface XlsxTemplateFile {
  async(type: 'string'): Promise<string>;
}

interface XlsxZipConstructor {
  new (): XlsxTemplateArchive;
  loadAsync(data: ArrayBuffer): Promise<XlsxTemplateArchive>;
}

interface XlsxSheetXml {
  getCell(address: string): { value: unknown };
  toXml(): string;
}

interface JsZipModuleLike {
  default: XlsxZipConstructor;
}

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const WORKSHEET_PATH = 'xl/worksheets/sheet1.xml';

async function loadJsZip(): Promise<XlsxZipConstructor> {
  const module = (await import('jszip')) as unknown as JsZipModuleLike;
  return module.default;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnNameToNumber(columnName: string): number {
  return columnName.split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0);
}

function splitCellAddress(address: string): { column: string; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) {
    throw new Error(`Indirizzo cella Excel non valido: ${address}`);
  }
  return { column: match[1] ?? 'A', row: Number(match[2] ?? 1) };
}

function renderCell(address: string, value: unknown, existingCell?: string): string {
  const openTagMatch = existingCell?.match(/^<c\b([^>]*)>/);
  let attrs = openTagMatch?.[1] ?? ` r="${address}"`;

  if (!/\br=/.test(attrs)) {
    attrs = ` r="${address}"${attrs}`;
  }
  attrs = attrs.replace(/\s+t="[^"]*"/g, '');

  if (value === null || value === undefined || value === '') {
    return `<c${attrs}/>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c${attrs}><v>${value}</v></c>`;
  }

  return `<c${attrs} t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function upsertCellXml(xml: string, address: string, value: unknown): string {
  const { column, row } = splitCellAddress(address);
  // eslint-disable-next-line security/detect-non-literal-regexp -- address is an internal fixed Excel cell reference
  const cellPattern = new RegExp(
    String.raw`<c\b(?=[^>]*\br="${address}")[\s\S]*?</c>|<c\b(?=[^>]*\br="${address}")[^>]*/>`,
    'u'
  );
  const existing = xml.match(cellPattern)?.[0];
  const cellXml = renderCell(address, value, existing);

  if (existing) {
    return xml.replace(cellPattern, cellXml);
  }

  // eslint-disable-next-line security/detect-non-literal-regexp -- row is parsed from an internal fixed Excel cell reference
  const rowPattern = new RegExp(
    String.raw`(<row\b(?=[^>]*\br="${row}")[^>]*>)([\s\S]*?)(</row>)`,
    'u'
  );
  const rowMatch = xml.match(rowPattern);
  if (!rowMatch) {
    return xml.replace('</sheetData>', `<row r="${row}">${cellXml}</row></sheetData>`);
  }

  const before = rowMatch[1] ?? '';
  const body = rowMatch[2] ?? '';
  const after = rowMatch[3] ?? '';
  const cellColumn = columnNameToNumber(column);
  const existingCells = [
    ...body.matchAll(
      /<c\b(?=[^>]*\br="([A-Z]+)\d+")[\s\S]*?<\/c>|<c\b(?=[^>]*\br="([A-Z]+)\d+")[^>]*/gu
    )
  ];

  let insertAt = body.length;
  for (const match of existingCells) {
    const existingColumn = match[1] ?? match[2];
    if (existingColumn && columnNameToNumber(existingColumn) > cellColumn) {
      insertAt = match.index ?? body.length;
      break;
    }
  }

  const newBody = `${body.slice(0, insertAt)}${cellXml}${body.slice(insertAt)}`;
  return xml.replace(rowPattern, `${before}${newBody}${after}`);
}

function createSheetXmlAdapter(initialXml: string): XlsxSheetXml {
  let xml = initialXml;
  return {
    getCell(address: string) {
      return {
        set value(value: unknown) {
          xml = upsertCellXml(xml, address, value);
        },
        get value() {
          return undefined;
        }
      };
    },
    toXml() {
      return xml;
    }
  };
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function createPopulatedClosureWorkbook(templateData: ExportMetrics): Promise<Blob> {
  const templateBase64 = getClosureTemplateBase64();
  if (!templateBase64) {
    throw new Error('Template Excel mancante');
  }

  const buffer = base64ToArrayBuffer(templateBase64);
  if (!buffer) {
    throw new Error('Impossibile convertire il template base64 in ArrayBuffer');
  }

  const JSZip = await loadJsZip();
  const workbook = await JSZip.loadAsync(buffer);
  const worksheetFile = workbook.file(WORKSHEET_PATH);
  if (!worksheetFile) {
    throw new Error('Foglio Excel template non trovato');
  }

  const sheet = createSheetXmlAdapter(await worksheetFile.async('string'));
  populateClosureSheet(sheet, templateData);
  workbook.file(WORKSHEET_PATH, sheet.toXml());

  const output = await workbook.generateAsync({ type: 'blob' });
  if (output instanceof Blob) {
    return output;
  }
  return new Blob([output], { type: EXCEL_MIME_TYPE });
}

function populateClosureSheet(sheet: XlsxSheetXml, templateData: ExportMetrics): void {
  const setCell = (addr: string, value: unknown): void => {
    sheet.getCell(addr).value = value ?? '';
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

  const fillPistolaRow = (rowIndex: number, pistola: ExportPistola | null): void => {
    const rowLetter = (col: string): string => `${col}${rowIndex}`;
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
    // eslint-disable-next-line security/detect-object-injection -- index is the forEach loop index (numeric, in-bounds)
    const section = sections[index];
    const isActive = index < activeCount && !!section;

    if (!isActive) {
      setCell(`A${block.startRow}`, '');
      for (let i = 0; i < block.pistolaRows; i++) {
        fillPistolaRow(block.startRow + 2 + i, null);
      }
      block.totals.forEach(t => {
        setCell(t.valueCell, null);
        if (t.priceCell) {
          setCell(t.priceCell, null);
        }
      });
      return;
    }

    setCell(`A${block.startRow}`, section.label || `Isola ${index + 1}`);

    const pistole = section.pistole || [];
    for (let i = 0; i < block.pistolaRows; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop index
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
  try {
    const blob = await createPopulatedClosureWorkbook(templateData);
    downloadBlob(blob, `chiusura_${templateData.meta?.dateSlug || 'export'}.xlsx`);
  } catch (e: unknown) {
    logger.error('exportUtils', 'Excel generation error:', e);
    handleError(new AppError('Errore generazione Excel', 'EXPORT_ERROR', e), 'exportUtils');
  }
}

export async function generateMultiClosureExcel(closuresData: ExportMetrics[]): Promise<void> {
  try {
    Toast.show('Generazione ZIP Excel in corso...', 'info');
    const JSZip = await loadJsZip();
    const zip = new JSZip();

    for (let i = 0; i < closuresData.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop index
      const data = closuresData[i];
      if (!data) {
        continue;
      }

      const dateStr = data.meta?.dateSlug || `C${i + 1}`;
      const fileName = `chiusura_${dateStr}_${i + 1}.xlsx`;
      const blob = await createPopulatedClosureWorkbook(data);
      zip.file(fileName, blob);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const today = new Date().toISOString().split('T')[0];
    downloadBlob(zipContent, `chiusure_multi_export_${today}.zip`);

    Toast.show('Download ZIP completato!', 'success');
  } catch (e: unknown) {
    logger.error('exportUtils', 'ZIP export error:', e);
    const message = e instanceof Error ? e.message : 'Errore sconosciuto';
    handleError(new AppError(`Errore fatale export: ${message}`, 'EXPORT_ERROR', e), 'exportUtils');
  }
}
