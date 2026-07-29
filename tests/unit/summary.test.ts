import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/api.js', () => ({
  supabase: {},
  Json: {}
}));

// These are pure functions – no Supabase mock needed.
import {
  canEditShiftItems,
  buildShiftSummaryItems,
  ShiftSummaryItem
} from '../../js/operator/summary.js';

// ── helpers ──────────────────────────────────────────────────

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    station_id: 10,
    operator_id: 42,
    opened_at: '2026-07-22T06:00:00Z',
    closed_at: null,
    status: 'open',
    opening_data: {
      cash_in: 500,
      cash_out: 100,
      pos_amount: 200,
      total_amount: 800,
      uta_dkv_iscard: 50,
      cash_in_minus_out: 400,
      notes: 'Test note'
    },
    closing_data: null,
    updated_at: '2026-07-22T06:00:00Z',
    created_at: '2026-07-22T06:00:00Z',
    ...overrides
  };
}

const emptyData = {
  shiftPistols: [],
  tankReadings: [],
  movimentiCassa: [],
  creditiMovimenti: [],
  creditiClienti: [],
  vouchers: [],
  invoices: [],
  puntiRiscatti: []
};

// ── canEditShiftItems ────────────────────────────────────────

describe('canEditShiftItems', () => {
  it('returns true when status is open', () => {
    expect(canEditShiftItems({ status: 'open' })).toBe(true);
  });

  it('returns false when status is partial', () => {
    expect(canEditShiftItems({ status: 'partial' })).toBe(false);
  });

  it('returns false when status is closed', () => {
    expect(canEditShiftItems({ status: 'closed' })).toBe(false);
  });

  it('returns false for any other status', () => {
    expect(canEditShiftItems({ status: 'unknown' })).toBe(false);
  });
});

// ── buildShiftSummaryItems ───────────────────────────────────

