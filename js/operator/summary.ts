// ==========================================
// OPERATOR SHIFT SUMMARY — Resoconto turno
// Issue #412 — Mostra e gestisce modifica/cancellazione voci turno
// ==========================================

import { supabase, type Json, type AppSupabaseClient } from '../core/api.js';
import { logger } from '../core/logger.js';
import { handleError } from '../shared/error-handler.js';
import type { Shift } from '../types.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml } from '../utils/utils.js';

import { checkOpeningStatus } from './opening.js';

// ========== LOCAL INTERFACES ==========

export interface ShiftSummaryItem {
  id: number | string;
  kind:
    | 'opening_cash'
    | 'opening_pos'
    | 'opening_uta'
    | 'opening_total'
    | 'opening_notes'
    | 'opening_pistol'
    | 'opening_tank'
    | 'movimento_cassa'
    | 'credito_movimento'
    | 'credito_cliente'
    | 'voucher'
    | 'invoice'
    | 'punti_riscatti'
    | 'non_erogato'
    | 'customer_refund';
  label: string;
  amount: number;
  method?: string | undefined;
  description?: string | undefined;
  customerName?: string | undefined;
  createdAt: string;
  editable: boolean;
  deletable: boolean;
  originalTable?: string | undefined;
  originalId?: number | string | undefined;
  originalField?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

function fromTable(table: string): ReturnType<AppSupabaseClient['from']> {
  return supabase.from(table as never) as unknown as ReturnType<AppSupabaseClient['from']>;
}

interface ShiftPistolRow {
  id: number;
  shift_id: number;
  pistola_id: number;
  opened_at_counter: number;
  pistole?: { id: number; nome: string | null; tipo_carburante: string | null } | null;
}

interface TankReadingRow {
  id: number;
  shift_id: number;
  tank_id: number;
  liters: number;
  tanks?: { id: number; name: string; fuel_type: string } | null;
}

interface MovimentoCassaRow {
  id: number;
  tipo: string;
  importo: number;
  descrizione?: string | null;
  payment_method?: string | null;
  operator_id?: number | null;
  created_at: string;
}

interface CreditoMovimentoRow {
  id: number;
  cliente_id: number;
  importo: number;
  metodo?: string | null;
  note?: string | null;
  operator_id?: number | null;
  created_at: string;
  crediti_clienti?: { cliente: string } | null;
}

interface CreditoClienteRow {
  id: number;
  cliente: string;
  importo?: number;
  saldo?: number;
  created_at: string;
}

interface VoucherRow {
  id: string | number;
  code: string;
  amount: number;
  redeemed_at?: string | null;
  status?: string | null;
}

interface InvoiceRow {
  id: number;
  customer_name?: string | null;
  amount: number;
  payment_method?: string | null;
  product_category?: string | null;
  description?: string | null;
  status?: string | null;
  created_at: string;
}

interface PuntoRiscattoRow {
  id: number;
  importo: number;
  created_at: string;
}

// ========== BUILD INPUT ==========

export interface BuildShiftSummaryInput {
  shift: Shift;
  shiftPistols: ShiftPistolRow[];
  tankReadings: TankReadingRow[];
  movimentiCassa: MovimentoCassaRow[];
  creditiMovimenti: CreditoMovimentoRow[];
  creditiClienti?: CreditoClienteRow[];
  vouchers: VoucherRow[];
  invoices: InvoiceRow[];
  puntiRiscatti: PuntoRiscattoRow[];
  customerRefunds?: CustomerRefundRow[];
  canEdit: boolean;
}

interface CustomerRefundRow {
  id: number;
  shift_id: number;
  station_id: number;
  operator_id?: number | null;
  amount: number;
  receipt_date: string;
  method: string;
  notes?: string | null;
  created_at: string;
}

// ========== PURE FUNCTIONS (testable) ==========

/**
 * Determina se le voci del turno sono modificabili.
 * Modificabile solo se il turno è aperto.
 */
export function canEditShiftItems(shift: { status: string }): boolean {
  return shift.status === 'open';
}

/**
 * Costruisce l'array uniforme di ShiftSummaryItem dalle sorgenti dati.
 * Funzione pura: non accede a Supabase né al DOM.
 */
export function buildShiftSummaryItems(input: BuildShiftSummaryInput): ShiftSummaryItem[] {
  const {
    shift,
    shiftPistols,
    tankReadings,
    movimentiCassa,
    creditiMovimenti,
    vouchers,
    invoices,
    puntiRiscatti,
    canEdit
  } = input;
  const items: ShiftSummaryItem[] = [];
  const shiftCreated = shift.opened_at || shift.created_at;

  // --- 1. Opening data ---
  const openingData =
    shift.opening_data &&
    typeof shift.opening_data === 'object' &&
    !Array.isArray(shift.opening_data)
      ? (shift.opening_data as Record<string, Json>)
      : null;

  interface OpeningFieldDef {
    field: string;
    kind: ShiftSummaryItem['kind'];
    label: string;
    isNote?: boolean;
  }

  const openingFields: OpeningFieldDef[] = [
    { field: 'cash_in', kind: 'opening_cash', label: 'Contanti in cassa' },
    { field: 'cash_out', kind: 'opening_cash', label: 'Contanti usciti' },
    { field: 'cash_in_minus_out', kind: 'non_erogato', label: 'Non erogato/Residuo' },
    { field: 'pos_amount', kind: 'opening_pos', label: 'POS apertura' },
    { field: 'uta_dkv_iscard', kind: 'opening_uta', label: 'UTA / DKV / iSCard' },
    { field: 'total_amount', kind: 'opening_total', label: 'Totale apertura' },
    { field: 'notes', kind: 'opening_notes', label: 'Note apertura', isNote: true }
  ];

  for (const def of openingFields) {
    const raw = openingData ? openingData[def.field] : undefined;
    let numericValue = def.isNote ? 0 : typeof raw === 'number' ? raw : Number(raw) || 0;

    if (def.field === 'cash_in_minus_out' && (raw === undefined || raw === null)) {
      const cashIn =
        typeof openingData?.cash_in === 'number'
          ? openingData.cash_in
          : Number(openingData?.cash_in) || 0;
      const cashOut =
        typeof openingData?.cash_out === 'number'
          ? openingData.cash_out
          : Number(openingData?.cash_out) || 0;
      numericValue = cashIn - cashOut;
    }

    const descriptionValue = def.isNote ? (typeof raw === 'string' ? raw : '') : undefined;
    const isNonErogato = def.kind === 'non_erogato';

    items.push({
      id: `opening-${def.field}`,
      kind: def.kind,
      label: def.label,
      amount: numericValue,
      description: descriptionValue,
      createdAt: shiftCreated,
      editable: isNonErogato ? false : canEdit,
      deletable: false,
      originalTable: 'shifts',
      originalId: shift.id,
      originalField: def.field
    });
  }

  // --- 2. Shift pistols (contatori apertura) ---
  for (const sp of shiftPistols) {
    items.push({
      id: `pistol-${sp.id}`,
      kind: 'opening_pistol',
      label: sp.pistole?.nome ?? `Pistola ${sp.pistola_id}`,
      amount: sp.opened_at_counter,
      description: sp.pistole?.tipo_carburante ?? undefined,
      createdAt: shiftCreated,
      editable: canEdit,
      deletable: false,
      originalTable: 'shift_pistols',
      originalId: sp.id,
      metadata: { pistola_id: sp.pistola_id }
    });
  }

  // --- 3. Tank readings (livelli cisterne) ---
  for (const tr of tankReadings) {
    items.push({
      id: `tank-${tr.id}`,
      kind: 'opening_tank',
      label: tr.tanks?.name ?? `Cisterna ${tr.tank_id}`,
      amount: tr.liters,
      description: tr.tanks?.fuel_type ?? undefined,
      createdAt: shiftCreated,
      editable: canEdit,
      deletable: false,
      originalTable: 'tank_readings',
      originalId: tr.id,
      metadata: { tank_id: tr.tank_id }
    });
  }

  // --- 4. Movimenti cassa ---
  for (const mc of movimentiCassa) {
    if (mc.tipo?.trim().toLowerCase() === 'credito') {
      continue;
    }
    items.push({
      id: mc.id,
      kind: 'movimento_cassa',
      label: mc.tipo || 'Movimento',
      amount: mc.importo,
      method: mc.payment_method ?? undefined,
      description: mc.descrizione ?? undefined,
      createdAt: mc.created_at,
      editable: canEdit,
      deletable: canEdit,
      originalTable: 'movimenti_cassa',
      originalId: mc.id
    });
  }

  // --- 5. Crediti movimenti ---
  for (const cm of creditiMovimenti) {
    const rawMethod = cm.metodo?.trim().toLowerCase();
    items.push({
      id: cm.id,
      kind: 'credito_movimento',
      label: cm.crediti_clienti?.cliente || 'Credito',
      amount: cm.importo,
      method: cm.metodo && rawMethod !== 'credito' ? cm.metodo : undefined,
      description: cm.note ?? undefined,
      customerName: undefined,
      createdAt: cm.created_at,
      editable: canEdit,
      deletable: canEdit,
      originalTable: 'crediti_movimenti',
      originalId: cm.id
    });
  }

  // --- 6. Voucher ---
  for (const v of vouchers) {
    items.push({
      id: v.id,
      kind: 'voucher',
      label: `Voucher ${v.code}`,
      amount: v.amount,
      description: v.status ?? undefined,
      createdAt: v.redeemed_at ?? '',
      editable: false, // mai modificabile
      deletable: canEdit,
      originalTable: 'vouchers',
      originalId: v.id
    });
  }

  // --- 7. Invoices ---
  for (const inv of invoices) {
    items.push({
      id: inv.id,
      kind: 'invoice',
      label: 'Fattura',
      amount: inv.amount,
      method: inv.payment_method ?? undefined,
      description: inv.description ?? undefined,
      customerName: inv.customer_name ?? undefined,
      createdAt: inv.created_at,
      editable: canEdit,
      deletable: canEdit,
      originalTable: 'invoices',
      originalId: inv.id,
      metadata: {
        product_category: inv.product_category,
        status: inv.status
      }
    });
  }

  // --- 8. Punti riscattati ---
  for (const pr of puntiRiscatti) {
    items.push({
      id: pr.id,
      kind: 'punti_riscatti',
      label: 'Punti riscattati',
      amount: pr.importo,
      createdAt: pr.created_at,
      editable: canEdit,
      deletable: canEdit,
      originalTable: 'punti_riscatti',
      originalId: pr.id
    });
  }
  // --- 9. Customer refunds ---
  const customerRefunds = input.customerRefunds ?? [];
  for (const cr of customerRefunds) {
    items.push({
      id: cr.id,
      kind: 'customer_refund',
      label: 'Rimborso cliente',
      amount: cr.amount,
      method: cr.method,
      description: cr.notes
        ? `${cr.notes} — Scontrino: ${cr.receipt_date}`
        : `Scontrino: ${cr.receipt_date}`,
      createdAt: cr.created_at,
      editable: canEdit,
      deletable: canEdit,
      originalTable: 'customer_refunds',
      originalId: cr.id,
      metadata: {
        receipt_date: cr.receipt_date
      }
    });
  }

  return items;
}

// ========== CATEGORY DEFINITIONS ==========

interface CategoryDef {
  title: string;
  icon: string;
  kinds: ShiftSummaryItem['kind'][];
  unit?: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    title: 'Dati apertura',
    icon: 'fa-door-open',
    kinds: [
      'opening_cash',
      'opening_pos',
      'opening_uta',
      'opening_total',
      'opening_notes',
      'non_erogato'
    ]
  },
  { title: 'Contatori pistole', icon: 'fa-gas-pump', kinds: ['opening_pistol'], unit: 'L' },
  { title: 'Livelli cisterne', icon: 'fa-oil-can', kinds: ['opening_tank'], unit: 'L' },
  {
    title: 'Movimenti cassa',
    icon: 'fa-exchange-alt',
    kinds: ['movimento_cassa', 'customer_refund']
  },
  { title: 'Crediti', icon: 'fa-credit-card', kinds: ['credito_movimento'] },
  { title: 'Voucher', icon: 'fa-ticket-alt', kinds: ['voucher'] },
  { title: 'Fatture', icon: 'fa-file-invoice', kinds: ['invoice'] },
  { title: 'Punti riscattati', icon: 'fa-star', kinds: ['punti_riscatti'] }
];

