/**
 * Core Business Rules
 * Pure functions only. No side effects.
 */

/**
 * Validates a voucher object against business rules.
 * @param {Object} voucher - The voucher database object
 * @returns {{ valid: boolean, error?: string, reason?: string, details?: any }}
 */
export function validateVoucher(voucher) {
    if (!voucher) {
        return { valid: false, error: 'Voucher inesistente', reason: 'not_found' };
    }

    // 1. Check if already redeemed
    if (voucher.status === 'redeemed') {
        return {
            valid: false,
            error: 'Voucher Già Riscattato',
            reason: 'redeemed',
            details: { date: voucher.redeemed_at }
        };
    }

    // 2. Check expiration
    const now = new Date();
    // Normalize now to midnight if expiration is inclusive of the day, 
    // but usually expiration is a specific timestamp or end of day. 
    // Assuming strict comparison for now.

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
            details: { date: voucher.expiration_date }
        };
    }

    // 3. Success
    return { valid: true };
}
