import { selfNetCash } from '../utils/self-service.js';

export interface ClosingData extends Record<string, unknown> {
  ricavo_teorico?: number | string | null;
  litri_benzina?: number | string | null;
  litri_gasolio?: number | string | null;
  soldi_contanti?: number | string | null;
  soldi_pos_totale?: number | string | null;
  soldi_crediti?: number | string | null;
  soldi_voucher?: number | string | null;
  incasso_uta_dkv?: number | string | null;
  incasso_id_gestore?: number | string | null;
  scontrino_self?: unknown;
  dettaglio_incasso?: unknown;
}

export interface AnalyticsShift {
  closed_at: string | null;
  closing_data: unknown;
}

export interface DayStats {
  date: string;
  revenue: number;
  liters_benzina: number;
  liters_gasolio: number;
}

export interface AnalyticsTotals {
  benzina: number;
  gasolio: number;
  contanti: number;
  pos: number;
  crediti: number;
  voucher: number;
  utaDkv: number;
  idGestore: number;
  revenue: number;
}

export interface AnalyticsResult {
  daily: DayStats[];
  totals: AnalyticsTotals;
}

export function createEmptyDayStats(date: string): DayStats {
  return {
    date,
    revenue: 0,
    liters_benzina: 0,
    liters_gasolio: 0
  };
}

export function createEmptyAnalyticsTotals(): AnalyticsTotals {
  return {
    benzina: 0,
    gasolio: 0,
    contanti: 0,
    pos: 0,
    crediti: 0,
    voucher: 0,
    utaDkv: 0,
    idGestore: 0,
    revenue: 0
  };
}

function toClosingData(value: unknown): ClosingData {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ClosingData;
  }

  return {};
}

function toFiniteMetric(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readPaymentTotals(
  data: ClosingData
): Pick<AnalyticsTotals, 'contanti' | 'pos' | 'crediti' | 'voucher' | 'utaDkv' | 'idGestore'> {
  const selfService = toRecord(data.scontrino_self);
  const operator = toRecord(data.dettaglio_incasso);

  const hasNestedCash =
    hasOwn(selfService, 'banconote_incassate') ||
    hasOwn(selfService, 'banconote_erogate') ||
    hasOwn(operator, 'contanti_operatore');
  const hasNestedPos = hasOwn(selfService, 'bancomat_erogati') || hasOwn(operator, 'pos_operatore');

  return {
    contanti: hasNestedCash
      ? selfNetCash(selfService.banconote_incassate, selfService.banconote_erogate) +
        toFiniteMetric(operator.contanti_operatore)
      : toFiniteMetric(data.soldi_contanti ?? data.incasso_contanti),
    pos: hasNestedPos
      ? toFiniteMetric(selfService.bancomat_erogati) + toFiniteMetric(operator.pos_operatore)
      : toFiniteMetric(data.soldi_pos_totale ?? data.incasso_pos),
    crediti: hasOwn(operator, 'crediti')
      ? toFiniteMetric(operator.crediti)
      : toFiniteMetric(data.soldi_crediti),
    voucher: hasOwn(operator, 'voucher')
      ? toFiniteMetric(operator.voucher)
      : toFiniteMetric(data.soldi_voucher),
    utaDkv:
      hasOwn(selfService, 'transazioni_uta') || hasOwn(operator, 'uta_dkv_operatore')
        ? toFiniteMetric(selfService.transazioni_uta) + toFiniteMetric(operator.uta_dkv_operatore)
        : toFiniteMetric(data.incasso_uta_dkv),
    idGestore: hasOwn(selfService, 'id_gestore')
      ? toFiniteMetric(selfService.id_gestore)
      : toFiniteMetric(data.incasso_id_gestore)
  };
}

const ITALIAN_DAY_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function getItalianDayKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  let year = '';
  let month = '';
  let day = '';
  ITALIAN_DAY_FORMATTER.formatToParts(date).forEach(part => {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  });
  return year && month && day ? `${year}-${month}-${day}` : null;
}