// ========== MAIN ENTRY POINT ==========

/**
 * Mostra il resoconto del turno corrente.
 * Renderizza in modale condivisa (#modal-body).
 */
export async function showShiftSummary(
  stationId: number | string,
  userId: string | number
): Promise<void> {
  openModal('Resoconto turno');
  const container = document.getElementById('modal-body');
  if (!container) {
    logger.error('summary', 'Container #modal-body non trovato');
    return;
  }

  setSafeHTML(
    container,
    '<div class="loading-spinner" style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Caricamento resoconto…</div>'
  );

  try {
    const numericStationId = Number(stationId);
    const shift = await checkOpeningStatus(stationId);

    if (!shift) {
      renderNoShiftOpen(container);
      return;
    }

    const canEdit = canEditShiftItems(shift);

    // Carica dati in parallelo
    const [
      pistolsRes,
      tanksRes,
      movimentiRes,
      creditiMovRes,
      vouchersRes,
      invoicesRes,
      puntiRes,
      customerRefundsRes
    ] = await Promise.all([
      supabase
        .from('shift_pistols')
        .select('id, shift_id, pistola_id, opened_at_counter, pistole(id, nome, tipo_carburante)')
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      supabase
        .from('tank_readings')
        .select('id, shift_id, tank_id, liters, tanks(id, name, fuel_type)')
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      supabase
        .from('movimenti_cassa')
        .select('id, tipo, importo, descrizione, payment_method, operator_id, created_at')
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      supabase
        .from('crediti_movimenti')
        .select(
          'id, cliente_id, importo, metodo, note, operator_id, created_at, crediti_clienti(cliente)'
        )
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      supabase
        .from('vouchers')
        .select('id, code, amount, redeemed_at, status')
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      supabase
        .from('invoices')
        .select(
          'id, customer_name, amount, payment_method, product_category, description, status, created_at'
        )
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      fromTable('punti_riscatti')
        .select('id, importo, created_at')
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id),
      fromTable('customer_refunds')
        .select(
          'id, shift_id, station_id, operator_id, amount, receipt_date, method, notes, created_at'
        )
        .eq('station_id', numericStationId)
        .eq('shift_id', shift.id)
    ]);

    const items = buildShiftSummaryItems({
      shift,
      shiftPistols: (pistolsRes.data ?? []) as unknown as ShiftPistolRow[],
      tankReadings: (tanksRes.data ?? []) as unknown as TankReadingRow[],
      movimentiCassa: (movimentiRes.data ?? []) as unknown as MovimentoCassaRow[],
      creditiMovimenti: (creditiMovRes.data ?? []) as unknown as CreditoMovimentoRow[],
      vouchers: (vouchersRes.data ?? []) as unknown as VoucherRow[],
      invoices: (invoicesRes.data ?? []) as unknown as InvoiceRow[],
      puntiRiscatti: (puntiRes.data ?? []) as unknown as PuntoRiscattoRow[],
      customerRefunds: (customerRefundsRes.data ?? []) as unknown as CustomerRefundRow[],
      canEdit
    });

    renderSummary(container, items, canEdit, shift, numericStationId, userId);
  } catch (err) {
    handleError(err, 'summary.load', container);
  }
}

