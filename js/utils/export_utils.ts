// ==========================================
// EXPORT FUNCTIONS (PDF / EXCEL)
// ==========================================
import type { Tables } from '../../supabase/database.types.js';
import { supabase, type AppSupabaseClient } from '../core/api.js';
import { Toast } from '../ui/toast.js';

import { selfNetCash } from './self-service.js';
import { closureTemplateXlsxBase64 } from './template_chiusura_base64.js';
import { formatDate, slugifyLabel, base64ToArrayBuffer, getISODate } from './utils.js';

/** Narrow an unknown value to a property bag, defaulting to an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Rounds a euro amount to 2 decimal places to avoid IEEE754 accumulation errors. */
function roundEuro(value: number): number {
  return Math.round(value * 100) / 100;
}

type ShiftClosureRow = Tables<'shift_closures'>;
type ShiftPistolaRow = Pick<
  Tables<'shift_pistols'>,
  'pistola_id' | 'opened_at_counter' | 'closed_at_counter' | 'liters_dispensed'
>;
type IslandExportRow = Pick<Tables<'islands'>, 'island_id' | 'island_name' | 'nome'>;
type PistolaExportRow = Pick<Tables<'pistole'>, 'id' | 'nome' | 'tipo_carburante' | 'island_id'> & {
  islands: IslandExportRow | null;
};
type EnrichedShiftPistolaRow = ShiftPistolaRow & {
  pistole: PistolaExportRow | null;
};
type StationExportRow = Pick<Tables<'fuel_stations'>, 'station_name'>;
type ClosureExportRow = Pick<
  ShiftClosureRow,
  'id' | 'shift_id' | 'closed_at' | 'created_at' | 'closing_data'
> & {
  station_id?: number | null;
};

export type ClosureExportSource = Partial<ClosureExportRow> & {
  fuel_stations?: StationExportRow | null;
  shift_pistols?: EnrichedShiftPistolaRow[];
  station_id?: number | null;
};

export type ClosureExportData = ClosureExportRow & {
  fuel_stations: StationExportRow | null;
  shift_pistols: EnrichedShiftPistolaRow[];
};

// Costanti per export
const SUMMARY_TEMPLATE_START_ROW = 42;
const ISLAND_TEMPLATE_BLOCKS = [
  {
    startRow: 9,
    pistolaRows: 6,
    fuelTotals: {
      gasolio: { litersCell: 'O18', euroCell: 'U18' },
      benzina: { litersCell: 'O19', euroCell: 'U19' }
    }
  },
  {
    startRow: 21,
    pistolaRows: 6,
    fuelTotals: {
      gasolio: { litersCell: 'O30', euroCell: 'U30' },
      benzina: { litersCell: 'O31', euroCell: 'U31' }
    }
  },
  {
    startRow: 33,
    pistolaRows: 2,
    aggregateTotal: { litersCell: 'O38', euroCell: 'U38' }
  }
] as const;

const SHIFT_PISTOLS_EXPORT_SELECT = `
  shift_id,
  pistola_id,
  opened_at_counter,
  closed_at_counter,
  liters_dispensed,
  pistole!shift_pistols_pistola_id_fkey (
    id,
    nome,
    tipo_carburante,
    island_id,
    islands!pistole_island_fk (
      island_id,
      island_name,
      nome
    )
  )
`;

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

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeFuelType(pistola: PistolaExportRow): string {
  const declaredType = pistola.tipo_carburante?.trim().toLowerCase() ?? '';
  if (declaredType.includes('gasolio') || declaredType.includes('diesel')) {
    return 'gasolio';
  }
  if (declaredType.includes('benzina') || declaredType.includes('verde')) {
    return 'benzina';
  }

  const inferredFromType = inferFuelTypeFromNameExport(declaredType);
  return inferredFromType === 'altro'
    ? inferFuelTypeFromNameExport(pistola.nome)
    : inferredFromType;
}

