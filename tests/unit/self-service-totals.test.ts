/**
 * Formula contabile del self service (#326):
 * `netto_contanti_self = banconote_incassate - banconote_erogate` e
 * `Incasso Totale Self = netto contanti + bancomat + carte`.
 */
import { describe, it, expect } from 'vitest';

import { selfNetCash, selfTotalIncasso } from '../../js/utils/self-service.js';

describe('selfNetCash (#326)', () => {
  it('returns the net when incassate exceed erogate', () => {
    expect(selfNetCash(150, 30)).toBe(120);
  });

  it('returns zero when incassate equal erogate', () => {
    expect(selfNetCash(80, 80)).toBe(0);
  });

  it('returns a negative net when erogate exceed incassate', () => {
    expect(selfNetCash(20, 50)).toBe(-30);
  });

  it('treats missing or invalid values as zero', () => {
    expect(selfNetCash(undefined, undefined)).toBe(0);
    expect(selfNetCash(100, undefined)).toBe(100);
    expect(selfNetCash(undefined, 40)).toBe(-40);
    expect(selfNetCash('not-a-number', 10)).toBe(-10);
    expect(selfNetCash(null, Infinity)).toBe(0);
  });
});

describe('selfTotalIncasso (#326)', () => {
  it('sums net cash, bancomat and cards', () => {
    expect(
      selfTotalIncasso({
        banconote_incassate: 200,
        banconote_erogate: 50,
        bancomat_erogati: 75,
        transazioni_uta: 25
      })
    ).toBe(250);
  });

  it('does NOT count erogate as revenue (the audited bug)', () => {
    // Con la vecchia formula (erogate + bancomat + carte) questo caso
    // avrebbe mostrato 130 € invece del reale 40 €.
    expect(
      selfTotalIncasso({
        banconote_incassate: 100,
        banconote_erogate: 90,
        bancomat_erogati: 20,
        transazioni_uta: 10
      })
    ).toBe(40);
  });

  it('handles an empty receipt as zero', () => {
    expect(selfTotalIncasso({})).toBe(0);
  });

  it('handles a cash-only receipt', () => {
    expect(selfTotalIncasso({ banconote_incassate: 60, banconote_erogate: 10 })).toBe(50);
  });
});