describe('buildShiftSummaryItems', () => {
  it('decomposes opening_data into individual summary items', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      canEdit: true
    });

    const openingKinds = items.filter(
      i => i.kind.startsWith('opening_') || i.kind === 'non_erogato'
    );

    // cash_in, cash_out, cash_in_minus_out, pos_amount, uta_dkv_iscard,
    // total_amount, notes = 7 items
    expect(openingKinds.length).toBe(7);

    const cashIn = openingKinds.find(i => i.originalField === 'cash_in');
    expect(cashIn).toBeDefined();
    expect(cashIn!.kind).toBe('opening_cash');
    expect(cashIn!.amount).toBe(500);
    expect(cashIn!.editable).toBe(true);
    expect(cashIn!.deletable).toBe(false);

    const notes = openingKinds.find(i => i.originalField === 'notes');
    expect(notes).toBeDefined();
    expect(notes!.kind).toBe('opening_notes');
    expect(notes!.amount).toBe(0);
    expect(notes!.description).toBe('Test note');
  });

  it('produces opening_pistol items for shift_pistols', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      shiftPistols: [
        {
          id: 100,
          shift_id: 1,
          pistola_id: 5,
          opened_at_counter: 12345,
          pistole: { id: 5, nome: 'Pistola 1', tipo_carburante: 'benzina' }
        }
      ],
      canEdit: true
    });

    const pistolItems = items.filter(i => i.kind === 'opening_pistol');
    expect(pistolItems.length).toBe(1);
    expect(pistolItems[0]!.amount).toBe(12345);
    expect(pistolItems[0]!.originalTable).toBe('shift_pistols');
    expect(pistolItems[0]!.editable).toBe(true);
    expect(pistolItems[0]!.deletable).toBe(false);
  });

  it('produces opening_tank items for tank_readings', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      tankReadings: [
        {
          id: 200,
          shift_id: 1,
          tank_id: 3,
          liters: 5000,
          tanks: { id: 3, name: 'Cisterna GPL', fuel_type: 'gpl' }
        }
      ],
      canEdit: false
    });

    const tankItems = items.filter(i => i.kind === 'opening_tank');
    expect(tankItems.length).toBe(1);
    expect(tankItems[0]!.amount).toBe(5000);
    expect(tankItems[0]!.editable).toBe(false);
  });

  it('produces movimento_cassa items with correct kind', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      movimentiCassa: [
        {
          id: 10,
          tipo: 'uscita',
          importo: 30,
          descrizione: 'Benzina auto',
          payment_method: 'contanti',
          operator_id: 42,
          created_at: '2026-07-22T08:00:00Z'
        }
      ],
      canEdit: true
    });

    const movItems = items.filter(i => i.kind === 'movimento_cassa');
    expect(movItems.length).toBe(1);
    expect(movItems[0]!.amount).toBe(30);
    expect(movItems[0]!.editable).toBe(true);
    expect(movItems[0]!.deletable).toBe(true);
    expect(movItems[0]!.originalTable).toBe('movimenti_cassa');
  });

  it('produces credito_movimento items with customer name as label and no method badge for credito', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      creditiMovimenti: [
        {
          id: 20,
          cliente_id: 5,
          importo: 50,
          metodo: 'credito',
          note: 'Pagamento parziale',
          operator_id: 42,
          created_at: '2026-07-22T09:00:00Z',
          crediti_clienti: { cliente: 'Mario Rossi' }
        }
      ],
      canEdit: true
    });

    const credMovItems = items.filter(i => i.kind === 'credito_movimento');
    expect(credMovItems.length).toBe(1);
    expect(credMovItems[0]!.label).toBe('Mario Rossi');
    expect(credMovItems[0]!.customerName).toBeUndefined();
    expect(credMovItems[0]!.method).toBeUndefined();
    expect(credMovItems[0]!.editable).toBe(true);
    expect(credMovItems[0]!.deletable).toBe(true);
  });

  it('does NOT produce credito_cliente items from creditiClienti table', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      creditiClienti: [
        {
          id: 30,
          cliente: 'Luigi Verdi',
          importo: 100,
          saldo: 100,
          created_at: '2026-07-22T10:00:00Z'
        }
      ],
      canEdit: true
    });

    const ccItems = items.filter(i => (i.kind as string) === 'credito_cliente');
    expect(ccItems.length).toBe(0);
  });

  it('voucher is NOT editable and NOT deletable even when canEdit is true', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      vouchers: [
        {
          id: 'v1',
          code: 'VOUCH-01',
          amount: 50,
          redeemed_at: '2026-07-22T11:00:00Z',
          status: 'redeemed'
        }
      ],
      canEdit: true
    });

    const vItems = items.filter(i => i.kind === 'voucher');
    expect(vItems.length).toBe(1);
    expect(vItems[0]!.editable).toBe(false);
    expect(vItems[0]!.deletable).toBe(false);
  });

  it('invoice items are editable and deletable when canEdit', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      invoices: [
        {
          id: 40,
          customer_name: 'Azienda SRL',
          amount: 150,
          payment_method: 'pos',
          product_category: 'carburante',
          description: 'Rifornimento flotta',
          status: 'pending',
          created_at: '2026-07-22T12:00:00Z'
        }
      ],
      canEdit: true
    });

    const invItems = items.filter(i => i.kind === 'invoice');
    expect(invItems.length).toBe(1);
    expect(invItems[0]!.editable).toBe(true);
    expect(invItems[0]!.deletable).toBe(true);
    expect(invItems[0]!.customerName).toBe('Azienda SRL');
  });

  it('punti_riscatti items are editable and deletable when canEdit', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      puntiRiscatti: [
        {
          id: 50,
          importo: 10,
          created_at: '2026-07-22T13:00:00Z'
        }
      ],
      canEdit: true
    });

    const prItems = items.filter(i => i.kind === 'punti_riscatti');
    expect(prItems.length).toBe(1);
    expect(prItems[0]!.amount).toBe(10);
    expect(prItems[0]!.editable).toBe(true);
    expect(prItems[0]!.deletable).toBe(true);
  });

  it('sets all editable/deletable to false when canEdit is false', () => {
    const shift = makeShift({ status: 'closed' });
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      movimentiCassa: [
        {
          id: 10,
          tipo: 'incasso',
          importo: 50,
          created_at: '2026-07-22T08:00:00Z'
        }
      ],
      creditiClienti: [
        {
          id: 30,
          cliente: 'Luigi',
          saldo: 100,
          created_at: '2026-07-22T10:00:00Z'
        }
      ],
      vouchers: [
        {
          id: 'v-2',
          code: 'XYZ',
          amount: 15,
          redeemed_at: '2026-07-22T11:00:00Z'
        }
      ],
      canEdit: false
    });

    // All items should not be editable or deletable
    for (const item of items) {
      // Opening items are never deletable regardless
      if (item.kind.startsWith('opening_')) {
        expect(item.deletable).toBe(false);
      }
      // When canEdit is false, nothing is editable
      expect(item.editable).toBe(false);
      // When canEdit is false, nothing is deletable
      expect(item.deletable).toBe(false);
    }
  });

  it('handles null opening_data gracefully', () => {
    const shift = makeShift({ opening_data: null });
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      canEdit: true
    });

    // Should still produce items (with 0 amounts) or no opening items
    // depending on implementation — at minimum, should not throw
    expect(Array.isArray(items)).toBe(true);
  });

  it('category totals are consistent across all items', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      movimentiCassa: [
        { id: 1, tipo: 'uscita', importo: 30, created_at: '2026-07-22T08:00:00Z' },
        { id: 2, tipo: 'uscita', importo: 20, created_at: '2026-07-22T08:30:00Z' },
        { id: 3, tipo: 'incasso', importo: 100, created_at: '2026-07-22T09:00:00Z' }
      ],
      canEdit: true
    });

    const movItems = items.filter(i => i.kind === 'movimento_cassa');
    expect(movItems.length).toBe(3);

    const totalMovimenti = movItems.reduce((sum, i) => sum + i.amount, 0);
    expect(totalMovimenti).toBe(150); // 30 + 20 + 100
  });

  it('produces read-only non_erogato item with cash_in - cash_out fallback when cash_in_minus_out is missing', () => {
    const shift = makeShift({
      opening_data: {
        cash_in: 600,
        cash_out: 150
      }
    });
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      canEdit: true
    });

    const nonErogato = items.find(i => i.kind === 'non_erogato');
    expect(nonErogato).toBeDefined();
    expect(nonErogato!.label).toBe('Non erogato/Residuo');
    expect(nonErogato!.amount).toBe(450); // 600 - 150
    expect(nonErogato!.editable).toBe(false);
    expect(nonErogato!.deletable).toBe(false);
  });

  it('produces customer_refund items editable and deletable when canEdit is true', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      customerRefunds: [
        {
          id: 500,
          shift_id: 1,
          station_id: 10,
          operator_id: 42,
          amount: 45,
          receipt_date: '2026-07-23',
          method: 'cash',
          notes: 'Non erogato pompa 2',
          created_at: '2026-07-23T11:00:00Z'
        }
      ],
      canEdit: true
    });

    const refundItems = items.filter(i => i.kind === 'customer_refund');
    expect(refundItems.length).toBe(1);
    expect(refundItems[0]!.amount).toBe(45);
    expect(refundItems[0]!.label).toBe('Rimborso cliente');
    expect(refundItems[0]!.method).toBe('cash');
    expect(refundItems[0]!.description).toContain('Non erogato pompa 2');
    expect(refundItems[0]!.description).toContain('Scontrino: 2026-07-23');
    expect(refundItems[0]!.editable).toBe(true);
    expect(refundItems[0]!.deletable).toBe(true);
  });
});

