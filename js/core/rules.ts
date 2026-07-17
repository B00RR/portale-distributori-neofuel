/**
 * Core Business Rules
 * Pure functions only. No side effects.
 */

// ========== TYPES ==========
export interface Voucher {
  id?: string;
  code: string;
  amount: number;
  status: string | null;
  expiration_date?: string | null;
  redeemed_at?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  reason?: 'not_found' | 'redeemed' | 'expired' | 'invalid_status';
  details?: { date?: string | null };
}

export interface Movement {
  tipo: string;
  importo: number;
  descrizione?: string;
}

export interface MovimentiSummary {
  credits: number;
  vouchers: number;
  refunds: number;
  extra_cash: number;
}

export interface RevenueParams {
  litersB: number;
  litersG: number;
  priceB: number;
  priceG: number;
}

export interface CashParams {
  carburanteAtteso: number;
  totalPosOperatore: number;
  totalUtaOperatore: number;
  selfPos: number;
  creditsSum: number;
  vouchersSum: number;
  selfCashIn: number;
  selfCashOut: number;
  refundsSum: number;
  extraCashSum: number;
  cashReal: number;
  tolerance?: number;
}

export interface CashResult {
  expected_cash: number;
  cash_diff: number;
  is_valid: boolean;
}

// ========== FUNCTIONS ==========

/**
 * Validates a voucher object against business rules.
 */
export function validateVoucher(voucher: Voucher | null | undefined): ValidationResult {
  if (!voucher) {
    return { valid: false, error: 'Voucher inesistente', reason: 'not_found' };
  }

  // 1. Check if already redeemed
  if (voucher.status === 'redeemed') {
    return {
      valid: false,
      error: 'Voucher Già Riscattato',
      reason: 'redeemed',
      details: { date: voucher.redeemed_at || null }
    };
  }

  // 2. Check expiration
  const now = new Date();
  let isExpired = voucher.status === 'expired';

  if (voucher.expiration_date) {
    const expDate = new Date(voucher.expiration_date);
    // Expiration means "end of the business day in Italy" (#324).
    const endOfDay = new Date(`${expDate.toISOString().split('T')[0]}T23:59:59.999+02:00`);
    const cutoff = Number.isNaN(endOfDay.getTime()) ? expDate : endOfDay;
    if (now > cutoff) {
      isExpired = true;
    }
  }

  if (isExpired) {
    return {
      valid: false,
      error: 'Voucher Scaduto',
      reason: 'expired',
      details: { date: voucher.expiration_date || null }
    };
  }

  // 3. Whitelist status (#255): il DB ammette active/redeemed/expired/void.
  // redeemed/expired sono gestiti sopra; tutto ciò che non è 'active' (o
  // assente, per compatibilità legacy) non è riscattabile — es. 'void'.
  // La RPC resta l'autorità: qui si evita solo di mostrare come valido un
  // voucher che il server rifiuterebbe.
  if (voucher.status != null && voucher.status !== 'active') {
    return {
      valid: false,
      error: voucher.status === 'void' ? 'Voucher Annullato' : 'Voucher non riscattabile',
      reason: 'invalid_status'
    };
  }

  // 4. Success
  return { valid: true };
}

/**
 * Summarizes movements by type
 */
export function summarizeMovimenti(movimenti: Movement[] = []): MovimentiSummary {
  const normalize = (value: number | string | undefined): number => Number(value) || 0;
  const toLower = (value: string | undefined): string => (value || '').toString().toLowerCase();

  const sumBy = (filterFn: (m: Movement) => boolean): number =>
    movimenti.reduce((sum, m) => sum + (filterFn(m) ? normalize(m.importo) : 0), 0);

  return {
    credits: sumBy(
      m =>
        m.tipo === 'credito' || (toLower(m.descrizione).includes('credito') && m.tipo !== 'incasso')
    ),
    vouchers: sumBy(
      m =>
        m.tipo === 'voucher' ||
        m.tipo === 'punti' ||
        toLower(m.descrizione).includes('voucher') ||
        toLower(m.descrizione).includes('punti')
    ),
    refunds: sumBy(
      m =>
        m.tipo === 'pagamento' || m.tipo === 'uscita' || toLower(m.descrizione).includes('rimborso')
    ),
    extra_cash: sumBy(m => m.tipo === 'incasso')
  };
}

/**
 * Calculates theoretic revenue for a shift
 */
export function calculateTheoreticRevenue({
  litersB,
  litersG,
  priceB,
  priceG
}: RevenueParams): number {
  const round = (val: number): number => Math.round((val || 0) * 100) / 100;
  return round(litersB * priceB + litersG * priceG);
}

/**
 * Calculates expected cash for a shift
 */
export function calculateExpectedCash(params: CashParams): CashResult {
  const {
    carburanteAtteso,
    totalPosOperatore,
    totalUtaOperatore,
    selfPos,
    creditsSum,
    vouchersSum,
    selfCashIn,
    selfCashOut,
    refundsSum,
    extraCashSum,
    cashReal,
    tolerance = 5
  } = params;

  const round = (val: number): number => Math.round((val || 0) * 100) / 100;
  const deltaSelf = (Number(selfCashIn) || 0) - (Number(selfCashOut) || 0);

  const expectedCash =
    (Number(carburanteAtteso) || 0) -
    (Number(totalPosOperatore) || 0) -
    (Number(totalUtaOperatore) || 0) -
    (Number(selfPos) || 0) -
    (Number(creditsSum) || 0) -
    (Number(vouchersSum) || 0) +
    deltaSelf -
    (Number(refundsSum) || 0) +
    (Number(extraCashSum) || 0);

  const roundedExpected = round(expectedCash);
  const cashRealNum = Number(cashReal) || 0;
  const cashDiff = round(cashRealNum - roundedExpected);
  const isValid = Math.abs(cashDiff) <= tolerance;

  return {
    expected_cash: roundedExpected,
    cash_diff: cashDiff,
    is_valid: isValid
  };
}