// ========== RENDER HELPERS ==========

function renderNoShiftOpen(container: HTMLElement): void {
  setSafeHTML(
    container,
    `
    <div class="content-box" style="text-align:center;padding:2rem;">
      <i class="fas fa-info-circle" style="font-size:2.5rem;color:var(--info-color);margin-bottom:1rem;"></i>
      <h3>Nessun turno aperto</h3>
      <p style="margin:1rem 0;">Non è presente un turno aperto per questa stazione.</p>
      <button id="btn-open-shift" class="menu-button primary" style="width:auto;min-width:180px;">
        <i class="fas fa-door-open"></i> Apri turno
      </button>
    </div>
  `
  );

  document.getElementById('btn-open-shift')?.addEventListener('click', () => {
    // Simula click sul pulsante Turno (apertura)
    const btnTurno = document.getElementById('btn-turno');
    if (btnTurno) {
      btnTurno.click();
    }
  });
}

function renderSummary(
  container: HTMLElement,
  items: ShiftSummaryItem[],
  canEdit: boolean,
  shift: Shift,
  stationId: number,
  userId: string | number
): void {
  const readOnlyBanner = !canEdit
    ? `<div class="warning-box" style="margin-bottom:1rem;padding:0.75rem 1rem;border-radius:8px;background:rgba(255,193,7,0.1);border-left:4px solid var(--warning-color,#ffc107);">
        <i class="fas fa-lock"></i> Turno chiuso — il resoconto è in sola lettura
      </div>`
    : '';

  let html = `<div class="content-box summary-resoconto">${readOnlyBanner}`;

  for (const cat of CATEGORIES) {
    const catItems = items.filter(i => (cat.kinds as string[]).includes(i.kind));
    if (catItems.length === 0) {
      continue;
    }

    html += `
      <div class="summary-category" style="margin-bottom:1.5rem;">
        <h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
          <i class="fas ${escapeHtml(cat.icon)}"></i> ${escapeHtml(cat.title)}
        </h4>
        <div class="summary-items" style="display:flex;flex-direction:column;gap:0.5rem;">
    `;

    for (const item of catItems) {
      html += renderSummaryItem(item, cat.unit);
    }

    html += '</div></div>';
  }

  html += '</div>';
  setSafeHTML(container, html);

  // Attach edit/delete listeners
  attachSummaryActions(container, items, shift, stationId, userId);
}

