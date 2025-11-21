// ==========================================
// OPERATOR VOUCHER MANAGEMENT
// Gestione voucher (verifica e riscatto)
// ==========================================
import { supabase } from "./api.js";
import { showErrorMessage, showInfoModal } from "./ui.js";
import { formatEuro } from "./utils.js";

/**
 * Mostra il menu per la gestione voucher
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showVoucherMenu(stationId, userId) {
    const container = document.getElementById('operator-content');

    container.innerHTML = `
    <div class="content-box">
      <h3><i class="fas fa-ticket-alt"></i> Gestione Voucher</h3>
      <div class="form-group">
        <label>Codice Voucher</label>
        <input type="text" id="voucher-code" class="big-input" placeholder="Inserisci codice..." style="text-transform: uppercase;">
      </div>
      <button class="menu-button primary full-width" id="btn-verify-voucher">
        Verifica Voucher
      </button>
      
      <div id="voucher-result" class="voucher-result-area"></div>

      <button class="menu-button secondary full-width" id="btn-back-menu-vouch" style="margin-top: 20px;">
        <i class="fas fa-arrow-left"></i> Torna al Menu
      </button>
    </div>
  `;

    document.getElementById('btn-back-menu-vouch').addEventListener('click', () => {
        container.innerHTML = '<div class="welcome-message"><p>Seleziona un\'attività dal menu in alto.</p></div>';
    });

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
                resultDiv.innerHTML = '<div class="error-msg">Voucher non trovato o codice errato.</div>';
                return;
            }

            if (voucher.is_used) {
                resultDiv.innerHTML = `
          <div class="warning-message">
            <h4>Voucher Già Utilizzato</h4>
            <p>Valore: ${formatEuro(voucher.amount)}</p>
            <p>Utilizzato il: ${new Date(voucher.used_at).toLocaleString()}</p>
          </div>
        `;
                return;
            }

            // Voucher valido
            resultDiv.innerHTML = `
        <div class="success-message" style="margin: 20px 0;">
          <h4>Voucher Valido!</h4>
          <div class="voucher-amount">${formatEuro(voucher.amount)}</div>
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

                    showInfoModal('Voucher riscattato con successo!');
                    showVoucherMenu(stationId, userId);

                } catch (err) {
                    showErrorMessage(container, err);
                }
            });

        } catch (err) {
            resultDiv.innerHTML = `<div class="error-msg">Errore: ${err.message}</div>`;
        }
    });
}