// ── grouping helper ──────────────────────────────────────────

describe('buildShiftSummaryItems grouping', () => {
  it('groups items by kind for rendering categories', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      shiftPistols: [
        {
          id: 100,
          shift_id: 1,
          pistola_id: 5,
          opened_at_counter: 12345,
          pistole: { id: 5, nome: 'P1', tipo_carburante: 'benzina' }
        }
      ],
      tankReadings: [
        {
          id: 200,
          shift_id: 1,
          tank_id: 3,
          liters: 5000,
          tanks: { id: 3, name: 'T1', fuel_type: 'gpl' }
        }
      ],
      movimentiCassa: [{ id: 10, tipo: 'uscita', importo: 30, created_at: '2026-07-22T08:00:00Z' }],
      creditiMovimenti: [],
      creditiClienti: [],
      vouchers: [],
      invoices: [],
      puntiRiscatti: [],
      canEdit: true
    });

    // Group by category
    const groups = new Map<string, ShiftSummaryItem[]>();
    for (const item of items) {
      const existing = groups.get(item.kind) ?? [];
      existing.push(item);
      groups.set(item.kind, existing);
    }

    // Should have items in multiple categories
    expect(groups.has('opening_cash')).toBe(true);
    expect(groups.has('opening_pistol')).toBe(true);
    expect(groups.has('opening_tank')).toBe(true);
    expect(groups.has('movimento_cassa')).toBe(true);
  });
});