function summaryItemKey(item: ShiftSummaryItem): string {
  return `${item.kind}:${String(item.id)}`;
}

function renderSummaryItem(item: ShiftSummaryItem, unit?: string): string {
  const kindIcons: Record<string, string> = {
    opening_cash: 'fa-coins',
    opening_pos: 'fa-credit-card',
    opening_uta: 'fa-id-card',
    opening_total: 'fa-calculator',
    opening_notes: 'fa-sticky-note',
    opening_pistol: 'fa-gas-pump',
    opening_tank: 'fa-oil-can',
    movimento_cassa: 'fa-exchange-alt',
    credito_movimento: 'fa-hand-holding-usd',
    credito_cliente: 'fa-user-tag',
    voucher: 'fa-ticket-alt',
    invoice: 'fa-file-invoice',
    punti_riscatti: 'fa-star',
    non_erogato: 'fa-hand-holding-usd',
    customer_refund: 'fa-undo'
  };

  const icon = kindIcons[item.kind] ?? 'fa-circle';
  const isNote = item.kind === 'opening_notes';
  const displayValue = isNote
    ? escapeHtml(item.description ?? '—')
    : formatAmount(item.amount, unit);

  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : '';

  const methodBadge = item.method
    ? `<span class="badge" style="font-size:0.75em;background:var(--bg-body);padding:2px 6px;border-radius:4px;margin-left:0.5rem;">${escapeHtml(item.method)}</span>`
    : '';

  const customerLabel = item.customerName
    ? `<span style="color:var(--text-secondary);font-size:0.85em;margin-left:0.5rem;">${escapeHtml(item.customerName)}</span>`
    : '';

  const descLabel =
    item.description && !isNote
      ? `<span style="color:var(--text-secondary);font-size:0.85em;display:block;">${escapeHtml(item.description)}</span>`
      : '';

  let actions = '';
  const itemKey = escapeHtml(summaryItemKey(item));
  if (item.editable || item.deletable) {
    actions = '<span class="summary-item-actions" style="display:flex;gap:0.35rem;flex-shrink:0;">';
    if (item.editable) {
      actions += `<button class="btn-edit-item icon-btn" data-item-key="${itemKey}" title="Modifica" aria-label="Modifica"><i class="fas fa-pencil-alt"></i></button>`;
    }
    if (item.deletable) {
      const deleteLabel = item.kind === 'credito_cliente' ? 'Elimina e reinserisci' : 'Elimina';
      actions += `<button class="btn-delete-item icon-btn" data-item-key="${itemKey}" title="${escapeHtml(deleteLabel)}" aria-label="${escapeHtml(deleteLabel)}"><i class="fas fa-trash-alt"></i></button>`;
    }
    actions += '</span>';
  } else if (!item.editable && !item.deletable && !item.kind.startsWith('opening_')) {
    actions = '<span style="font-size:0.75em;color:var(--text-secondary);">Non modificabile</span>';
  }

  return `
    <div class="summary-item" data-item-id="${escapeHtml(String(item.id))}" data-item-key="${itemKey}" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;border-radius:6px;background:var(--bg-body);border:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0;">
        <i class="fas ${escapeHtml(icon)}" style="color:var(--info-color);width:1.25rem;text-align:center;flex-shrink:0;"></i>
        <div style="flex:1;min-width:0;">
          <span style="font-weight:500;">${escapeHtml(item.label)}</span>${customerLabel}${methodBadge}
          ${descLabel}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="font-weight:600;white-space:nowrap;">${displayValue}</span>
        <span style="font-size:0.75em;color:var(--text-secondary);white-space:nowrap;">${escapeHtml(dateStr)}</span>
        ${actions}
      </div>
    </div>
  `;
}

