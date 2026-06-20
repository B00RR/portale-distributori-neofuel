import { supabase, getStationName } from '../core/api.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/ui.js';
import { escapeHtml, escapeNumber } from '../utils/utils.js';

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

// --- HELPER FUNCTIONS ---

function createRadioOption(name: string, value: string, checked: boolean, labelText: string, disabled = false): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'validita-option';
  if (disabled) {
    label.classList.add('disabled');
  }
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  if (checked) {
    input.checked = true;
  }
  if (disabled) {
    input.disabled = true;
  }
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

// --- MAIN FUNCTIONS ---

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

export async function showPrezziAdminModal(stationId: number | string): Promise<void> {
  const stationName = await getStationName(stationId);
  openModal(`Modifica Prezzi - ${escapeHtml(stationName)}`);
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  try {
    const { data: current, error } = await supabase
      .from('prezzi_distributore')
      .select('*')
      .eq('station_id', Number(stationId))
      .order('data_validita', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {throw error;}

    const priceRecord = current as PriceRecord | null;

    const benzinaValue = escapeNumber(priceRecord?.prezzo_benzina);
    const gasolioValue = escapeNumber(priceRecord?.prezzo_gasolio);

    // Build form safely with DOM APIs
    const form = document.createElement('form');
    form.id = 'admin-prezzi-form';

    const benzinaGroup = document.createElement('div');
    benzinaGroup.className = 'form-group';
    const benzinaLabel = document.createElement('label');
    benzinaLabel.textContent = 'Benzina';
    const benzinaInput = document.createElement('input');
    benzinaInput.className = 'price-input';
    benzinaInput.type = 'number';
    benzinaInput.step = '0.001';
    benzinaInput.min = '0';
    benzinaInput.name = 'benzina';
    benzinaInput.value = benzinaValue;
    benzinaGroup.append(benzinaLabel, benzinaInput);

    const gasolioGroup = document.createElement('div');
    gasolioGroup.className = 'form-group';
    const gasolioLabel = document.createElement('label');
    gasolioLabel.textContent = 'Gasolio';
    const gasolioInput = document.createElement('input');
    gasolioInput.className = 'price-input';
    gasolioInput.type = 'number';
    gasolioInput.step = '0.001';
    gasolioInput.min = '0';
    gasolioInput.name = 'gasolio';
    gasolioInput.value = gasolioValue;
    gasolioGroup.append(gasolioLabel, gasolioInput);

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'form-group prezzi-validita-group';
    const legend = document.createElement('legend');
    legend.textContent = 'Validità';
    const validitaGrid = document.createElement('div');
    validitaGrid.className = 'validita-grid';

    const optionOra = createRadioOption('validita', 'ora', true, 'Da ora');
    // "Dalla prossima chiusura" is disabled until backend support lands (see #67):
    // deferring validity to the next shift closure needs an RPC/DB change, so the
    // option is hidden behind a disabled state instead of silently applying "now".
    const optionProssima = createRadioOption('validita', 'prossima', false, 'Dalla prossima chiusura (non ancora disponibile)', true);
    validitaGrid.append(optionOra, optionProssima);
    fieldset.append(legend, validitaGrid);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'menu-button primary';
    submitBtn.textContent = 'Salva Prezzi';

    form.append(benzinaGroup, gasolioGroup, fieldset, submitBtn);
    target.appendChild(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);

      // Only "Da ora" is selectable; deferred ("prossima chiusura") validity is
      // disabled pending backend support (#67), so the effective date is now.
      const dataValidita = new Date();

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
  } catch (err) {
    handleError(err, 'showPrezziAdminModal', target);
  }
}
