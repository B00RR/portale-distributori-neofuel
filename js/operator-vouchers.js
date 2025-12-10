// ==========================================
// OPERATOR VOUCHER MANAGEMENT
// Gestione voucher e punti (prepagati)
// ==========================================
import { supabase } from "./api.js";
import { showInfoModal, openModal, closeModal } from "./ui.js";
import { createWarningMessage, createBackButton } from "./operator-ui-components.js";
import { checkOpeningStatus } from "./operator-opening.js";
import { Toast } from "./shared/toast.js";

/**
 * Mostra il menu per la gestione voucher e punti
 * @param {number} stationId - ID della stazione
 * @param {number} userId - ID dell'operatore
 */
export async function showVoucherMenu(stationId, userId) {
  openModal('Gestione Voucher & Punti');
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

  // Verifica apertura turno
  const activeOpening = await checkOpeningStatus(stationId);
  if (!activeOpening) {
    modalBody.innerHTML = createWarningMessage(
      "Nessun Turno Aperto",
      "Devi aprire un turno prima di poter gestire voucher o punti."
    ) + `<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>`;

    document.getElementById('btn-close-warning').addEventListener('click', () => closeModal());
    return;
  }

  modalBody.innerHTML = `
        <div class="credits-menu-container">
            <p class="section-subtitle" style="text-align: center; margin-bottom: 20px;">Seleziona un'operazione</p>
            
            <div class="credits-options" style="display: flex; gap: 20px; justify-content: center;">
                <!-- Opzione 1: Voucher -->
                <button id="btn-voucher-op" class="credit-option-card">
                    <div class="icon-wrapper voucher-icon">
                        <i class="fas fa-ticket-alt"></i>
                    </div>
                    <h3>Voucher</h3>
                    <p>Riscatto buono prepagato</p>
                </button>

                <!-- Opzione 2: Punti -->
                <button id="btn-points-op" class="credit-option-card">
                    <div class="icon-wrapper points-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <h3>Punti</h3>
                    <p>Utilizzo punti fedeltà</p>
                </button>
            </div>

            <style>
                .credit-option-card {
                    flex: 1;
                    background: white;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    max-width: 250px;
                }
                .credit-option-card:hover {
                    border-color: #3b82f6;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .icon-wrapper {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    margin-bottom: 5px;
                }
                .icon-wrapper.voucher-icon {
                    background: #fdf2f8;
                    color: #db2777;
                }
                .icon-wrapper.points-icon {
                    background: #fffbeb;
                    color: #d97706;
                }
                .credit-option-card h3 {
                    margin: 0;
                    color: #1e293b;
                    font-size: 1.1rem;
                }
                .credit-option-card p {
                    margin: 0;
                    color: #64748b;
                    font-size: 0.9rem;
                }
            </style>
        </div>
    `;

  document.getElementById('btn-voucher-op').addEventListener('click', () => showVoucherForm(stationId, userId, 'voucher'));
  document.getElementById('btn-points-op').addEventListener('click', () => showVoucherForm(stationId, userId, 'punti'));
}

function showVoucherForm(stationId, userId, type) {
  const isPoints = type === 'punti';
  const title = isPoints ? 'Utilizzo Punti' : 'Riscatto Voucher';
  const icon = isPoints ? 'fa-star' : 'fa-ticket-alt';
  const colorClass = isPoints ? 'points-icon' : 'voucher-icon'; // Reuse styles if possible or define new

  openModal(title);
  const modalBody = document.getElementById('modal-body');

  modalBody.innerHTML = `
        <div class="content-box">
            <h3><i class="fas ${icon}"></i> ${title}</h3>
            <p class="section-subtitle">Registra l'utilizzo di ${isPoints ? 'punti fedeltà' : 'un voucher'}</p>
            
            <form id="voucher-form">
                <div class="form-group">
                    <label>Nome Cliente / Riferimento</label>
                    <input type="text" name="customer_name" class="big-input" required placeholder="Es. Mario Rossi o Codice...">
                </div>

                <div class="form-group">
                    <label>Importo (€)</label>
                    <input type="number" name="amount" step="0.01" min="0.01" class="big-input" required placeholder="0.00">
                </div>

                <div class="form-actions">
                    <button type="button" class="menu-button secondary" id="btn-back-voucher">
                        <i class="fas fa-arrow-left"></i> Indietro
                    </button>
                    <button type="submit" class="menu-button primary">
                        Conferma
                    </button>
                </div>
            </form>
        </div>
    `;

  document.getElementById('btn-back-voucher').addEventListener('click', () => showVoucherMenu(stationId, userId));

  document.getElementById('voucher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const customerName = formData.get('customer_name').trim();
    const amount = parseFloat(formData.get('amount'));

    if (!customerName || amount <= 0) return;

    try {
      await processVoucher(stationId, userId, type, customerName, amount);
      closeModal();
      showInfoModal(`${isPoints ? 'Punti registrati' : 'Voucher registrato'} con successo!`);
    } catch (err) {
      Toast.show('Errore: ' + err.message, 'error');
    }
  });
}

async function processVoucher(stationId, userId, type, customerName, amount) {
  // Inserimento in movimenti_cassa
  // Tipo: 'voucher' o 'punti'
  // Questi tipi verranno sottratti dal contante atteso nella chiusura (come prepagati)

  const description = type === 'punti'
    ? `Punti: ${customerName}`
    : `Voucher: ${customerName}`;

  const { error } = await supabase
    .from('movimenti_cassa')
    .insert([{
      station_id: stationId,
      operator_id: userId,
      tipo: type, // 'voucher' o 'punti'
      importo: amount,
      descrizione: description,
      created_at: new Date().toISOString()
    }]);

  if (error) throw error;
}