function formatAmount(value: number, unit?: string): string {
  if (unit === 'L') {
    return `${value.toLocaleString('it-IT')} L`;
  }
  return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ========== ACTION HANDLERS ==========

function attachSummaryActions(
  container: HTMLElement,
  items: ShiftSummaryItem[],
  shift: Shift,
  stationId: number,
  userId: string | number
): void {
  container.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', e => {
      const target = (e.currentTarget as HTMLElement).dataset.itemKey;
      const item = items.find(i => summaryItemKey(i) === target);
      if (item) {
        void editSummaryItem(item, shift, stationId, userId);
      }
    });
  });

  container.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', e => {
      const target = (e.currentTarget as HTMLElement).dataset.itemKey;
      const item = items.find(i => summaryItemKey(i) === target);
      if (item) {
        void deleteSummaryItem(item, stationId, userId);
      }
    });
  });
}

/**
 * Cancella una voce del resoconto dopo conferma.
 */
async function deleteSummaryItem(
  item: ShiftSummaryItem,
  stationId: number,
  userId: string | number
): Promise<void> {
  // Opening items non sono eliminabili (guardia)
  if (item.kind.startsWith('opening_')) {
    Toast.show('Le voci di apertura non possono essere eliminate.', 'warning');
    return;
  }

  if (!item.originalTable || item.originalId == null) {
    Toast.show('Dati insufficienti per eliminare questa voce.', 'warning');
    return;
  }

  const confirmed = await openConfirmModal(
    `Vuoi eliminare "${item.label}"? Questa azione non può essere annullata.`
  );
  if (!confirmed) {
    return;
  }

  try {
    if (item.kind === 'invoice') {
      const { error } = await supabase.rpc('delete_shift_invoice', {
        p_invoice_id: Number(item.originalId)
      });
      if (error) {
        throw error;
      }
    } else {
      const { error } = await fromTable(item.originalTable).delete().eq('id', item.originalId);
      if (error) {
        throw error;
      }
    }
    Toast.show('Voce eliminata con successo.', 'success');
    // Ricarica il resoconto
    await showShiftSummary(stationId, userId);
  } catch (err) {
    handleError(err, 'summary.delete');
  }
}

