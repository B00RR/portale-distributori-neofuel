// ==========================================
// OPERATOR VOUCHER MANAGEMENT
// Gestione voucher (verifica e riscatto)
// ==========================================
import { supabase } from "./api.js";
import { showErrorMessage, showInfoModal, openModal, closeModal } from "./ui.js";
import { formatEuro, escapeHtml } from "./utils.js";

/**
 * Mostra il menu per la gestione voucher
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showVoucherMenu(stationId, userId) {
    openModal('Gestione Voucher');
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Codice Voucher</label>
        <input type="text" id="voucher-code" class="big-input" placeholder="Inserisci codice..." style="text-transform: uppercase;">
      </div>
      <button class="menu-button primary full-width" id="btn-verify-voucher" style="margin-top: 15px;">
        Verifica Voucher
      </button>
      
      <div id="voucher-result" class="voucher-result-area" style="margin-top: 20px; min-height: 100px;"></div>
    `;

    document.getElementById('btn-verify-voucher').addEventListener('click', async () => {
        const code = document.getElementById('voucher-code').value.trim();
        if (!code) return;

        const resultDiv = document.getElementById('voucher-result');
        resultDiv.innerHTML = '<p class="loading-text">Verifica in corso...</p>';

        try {
            const { data: voucher, error } = await supabase
                .from('vouchers')
                .select('*')
                .eq('code', code)
                .maybeSingle();

            if (error) throw error;

            if (!voucher) {
                resultDiv.innerHTML = '<div style="padding: 15px; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">Voucher non trovato o codice errato.</div>';
                return;
            }

            if (voucher.is_used) {
                resultDiv.innerHTML = `
          <div style="padding: 15px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;">
            <h4 style="margin-top: 0; color: #92400e;">Voucher Già Utilizzato</h4>
            <p style="margin: 8px 0; color: #78350f;">Valore: <strong>${formatEuro(voucher.amount)}</strong></p>
            <p style="margin: 8px 0; color: #78350f;">Utilizzato il: ${new Date(voucher.used_at).toLocaleString('it-IT')}</p>
          </div>
        `;
                return;
            }

            // Voucher valido
            resultDiv.innerHTML = `
        <div style="padding: 20px; background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 8px; text-align: center;">
          <h4 style="margin-top: 0; color: #065f46;">Voucher Valido!</h4>
          <div style="font-size: 2rem; font-weight: 600; color: #047857; margin: 15px 0;">${formatEuro(voucher.amount)}</div>
          <button class="menu-button success full-width" id="btn-redeem-voucher">
            RISCATTA ORA
          </button>
        </div>
      `;

            document.getElementById('btn-redeem-voucher').addEventListener('click', async () => {
                if (!confirm(`Vuoi riscattare questo voucher da ${formatEuro(voucher.amount)}?`)) return;

                try {
                    const { error: redeemError } = await supabase
                        .from('vouchers')
                        .update({
                            is_used: true,
                            used_at: new Date().toISOString()
                        })
                        .eq('id', voucher.id);

                    if (redeemError) throw redeemError;

                    closeModal();
                    showInfoModal('Voucher riscattato con successo!');
                    showVoucherMenu(stationId, userId);

                } catch (err) {
                    showInfoModal('Errore: ' + err.message);
                }
            });

        } catch (err) {
            resultDiv.innerHTML = `<div style="padding: 15px; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">Errore: ${escapeHtml(err.message)}</div>`;
        }
    });
}