function readClosingPrices(closingData: Record<string, unknown>): Record<string, number> {
  return {
    benzina: safeNumber(closingData.prezzo_benzina),
    gasolio: safeNumber(closingData.prezzo_gasolio),
    gpl: safeNumber(closingData.prezzo_gpl),
    metano: safeNumber(closingData.prezzo_metano)
  };
}

function getFuelPrice(prices: Record<string, number>, fuelType: string): number {
  if (fuelType === 'benzina') {
    return prices.benzina ?? 0;
  }
  if (fuelType === 'gasolio') {
    return prices.gasolio ?? 0;
  }
  if (fuelType === 'gpl') {
    return prices.gpl ?? 0;
  }
  if (fuelType === 'metano') {
    return prices.metano ?? 0;
  }
  return 0;
}

async function fetchShiftPistolsForExport(
  client: AppSupabaseClient,
  shiftId: number
): Promise<EnrichedShiftPistolaRow[]> {
  const { data, error } = await client
    .from('shift_pistols')
    .select(SHIFT_PISTOLS_EXPORT_SELECT)
    .eq('shift_id', shiftId)
    .order('pistola_id', { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Load all nozzle snapshots needed by a bulk export in one relational query. */
export async function fetchShiftPistolsForBulkExport(
  client: AppSupabaseClient,
  shiftIds: number[]
): Promise<Map<number, EnrichedShiftPistolaRow[]>> {
  const uniqueShiftIds = [...new Set(shiftIds)];
  const byShiftId = new Map<number, EnrichedShiftPistolaRow[]>();
  uniqueShiftIds.forEach(shiftId => byShiftId.set(shiftId, []));

  if (uniqueShiftIds.length === 0) {
    return byShiftId;
  }

  const { data, error } = await client
    .from('shift_pistols')
    .select(SHIFT_PISTOLS_EXPORT_SELECT)
    .in('shift_id', uniqueShiftIds)
    .order('pistola_id', { ascending: true });

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    const shiftId = Number(row.shift_id);
    const pistole = byShiftId.get(shiftId);
    if (!pistole) {
      throw new Error(`Dettaglio pistole associato a un turno inatteso: ${shiftId}`);
    }

    const { shift_id: _shiftId, ...shiftPistola } = row;
    pistole.push(shiftPistola);
  }

  return byShiftId;
}

async function resolveStationName(
  client: AppSupabaseClient,
  closure: ClosureExportSource,
  stationId: number | null
): Promise<string> {
  if (closure.fuel_stations?.station_name) {
    return closure.fuel_stations.station_name;
  }
  if (stationId === null) {
    return 'Stazione';
  }

  const { data, error } = await client
    .from('fuel_stations')
    .select('station_name')
    .eq('station_id', stationId)
    .single();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`Stazione ${stationId} non trovata`);
  }
  return data.station_name;
}

function populateSummary(metrics: ExportMetrics, closingData: Record<string, unknown>): void {
  const selfService = asRecord(closingData.scontrino_self);
  const operator = asRecord(closingData.dettaglio_incasso);
  const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(record, key);
  const hasSelfCashData =
    hasOwn(selfService, 'banconote_incassate') || hasOwn(selfService, 'banconote_erogate');
  const hasUtaData =
    hasOwn(selfService, 'transazioni_uta') || hasOwn(operator, 'uta_dkv_operatore');

  metrics.summary.self = hasSelfCashData
    ? selfNetCash(selfService.banconote_incassate, selfService.banconote_erogate)
    : selfNetCash(closingData.cash_in_finale, closingData.cash_out_finale);
  metrics.summary.carteSelf = safeNumber(selfService.bancomat_erogati);
  metrics.summary.contanti = safeNumber(
    hasOwn(operator, 'contanti_operatore')
      ? operator.contanti_operatore
      : closingData.incasso_contanti
  );
  metrics.summary.cartePos = safeNumber(
    hasOwn(operator, 'pos_operatore') ? operator.pos_operatore : closingData.incasso_pos
  );
  metrics.summary.crediti = safeNumber(operator.crediti ?? closingData.crediti);
  metrics.summary.utaDkv = hasUtaData
    ? safeNumber(selfService.transazioni_uta) + safeNumber(operator.uta_dkv_operatore)
    : safeNumber(closingData.incasso_uta_dkv);
  metrics.summary.nonErogato = safeNumber(closingData.non_erogato);
  metrics.summary.lubrAdblue = safeNumber(
    closingData.lubr_adblue ?? closingData.lubrificanti_adblue ?? closingData.accessori
  );
}