/**
 * Apre una modale di modifica per una voce del resoconto.
 */
async function editSummaryItem(
  item: ShiftSummaryItem,
  shift: Shift,
  stationId: number,
  userId: string | number
): Promise<void> {
  openModal(`Modifica: ${item.label}`);
  const modalBody = document.getElementById('modal-body');
  if (!modalBody) {
    return;
  }

  const formHtml = buildEditForm(item);
  setSafeHTML(modalBody, formHtml);

  const form = document.getElementById('summary-edit-form') as HTMLFormElement | null;
  if (!form) {
    return;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await processEdit(item, shift, form);
      closeModal();
      Toast.show('Voce aggiornata con successo.', 'success');
      await showShiftSummary(stationId, userId);
    } catch (err) {
      handleError(err, 'summary.edit');
    }
  });

  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    void showShiftSummary(stationId, userId);
  });
}

function buildEditForm(item: ShiftSummaryItem): string {
  let fields = '';

  if (item.kind === 'opening_notes') {
    fields = `
      <div class="form-group">
        <label>Note</label>
        <textarea name="notes" class="big-input" rows="3">${escapeHtml(item.description ?? '')}</textarea>
      </div>
    `;
  } else if (item.kind === 'opening_pistol') {
    fields = `
      <div class="form-group">
        <label>Contatore (L)</label>
        <input type="number" name="counter" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
    `;
  } else if (item.kind === 'opening_tank') {
    fields = `
      <div class="form-group">
        <label>Litri</label>
        <input type="number" name="liters" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
    `;
  } else if (item.kind.startsWith('opening_')) {
    // opening_cash, opening_pos, opening_uta, opening_total
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="amount" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
    `;
  } else if (item.kind === 'movimento_cassa') {
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="importo" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
      <div class="form-group">
        <label>Descrizione</label>
        <textarea name="descrizione" class="big-input" rows="2">${escapeHtml(item.description ?? '')}</textarea>
      </div>
      <div class="form-group">
        <label>Metodo di pagamento</label>
        <input type="text" name="payment_method" class="big-input" value="${escapeHtml(item.method ?? '')}">
      </div>
    `;
  } else if (item.kind === 'credito_movimento') {
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="importo" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea name="note" class="big-input" rows="2">${escapeHtml(item.description ?? '')}</textarea>
      </div>
    `;
  } else if (item.kind === 'invoice') {
    const paymentMethod = item.method ?? '';
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="amount" step="0.01" min="0.01" class="big-input" value="${item.amount}" required>
      </div>
      <div class="form-group">
        <label>Metodo di pagamento</label>
        <select name="payment_method" class="big-input" required>
          <option value="">Seleziona…</option>
          <option value="contanti" ${paymentMethod === 'contanti' ? 'selected' : ''}>Contanti</option>
          <option value="pos" ${paymentMethod === 'pos' ? 'selected' : ''}>POS</option>
          <option value="bonifico" ${paymentMethod === 'bonifico' ? 'selected' : ''}>Bonifico</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descrizione</label>
        <textarea name="description" class="big-input" rows="2">${escapeHtml(item.description ?? '')}</textarea>
      </div>
    `;
  } else if (item.kind === 'punti_riscatti') {
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="importo" step="0.01" min="0" class="big-input" value="${item.amount}" required>
      </div>
    `;
  } else if (item.kind === 'customer_refund') {
    const receiptDate = (item.metadata?.receipt_date as string) || '';
    const cleanNotes = item.description
      ? item.description.replace(/ — Scontrino: .*$/, '').replace(/^Scontrino: .*$/, '')
      : '';
    fields = `
      <div class="form-group">
        <label>Importo (€)</label>
        <input type="number" name="amount" step="0.01" min="0.01" class="big-input" value="${item.amount}" required>
      </div>
      <div class="form-group">
        <label>Data scontrino</label>
        <input type="date" name="receipt_date" class="big-input" value="${escapeHtml(receiptDate)}" required>
      </div>
      <div class="form-group">
        <label>Metodo rimborso</label>
        <select name="method" class="big-input" required>
          <option value="cash" ${item.method === 'cash' ? 'selected' : ''}>Contanti</option>
          <option value="erogation" ${item.method === 'erogation' ? 'selected' : ''}>Erogazione carburante</option>
        </select>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea name="notes" class="big-input" rows="2">${escapeHtml(cleanNotes)}</textarea>
      </div>
    `;
  }

  return `
    <form id="summary-edit-form">
      ${fields}
      <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;">
        <button type="button" id="btn-cancel-edit" class="menu-button btn-danger">Annulla</button>
        <button type="submit" class="menu-button primary">Salva</button>
      </div>
    </form>
  `;
}

async function processEdit(
  item: ShiftSummaryItem,
  shift: Shift,
  form: HTMLFormElement
): Promise<void> {
  const fd = new FormData(form);

  if (item.kind === 'opening_notes') {
    if (!item.originalField) {
      throw new Error('Campo originale mancante');
    }
    const notes = fd.get('notes') as string;
    await updateOpeningDataField(shift, item.originalField, notes);
    return;
  }

  if (item.kind.startsWith('opening_') && !['opening_pistol', 'opening_tank'].includes(item.kind)) {
    if (!item.originalField) {
      throw new Error('Campo originale mancante');
    }
    const rawVal = fd.get('amount') as string;
    const numVal = parseFloat(rawVal);
    validateNumeric(numVal);
    await updateOpeningDataField(shift, item.originalField, numVal);
    return;
  }

  if (item.kind === 'opening_pistol') {
    if (item.originalId === undefined) {
      throw new Error('ID mancante');
    }
    const rawVal = fd.get('counter') as string;
    const numVal = parseFloat(rawVal);
    validateNumeric(numVal);
    const { error } = await supabase
      .from('shift_pistols')
      .update({ opened_at_counter: numVal })
      .eq('id', Number(item.originalId));
    if (error) {
      throw error;
    }
    return;
  }

  if (item.kind === 'opening_tank') {
    if (item.originalId === undefined) {
      throw new Error('ID mancante');
    }
    const rawVal = fd.get('liters') as string;
    const numVal = parseFloat(rawVal);
    validateNumeric(numVal);
    const { error } = await supabase
      .from('tank_readings')
      .update({ liters: numVal })
      .eq('id', Number(item.originalId));
    if (error) {
      throw error;
    }
    return;
  }

  // Generic table updates
  if (!item.originalTable || item.originalId == null) {
    throw new Error('Dati insufficienti per aggiornare questa voce.');
  }

  const payload: Record<string, unknown> = {};

  if (item.kind === 'movimento_cassa') {
    const importo = parseFloat(fd.get('importo') as string);
    validateNumeric(importo);
    payload.importo = importo;
    payload.descrizione = fd.get('descrizione') as string;
    payload.payment_method = fd.get('payment_method') as string;
  } else if (item.kind === 'credito_movimento') {
    const importo = parseFloat(fd.get('importo') as string);
    validateNumeric(importo);
    payload.importo = importo;
    payload.note = fd.get('note') as string;
  } else if (item.kind === 'invoice') {
    const amount = parseFloat(fd.get('amount') as string);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Importo non valido');
    }
    const paymentMethod = String(fd.get('payment_method') ?? '').trim();
    if (!paymentMethod) {
      throw new Error('Metodo di pagamento obbligatorio');
    }
    const description = String(fd.get('description') ?? '').trim() || null;
    const { error } = await supabase.rpc('update_shift_invoice', {
      p_invoice_id: Number(item.originalId),
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_description: description
    });
    if (error) {
      throw error;
    }
    return;
  } else if (item.kind === 'punti_riscatti') {
    const importo = parseFloat(fd.get('importo') as string);
    validateNumeric(importo);
    payload.importo = importo;
  } else if (item.kind === 'customer_refund') {
    const amount = parseFloat(fd.get('amount') as string);
    validateNumeric(amount);
    if (amount <= 0) {
      throw new Error('Importo non valido');
    }
    payload.amount = amount;
    payload.receipt_date = fd.get('receipt_date') as string;
    payload.method = fd.get('method') as string;
    payload.notes = fd.get('notes') as string;
  }

  const { error } = await fromTable(item.originalTable)
    .update(payload as never)
    .eq('id', item.originalId);
  if (error) {
    throw error;
  }
}

async function updateOpeningDataField(shift: Shift, field: string, value: unknown): Promise<void> {
  const currentData: Record<string, Json> =
    shift.opening_data &&
    typeof shift.opening_data === 'object' &&
    !Array.isArray(shift.opening_data)
      ? { ...(shift.opening_data as Record<string, Json>) }
      : {};

  switch (field) {
    case 'cash_in':
      currentData.cash_in = value as Json;
      break;
    case 'cash_out':
      currentData.cash_out = value as Json;
      break;
    case 'cash_in_minus_out':
      currentData.cash_in_minus_out = value as Json;
      break;
    case 'pos_amount':
      currentData.pos_amount = value as Json;
      break;
    case 'uta_dkv_iscard':
      currentData.uta_dkv_iscard = value as Json;
      break;
    case 'total_amount':
      currentData.total_amount = value as Json;
      break;
    case 'notes':
      currentData.notes = value as Json;
      break;
    default:
      throw new Error(`Campo non valido: ${field}`);
  }

  const { error } = await supabase
    .from('shifts')
    .update({ opening_data: currentData as Json })
    .eq('id', shift.id);

  if (error) {
    throw error;
  }
}

function validateNumeric(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Il valore deve essere un numero finito e >= 0.');
  }
}