// ── Issue #423 Mandatory Verification Tests ──────────────────

describe('Issue #423 mandatory requirements', () => {
  it('1. movimenti_cassa with tipo: "credito" produces no movimento_cassa item while incasso/uscita remain', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      movimentiCassa: [
        { id: 1, tipo: 'credito', importo: 50, created_at: '2026-07-24T08:00:00Z' },
        { id: 2, tipo: ' Credito ', importo: 75, created_at: '2026-07-24T08:10:00Z' },
        { id: 3, tipo: 'incasso', importo: 100, created_at: '2026-07-24T08:20:00Z' },
        { id: 4, tipo: 'uscita', importo: 20, created_at: '2026-07-24T08:30:00Z' }
      ],
      canEdit: true
    });

    const movItems = items.filter(i => i.kind === 'movimento_cassa');
    expect(movItems.length).toBe(2);
    expect(movItems.map(i => i.label)).toEqual(['incasso', 'uscita']);
  });

  it('2. creditiMovimenti with Cimmino, gasolio note, and creditiClienti with €0 produces single correct credit item', () => {
    const shift = makeShift();
    const items = buildShiftSummaryItems({
      shift: shift as any,
      ...emptyData,
      creditiMovimenti: [
        {
          id: 10,
          cliente_id: 1,
          importo: 45.5,
          metodo: 'credito',
          note: 'gasolio',
          operator_id: 42,
          created_at: '2026-07-24T09:00:00Z',
          crediti_clienti: { cliente: 'Cimmino' }
        }
      ],
      creditiClienti: [
        {
          id: 99,
          cliente: 'Cimmino',
          saldo: 0,
          created_at: '2026-07-24T06:00:00Z'
        }
      ],
      canEdit: true
    });

    const creditItems = items.filter(
      i => i.kind === 'credito_movimento' || (i.kind as string) === 'credito_cliente'
    );

    // Esiste una sola voce credito
    expect(creditItems.length).toBe(1);

    const item = creditItems[0]!;
    // Label = Cimmino, non "Pagamento credito"
    expect(item.label).toBe('Cimmino');
    // Description contiene gasolio
    expect(item.description).toBe('gasolio');
    // Amount è corretto
    expect(item.amount).toBe(45.5);
    // Non esiste un item credito_cliente
    const creditoClienteItem = items.find(i => (i.kind as string) === 'credito_cliente');
    expect(creditoClienteItem).toBeUndefined();
    // Non compare customerName duplicato
    expect(item.customerName).toBeUndefined();
    // Non viene impostato il badge metodo credito
    expect(item.method).toBeUndefined();
  });
});
