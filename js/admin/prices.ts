/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore - Export present in module but resolution failing in some contexts
import { supabase, safeSupabaseQuery, getStationName } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/ui.js';
import { escapeHtml, escapeNumber } from '../utils/utils.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';

// --- INTERFACES ---

interface PriceRecord {
    id: number;
    station_id: number;
    prezzo_benzina: number;
    prezzo_gasolio: number;
    prezzo_gpl?: number | null;
    prezzo_metano?: number | null;
    data_validita: string;
}

// --- MAIN FUNCTIONS ---

export async function showPrezziAdminModal(stationId: number | string): Promise<void> {
    const stationName = await getStationName(stationId);
    openModal(`Modifica Prezzi - ${escapeHtml(stationName)}`);
    const target = document.getElementById('modal-body');
    if (!target) return;

    try {
        const { data: current, error } = await supabase
            .from('prezzi_distributore')
            .select('*')
            .eq('station_id', stationId)
            .order('data_validita', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        const priceRecord = current as PriceRecord | null;

        const benzinaValue = escapeNumber(priceRecord?.prezzo_benzina);
        const gasolioValue = escapeNumber(priceRecord?.prezzo_gasolio);

        target.innerHTML = `
    <form id="admin-prezzi-form">
      <div class="form-group"><label>Benzina</label><input class="price-input" type="number" step="0.001" min="0" name="benzina" value="${benzinaValue}" /></div>
      <div class="form-group"><label>Gasolio</label><input class="price-input" type="number" step="0.001" min="0" name="gasolio" value="${gasolioValue}" /></div>
      <fieldset class="form-group prezzi-validita-group">
        <legend>Validità</legend>
        <div class="validita-grid">
          <label class="validita-option">
            <input type="radio" name="validita" value="ora" checked>
            <span>Da ora</span>
          </label>
          <label class="validita-option">
            <input type="radio" name="validita" value="prossima">
            <span>Dalla prossima chiusura</span>
          </label>
        </div>
      </fieldset>
      <button type="submit" class="menu-button primary">Salva Prezzi</button>
    </form>
  `;

        const form = document.getElementById('admin-prezzi-form') as HTMLFormElement;
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fd = new FormData(form);
                const validita = fd.get('validita')?.toString() || 'ora';

                // Calcola data validità
                const dataValidita = new Date();
                if (validita === 'prossima') {
                    // TODO: Implement logic to get next closure date or set a flag
                    // For now, it defaults to now
                }

                const benzina = parseFloat(fd.get('benzina')?.toString() || '0') || 0;
                const gasolio = parseFloat(fd.get('gasolio')?.toString() || '0') || 0;

                try {
                    // Business Logic Guardrail: Price Ceiling
                    const rules = await BusinessLogicManager.loadRules();
                    if (benzina > rules.max_price_limit || gasolio > rules.max_price_limit) {
                        Toast.show(`Il prezzo non può superare il tetto di sicurezza di €${rules.max_price_limit.toFixed(2)}`, 'warning');
                        return;
                    }
                    // Use server-side RPC function for secure price update
                    const { error } = await supabase.rpc('admin_update_price', {
                        p_station_id: Number(stationId),
                        p_benzina: benzina,
                        p_gasolio: gasolio,
                        p_data_validita: dataValidita.toISOString()
                    });

                    if (error) { throw error; }

                    closeModal();
                    Toast.show('Prezzi aggiornati!', 'success');
                } catch (err) {
                    handleError(err, 'savePrices');
                }
            });
        }
    } catch (err) {
        handleError(err, 'showPrezziAdminModal', target);
    }
}

export async function showPricesTab(container: HTMLElement, headerActions: HTMLElement | null): Promise<void> {
    if (headerActions) { headerActions.innerHTML = ''; }
    container.innerHTML = `
        <div class="content-box">
            <h3>Gestione Prezzi</h3>
            <p>Seleziona un distributore dalla sezione "Distributori" per modificarne i prezzi.</p>
            <button class="menu-button primary" onclick="document.querySelector('[data-tab=\\'stations\\']').click()">Vai a Distributori</button>
        </div>
    `;
}

