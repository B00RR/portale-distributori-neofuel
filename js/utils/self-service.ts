/**
 * Formula contabile del self service (#326).
 *
 * Lo scontrino self riporta le banconote incassate (inserite dai clienti) e
 * quelle erogate come resto: il contante effettivamente in cassa è il netto
 * fra i due valori, mai il solo erogato.
 */

/** Coercizione esplicita per valori mancanti o non numerici: valgono 0. */
function toFiniteAmount(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `netto_contanti_self = banconote_incassate - banconote_erogate` */
export function selfNetCash(banconoteIncassate: unknown, banconoteErogate: unknown): number {
  return toFiniteAmount(banconoteIncassate) - toFiniteAmount(banconoteErogate);
}

export interface SelfReceiptAmounts {
  banconote_incassate?: unknown;
  banconote_erogate?: unknown;
  bancomat_erogati?: unknown;
  transazioni_uta?: unknown;
}

/** Incasso Totale Self = netto contanti + bancomat + carte (UTA/DKV). */
export function selfTotalIncasso(receipt: SelfReceiptAmounts): number {
  return (
    selfNetCash(receipt.banconote_incassate, receipt.banconote_erogate) +
    toFiniteAmount(receipt.bancomat_erogati) +
    toFiniteAmount(receipt.transazioni_uta)
  );
}

/** Totale carburante erogato self = banconote erogate + bancomat + carte (UTA/DKV). */
export function selfTotalErogato(receipt: SelfReceiptAmounts): number {
  return (
    toFiniteAmount(receipt.banconote_erogate) +
    toFiniteAmount(receipt.bancomat_erogati) +
    toFiniteAmount(receipt.transazioni_uta)
  );
}