const ITALIAN_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function addCalendarDays(dayKey: string, amount: number): string {
  const [yearText = '', monthText = '', dayText = ''] = dayKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function getItalianOffsetMs(date: Date): number {
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  ITALIAN_OFFSET_FORMATTER.formatToParts(date).forEach(part => {
    if (part.type === 'year') year = Number(part.value);
    if (part.type === 'month') month = Number(part.value);
    if (part.type === 'day') day = Number(part.value);
    if (part.type === 'hour') hour = Number(part.value);
    if (part.type === 'minute') minute = Number(part.value);
    if (part.type === 'second') second = Number(part.value);
  });

  return Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
}

function italianMidnightUtc(dayKey: string): Date {
  const naiveMidnight = Date.parse(`${dayKey}T00:00:00.000Z`);
  let candidate = new Date(naiveMidnight);

  // Resolve the timezone offset at the resulting instant as it can differ from
  // the initial UTC guess around daylight-saving transitions.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    candidate = new Date(naiveMidnight - getItalianOffsetMs(candidate));
  }

  return candidate;
}

export type ItalianAnalyticsRange = '1d' | '7d' | '30d' | 'month' | 'year';

export interface ItalianCalendarRange {
  days: DayStats[];
  startIso: string;
  endExclusiveIso: string;
}

export function createItalianCalendarRange(
  range: ItalianAnalyticsRange,
  now: Date = new Date()
): ItalianCalendarRange {
  const today = getItalianDayKey(now);
  if (!today) {
    throw new Error('Impossibile determinare la data italiana corrente.');
  }

  let start = today;
  if (range === '7d') {
    start = addCalendarDays(today, -6);
  } else if (range === '30d') {
    start = addCalendarDays(today, -29);
  } else if (range === 'month') {
    start = `${today.slice(0, 7)}-01`;
  } else if (range === 'year') {
    start = `${today.slice(0, 4)}-01-01`;
  }

  const endExclusive = addCalendarDays(today, 1);
  const days: DayStats[] = [];
  for (let day = start; day < endExclusive; day = addCalendarDays(day, 1)) {
    days.push(createEmptyDayStats(day));
  }

  return {
    days,
    startIso: italianMidnightUtc(start).toISOString(),
    endExclusiveIso: italianMidnightUtc(endExclusive).toISOString()
  };
}

export function formatItalianDayLabel(dayKey: string): string {
  return `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;
}

export function aggregateShiftAnalytics(
  shifts: readonly AnalyticsShift[],
  seedDays: readonly DayStats[]
): AnalyticsResult {
  const days = new Map(seedDays.map(day => [day.date, { ...day }]));
  const totals = createEmptyAnalyticsTotals();

  shifts.forEach(shift => {
    if (!shift.closed_at) {
      return;
    }

    const dayKey = getItalianDayKey(shift.closed_at);
    const day = dayKey ? days.get(dayKey) : undefined;
    if (!day) {
      return;
    }

    const data = toClosingData(shift.closing_data);
    const revenue = toFiniteMetric(data.ricavo_teorico);
    const litersBenzina = toFiniteMetric(data.litri_benzina);
    const litersGasolio = toFiniteMetric(data.litri_gasolio);
    const payments = readPaymentTotals(data);

    day.revenue += revenue;
    day.liters_benzina += litersBenzina;
    day.liters_gasolio += litersGasolio;

    totals.revenue += revenue;
    totals.benzina += litersBenzina;
    totals.gasolio += litersGasolio;
    totals.contanti += payments.contanti;
    totals.pos += payments.pos;
    totals.crediti += payments.crediti;
    totals.voucher += payments.voucher;
    totals.utaDkv += payments.utaDkv;
    totals.idGestore += payments.idGestore;
  });

  return {
    daily: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)),
    totals
  };
}