export async function computeExportSummaryMetrics(
  adminClient: AppSupabaseClient,
  closure: ClosureExportSource,
  stationId: number | null
): Promise<ExportMetrics> {
  const closingData = asRecord(closure.closing_data);
  const prices = readClosingPrices(closingData);
  const stationName = await resolveStationName(adminClient, closure, stationId);
  const dateRaw = closure.closed_at ?? closure.created_at;
  const metrics: ExportMetrics = {
    meta: {
      stationSlug: slugifyLabel(stationName),
      dateSlug: dateRaw ? (dateRaw.split('T')[0] ?? 'date') : 'date',
      dateDisplay: formatDate(dateRaw),
      prices,
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

  let shiftPistols = closure.shift_pistols;
  if (shiftPistols === undefined) {
    if (closure.id === undefined) {
      throw new Error("ID turno mancante per l'export");
    }
    shiftPistols = await fetchShiftPistolsForExport(adminClient, closure.id);
  }

  const islandsMap = new Map<number, ExportSection>();
  shiftPistols.forEach(shiftPistola => {
    const pistola = shiftPistola.pistole;
    if (!pistola) {
      throw new Error(`Pistola ${shiftPistola.pistola_id} non disponibile per l'export`);
    }
    if (!pistola.islands) {
      throw new Error(
        `Isola della pistola ${shiftPistola.pistola_id} non disponibile per l'export`
      );
    }

    const islandId = pistola.island_id;
    let section = islandsMap.get(islandId);
    if (!section) {
      section = {
        id: islandId,
        label: pistola.islands.island_name || pistola.islands.nome,
        pistole: []
      };
      islandsMap.set(islandId, section);
    }

    const fuelType = normalizeFuelType(pistola);
    const litersDispensed = safeNumber(shiftPistola.liters_dispensed);
    const totalEuro = roundEuro(litersDispensed * getFuelPrice(prices, fuelType));

    section.pistole.push({
      label: pistola.nome,
      chiusura: safeNumber(shiftPistola.closed_at_counter),
      apertura: safeNumber(shiftPistola.opened_at_counter),
      venduti: litersDispensed,
      totaleEuro: totalEuro,
      tipo: fuelType,
      tipoSigla: fuelTypeSigla(fuelType)
    });

    if (fuelType === 'gasolio') {
      metrics.meta.totals.ltGasolio += litersDispensed;
      metrics.meta.totals.euroGasolio += totalEuro;
    } else if (fuelType === 'benzina') {
      metrics.meta.totals.ltBenzina += litersDispensed;
      metrics.meta.totals.euroBenzina += totalEuro;
    } else {
      metrics.meta.totals.ltOther += litersDispensed;
    }
    metrics.meta.totals.totalEuro += totalEuro;
  });

  metrics.sections = Array.from(islandsMap.values()).sort((a, b) => Number(a.id) - Number(b.id));
  populateSummary(metrics, closingData);
  return metrics;
}

export async function fetchClosureExportData(
  closureId: string | number
): Promise<ClosureExportData> {
  const numericClosureId = Number(closureId);
  if (!Number.isInteger(numericClosureId) || numericClosureId <= 0) {
    throw new Error('ID chiusura non valido');
  }

  const { data: closure, error } = await supabase
    .from('shift_closures')
    .select(
      `
        id,
        shift_id,
        closed_at,
        created_at,
        closing_data,
        shifts!shift_closures_shift_id_fkey (
          station_id,
          fuel_stations!shifts_station_id_fkey (station_name)
        )
      `
    )
    .eq('id', numericClosureId)
    .single();

  if (error) {
    throw error;
  }
  if (!closure) {
    throw new Error('Chiusura non trovata');
  }

  const raw = closure as unknown as Record<string, unknown>;
  const shiftId = Number(raw.shift_id);
  const stationId = Number((raw.shifts as Record<string, unknown> | null)?.station_id ?? 0);
  const stationName = (
    (raw.shifts as Record<string, unknown> | null)?.fuel_stations as Record<string, unknown> | null
  )?.station_name as string | null;

  const shiftPistols = await fetchShiftPistolsForExport(supabase, shiftId);
  return {
    ...raw,
    station_id: stationId || null,
    fuel_stations: stationName ? { station_name: stationName } : null,
    shift_pistols: shiftPistols
  } as unknown as ClosureExportData;
}

interface XlsxTemplateArchive {
  file(path: string): XlsxTemplateFile | null;
  file(path: string, data: string | Blob): void;
  remove(path: string): void;
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
const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELATIONSHIPS_PATH = 'xl/_rels/workbook.xml.rels';
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const CALC_CHAIN_PATH = 'xl/calcChain.xml';

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
  const selfClosingTagMatch = existingCell?.match(/^<c\b([^>]*)\/>$/);
  const openTagMatch = existingCell?.match(/^<c\b([^>]*)>/);
  let attrs = selfClosingTagMatch?.[1] ?? openTagMatch?.[1] ?? ` r="${address}"`;
  attrs = attrs.replace(/\/\s*$/u, '');

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
    String.raw`<c\b(?=[^>]*\br="${address}")[^>]*/>|<c\b(?=[^>]*\br="${address}")(?![^>]*\/>)[^>]*>[\s\S]*?</c>`,
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
      /<c\b(?=[^>]*\br="([A-Z]+)\d+")[^>]*\/>|<c\b(?=[^>]*\br="([A-Z]+)\d+")(?![^>]*\/>)[^>]*>[\s\S]*?<\/c>/gu
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

async function normalizeWorkbookCalculationPackage(workbook: XlsxTemplateArchive): Promise<void> {
  const contentTypesFile = workbook.file(CONTENT_TYPES_PATH);
  const relationshipsFile = workbook.file(WORKBOOK_RELATIONSHIPS_PATH);
  const workbookFile = workbook.file(WORKBOOK_PATH);
  if (!contentTypesFile || !relationshipsFile || !workbookFile) {
    throw new Error('Pacchetto Excel template incompleto');
  }

  const contentTypesXml = (await contentTypesFile.async('string')).replace(
    /<Override\b(?=[^>]*\bPartName="\/xl\/calcChain\.xml")[^>]*\/>/u,
    ''
  );
  const relationshipsXml = (await relationshipsFile.async('string')).replace(
    /<Relationship\b(?=[^>]*\bType="[^"]*\/calcChain")[^>]*\/>/u,
    ''
  );

  const workbookXml = await workbookFile.async('string');
  const calcPropertiesPattern = /<calcPr\b([^>]*)\/>/u;
  const currentCalcProperties = workbookXml.match(calcPropertiesPattern)?.[1] ?? '';
  const preservedCalcProperties = currentCalcProperties.replace(
    /\s+(?:calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/gu,
    ''
  );
  const calculationProperties = `<calcPr${preservedCalcProperties} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
  const normalizedWorkbookXml = calcPropertiesPattern.test(workbookXml)
    ? workbookXml.replace(calcPropertiesPattern, calculationProperties)
    : workbookXml.replace('</workbook>', `${calculationProperties}</workbook>`);

  workbook.file(CONTENT_TYPES_PATH, contentTypesXml);
  workbook.file(WORKBOOK_RELATIONSHIPS_PATH, relationshipsXml);
  workbook.file(WORKBOOK_PATH, normalizedWorkbookXml);
  workbook.remove(CALC_CHAIN_PATH);
}

function validateTemplateCapacity(sections: ExportSection[]): void {
  if (sections.length > ISLAND_TEMPLATE_BLOCKS.length) {
    throw new Error(
      `Il template Excel supporta al massimo ${ISLAND_TEMPLATE_BLOCKS.length} isole; trovate ${sections.length}`
    );
  }

  sections.forEach((section, index) => {
    // eslint-disable-next-line security/detect-object-injection -- index is bounded by the length check above
    const block = ISLAND_TEMPLATE_BLOCKS[index];
    if (block && section.pistole.length > block.pistolaRows) {
      throw new Error(
        `L'isola "${section.label}" contiene ${section.pistole.length} pistole, ma il relativo blocco del template ne supporta al massimo ${block.pistolaRows}`
      );
    }
  });
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

export async function createPopulatedClosureWorkbook(templateData: ExportMetrics): Promise<Blob> {
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
  await normalizeWorkbookCalculationPackage(workbook);

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
  validateTemplateCapacity(sections);

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
  setCell('V6', totals.ltGasolio + totals.ltBenzina + totals.ltOther);

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

  ISLAND_TEMPLATE_BLOCKS.forEach((block, index) => {
    // eslint-disable-next-line security/detect-object-injection -- index is the forEach loop index (numeric, in-bounds)
    const section = sections[index];
    const isActive = !!section;

    if (!isActive) {
      setCell(`A${block.startRow}`, '');
      for (let i = 0; i < block.pistolaRows; i++) {
        fillPistolaRow(block.startRow + 2 + i, null);
      }
      if ('fuelTotals' in block) {
        Object.values(block.fuelTotals).forEach(total => {
          setCell(total.litersCell, null);
          setCell(total.euroCell, null);
        });
      } else {
        setCell(block.aggregateTotal.litersCell, null);
        setCell(block.aggregateTotal.euroCell, null);
      }
      return;
    }

    setCell(`A${block.startRow}`, section.label || `Isola ${index + 1}`);

    const pistole = section.pistole || [];
    for (let i = 0; i < block.pistolaRows; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop index
      fillPistolaRow(block.startRow + 2 + i, pistole[i] || null);
    }

    if ('fuelTotals' in block) {
      (['gasolio', 'benzina'] as const).forEach(fuelType => {
        const fuelPistole = pistole.filter(pistola => pistola.tipo === fuelType);
        // eslint-disable-next-line security/detect-object-injection -- fuelType is a fixed local tuple
        const totalCells = block.fuelTotals[fuelType];
        setCell(
          totalCells.litersCell,
          fuelPistole.reduce((total, pistola) => total + pistola.venduti, 0)
        );
        setCell(
          totalCells.euroCell,
          fuelPistole.reduce((total, pistola) => total + pistola.totaleEuro, 0)
        );
      });
    } else {
      setCell(
        block.aggregateTotal.litersCell,
        pistole.reduce((total, pistola) => total + pistola.venduti, 0)
      );
      setCell(
        block.aggregateTotal.euroCell,
        pistole.reduce((total, pistola) => total + pistola.totaleEuro, 0)
      );
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
  const blob = await createPopulatedClosureWorkbook(templateData);
  downloadBlob(blob, `chiusura_${templateData.meta?.dateSlug || 'export'}.xlsx`);
}

export async function generateMultiClosureExcel(closuresData: ExportMetrics[]): Promise<void> {
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
  const today = getISODate(new Date());
  downloadBlob(zipContent, `chiusure_multi_export_${today}.zip`);

  Toast.show('Download ZIP completato!', 'success');
}
