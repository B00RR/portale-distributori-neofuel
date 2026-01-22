/**
 * Core Business Rules
 * Pure functions only. No side effects.
 */

// ========== TYPES ==========
export interface Voucher {
    id?: string;
    code: string;
    amount: number;
    status: 'active' | 'redeemed' | 'expired' | 'void';
    expiration_date?: string | null;
    redeemed_at?: string | null;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    reason?: 'not_found' | 'redeemed' | 'expired';
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
 * Determines whether a voucher is valid according to business rules.
 *
 * Checks existence, redeemed status, and expiration and returns a structured result.
 *
 * @param voucher - The voucher to validate; may be `null` or `undefined` to represent a missing voucher.
 * @returns A ValidationResult object. `valid` is `true` when the voucher can be used; otherwise includes `error`, `reason` (`not_found`, `redeemed`, or `expired`), and optional `details.date`.
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
        if (expDate < now) {
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

    // 3. Success
    return { valid: true };
}

/**
 * Aggregate a list of movements into totals for credits, vouchers, refunds, and extra cash.
 *
 * @param movimenti - Array of movements to summarize
 * @returns An object with:
 *  - `credits`: sum of movements classified as credits (tipo `"credito"` or descrizione containing "credito", excluding tipo `"incasso"`),
 *  - `vouchers`: sum of movements classified as vouchers or points (tipo `"voucher"` or `"punti"` or descrizione containing "voucher" or "punti"),
 *  - `refunds`: sum of movements classified as refunds (tipo `"pagamento"` or `"uscita"` or descrizione containing "rimborso"),
 *  - `extra_cash`: sum of movements with tipo `"incasso"`
 */
export function summarizeMovimenti(movimenti: Movement[] = []): MovimentiSummary {
    const normalize = (value: number | string | undefined): number => Number(value) || 0;
    const toLower = (value: string | undefined): string => (value || "").toString().toLowerCase();

    const sumBy = (filterFn: (m: Movement) => boolean): number =>
        movimenti.reduce((sum, m) => sum + (filterFn(m) ? normalize(m.importo) : 0), 0);

    return {
        credits: sumBy(m => (m.tipo === "credito" || (toLower(m.descrizione).includes("credito") && m.tipo !== "incasso"))),
        vouchers: sumBy(m => (m.tipo === "voucher" || m.tipo === "punti" || toLower(m.descrizione).includes("voucher") || toLower(m.descrizione).includes("punti"))),
        refunds: sumBy(m => (m.tipo === "pagamento" || m.tipo === "uscita" || toLower(m.descrizione).includes("rimborso"))),
        extra_cash: sumBy(m => m.tipo === "incasso")
    };
}

/**
 * Compute the expected revenue from two fuel types for a shift.
 *
 * @param litersB - Liters sold of fuel type B
 * @param litersG - Liters sold of fuel type G
 * @param priceB - Unit price for fuel type B
 * @param priceG - Unit price for fuel type G
 * @returns The revenue (liters * price summed across both fuels), rounded to two decimals
 */
export function calculateTheoreticRevenue({ litersB, litersG, priceB, priceG }: RevenueParams): number {
    const round = (val: number): number => Math.round((val || 0) * 100) / 100;
    return round((litersB * priceB) + (litersG * priceG));
}

/**
 * Compute the expected cash at shift end and compare it to the reported cash.
 *
 * @param params - Input totals and adjustments used to derive expected cash (see `CashParams`), including an optional `tolerance` (default 5) for validity check
 * @returns An object with:
 *  - `expected_cash`: the rounded expected cash for the shift,
 *  - `cash_diff`: the rounded difference between reported cash and `expected_cash`,
 *  - `is_valid`: `true` if the absolute `cash_diff` is less than or equal to `tolerance`, `false` otherwise
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

    const expectedCash = (Number(carburanteAtteso) || 0)
        - (Number(totalPosOperatore) || 0)
        - (Number(totalUtaOperatore) || 0)
        - (Number(selfPos) || 0)
        - (Number(creditsSum) || 0)
        - (Number(vouchersSum) || 0)
        + deltaSelf
        - (Number(refundsSum) || 0)
        + (Number(extraCashSum) || 0);

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