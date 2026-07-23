import { supabase } from '../core/api.js';
import { Toast } from '../ui/toast.js';
import { setSafeHTML } from '../utils/sanitizer.js';

import { checkOpeningStatus } from './opening.js';
import { router } from './router.js';

/**
 * Mostra il form per registrare un rimborso cliente.
 * @param stationId ID della stazione
 * @param operatorId ID dell'operatore
 */
export async function showCustomerRefundForm(stationId: number, operatorId: number): Promise<void> {
  void operatorId;
  const container = document.getElementById('operator-content');
  if (!container) {
    return;
  }

  setSafeHTML(
    container,
    '<div class="loading-spinner" style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Caricamento…</div>'
  );

  const activeOpening = await checkOpeningStatus(stationId);
  if (!activeOpening) {
    setSafeHTML(
      container,
      `
        <div class="content-box warning-box" style="max-width: 500px; margin: 40px auto; padding: 20px; text-align: center;">
          <h2><i class="fas fa-exclamation-triangle"></i> Nessun Turno Aperto</h2>
          <p style="margin: 15px 0;">Devi aprire un turno prima di poter registrare un rimborso cliente.</p>
          <button id="btn-cancel-refund" data-testid="btn-cancel-refund" class="menu-button primary" style="width: auto; min-width: 150px;">Torna indietro</button>
        </div>
      `
    );
    document.getElementById('btn-cancel-refund')?.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.navigateTo('resoconto');
      }
    });
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  setSafeHTML(
    container,
    `
      <div class="content-box" style="max-width: 600px; margin: 20px auto;" data-testid="customer-refund-form-container">
        <h2><i class="fas fa-undo"></i> Rimborso Cliente</h2>
        <p class="section-subtitle">Registra un rimborso per banconote incassate ma non erogate</p>
        <form id="customer-refund-form" data-testid="customer-refund-form">
          <div class="form-group">
            <label for="refund-amount">Importo rimborso (€) *</label>
            <input type="number" id="refund-amount" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00" data-testid="refund-amount">
          </div>
          <div class="form-group">
            <label for="refund-receipt-date">Data scontrino *</label>
            <input type="date" id="refund-receipt-date" name="receipt_date" value="${today}" class="big-input" required data-testid="refund-receipt-date">
          </div>
          <div class="form-group">
            <label for="refund-method">Metodo rimborso *</label>
            <select id="refund-method" name="method" class="big-input" required data-testid="refund-method">
              <option value="cash">Contanti</option>
              <option value="erogation">Erogazione carburante</option>
            </select>
          </div>
          <div class="form-group">
            <label for="refund-notes">Note</label>
            <textarea id="refund-notes" name="notes" rows="3" class="big-input" placeholder="Note opzionali..." data-testid="refund-notes"></textarea>
          </div>
          <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="submit" id="btn-confirm-refund" data-testid="btn-confirm-refund" class="menu-button primary full-width">Conferma</button>
            <button type="button" id="btn-cancel-refund" data-testid="btn-cancel-refund" class="menu-button secondary full-width">Annulla</button>
          </div>
        </form>
      </div>
    `
  );

  const form = document.getElementById('customer-refund-form') as HTMLFormElement | null;
  const btnCancel = document.getElementById('btn-cancel-refund');

  btnCancel?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      router.navigateTo('resoconto');
    }
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const amount = parseFloat((formData.get('amount') as string) || '0');
    const receiptDate = (formData.get('receipt_date') as string) || '';
    const method = (formData.get('method') as string) || 'cash';
    const notes = (formData.get('notes') as string) || '';

    if (!amount || amount <= 0) {
      Toast.show('Inserire un importo valido.', 'warning');
      return;
    }
    if (!receiptDate) {
      Toast.show('Inserire la data dello scontrino.', 'warning');
      return;
    }

    try {
      const { error } = await supabase.rpc('create_customer_refund', {
        p_shift_id: activeOpening.id,
        p_station_id: Number(stationId),
        p_amount: amount,
        p_receipt_date: receiptDate,
        p_method: method,
        p_notes: notes
      });

      if (error) {
        throw error;
      }

      Toast.show('Rimborso cliente registrato con successo', 'success');
      router.navigateTo('resoconto');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Errore durante la registrazione del rimborso';
      Toast.show(msg, 'error');
    }
  });
}
