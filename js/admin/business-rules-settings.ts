import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { handleError } from '../shared/error-handler.js';
import { isAdminRole } from '../shared/roles.js';
import { store } from '../shared/state.js';
import { createEl, createIcon } from '../ui/dom-helpers.js';
import { Toast } from '../ui/toast.js';
import { setButtonLoading, showLoadingMessage } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';

/**
 * Renders the business rules settings admin page.
 * Loads rules via BusinessLogicManager, builds form elements using DOM APIs,
 * performs validation, and submits updates.
 *
 * @param container Element where the settings panel is rendered.
 */
export async function showBusinessRulesSettings(container: HTMLElement): Promise<void> {
  if (!container) {
    return;
  }

  // Authorization Guard
  const user = store.getUser();
  const userRole = user?.role || 'operator';
  const isFullAdmin = isAdminRole(userRole);

  if (!isFullAdmin) {
    setSafeHTML(
      container,
      `
      <div class="error-container" style="text-align: center; padding: 60px 20px;">
        <i class="fas fa-lock error-icon" style="font-size: 4rem; color: var(--danger-color, #dc3545); margin-bottom: 20px;"></i>
        <h2 style="margin-bottom: 10px;">Accesso Negato</h2>
        <p style="color: var(--text-secondary);">Non disponi dei permessi necessari per visualizzare questa sezione.</p>
      </div>
    `
    );
    return;
  }

  showLoadingMessage(container);

  try {
    const rules = await BusinessLogicManager.loadRules();

    container.replaceChildren();

    const settingsContainer = createEl('div', { classes: ['settings-shell'] });
    settingsContainer.style.padding = '20px';

    const header = createEl('div', { classes: ['settings-header', 'mb-4'] });
    const title = createEl('h2', { text: 'Impostazioni Regole di Business' });
    const subtitle = createEl('p', {
      classes: ['text-secondary'],
      text: 'Configura i parametri di tolleranza, i limiti di sicurezza prezzo, le allerta stock e le notifiche di sistema.'
    });
    header.appendChild(title);
    header.appendChild(subtitle);
    settingsContainer.appendChild(header);

    const form = createEl('form', { id: 'business-rules-form' });

    // Grid of cards
    const grid = createEl('div', { id: 'business-rules-grid' });
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    grid.style.gap = '20px';
    grid.style.marginBottom = '24px';

    // Helper to create setting card
    const createSettingCard = (options: {
      key: string;
      label: string;
      description: string;
      icon: string;
      inputElement: HTMLElement;
    }): HTMLDivElement => {
      const card = createEl('div', { classes: ['card'] });
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.height = '100%';

      const cardHeader = createEl('div', {
        classes: ['card-header'],
        style: { borderBottom: 'none', paddingBottom: '0' }
      });
      const headerFlex = createEl('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }
      });

      const iconBg = createEl('div', {
        style: {
          background: 'var(--bg-body)',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary-color)'
        }
      });
      iconBg.appendChild(createIcon(options.icon));

      const cardTitle = createEl('h4', { classes: ['card-title'], text: options.label });

      headerFlex.appendChild(iconBg);
      headerFlex.appendChild(cardTitle);
      cardHeader.appendChild(headerFlex);

      const cardBody = createEl('div', {
        classes: ['card-body'],
        style: {
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }
      });

      const desc = createEl('p', {
        classes: ['text-secondary', 'mb-3'],
        style: { fontSize: '0.9em', minHeight: '40px' },
        text: options.description
      });

      const formGroup = createEl('div', { classes: ['form-group', 'mb-0'] });
      formGroup.appendChild(options.inputElement);

      cardBody.appendChild(desc);
      cardBody.appendChild(formGroup);

      card.appendChild(cardHeader);
      card.appendChild(cardBody);

      return card;
    };

    // 1. cash_error_threshold Input
    const cashInput = createEl('input', {
      type: 'number',
      name: 'cash_error_threshold',
      value: String(rules.cash_error_threshold ?? 10),
      classes: ['form-input']
    }) as HTMLInputElement;
    cashInput.style.width = '100%';
    cashInput.setAttribute('min', '0');
    cashInput.setAttribute('max', '1000');
    cashInput.setAttribute('step', '0.01');
    cashInput.required = true;

    const cashInputGroup = createEl('div', {
      classes: ['input-group'],
      style: { display: 'flex', alignItems: 'center', gap: '10px' }
    });
    cashInputGroup.appendChild(cashInput);
    cashInputGroup.appendChild(
      createEl('span', { classes: ['text-secondary', 'font-weight-bold'], text: '€' })
    );

    grid.appendChild(
      createSettingCard({
        key: 'cash_error_threshold',
        label: 'Tolleranza Errore Cassa',
        description:
          'Differenza massima accettata tra cassa attesa e contanti contati a chiusura turno.',
        icon: 'fas fa-hand-holding-usd',
        inputElement: cashInputGroup
      })
    );

    // 2. max_price_limit Input
    const priceInput = createEl('input', {
      type: 'number',
      name: 'max_price_limit',
      value: String(rules.max_price_limit ?? 2.5),
      classes: ['form-input']
    }) as HTMLInputElement;
    priceInput.style.width = '100%';
    priceInput.setAttribute('min', '0');
    priceInput.setAttribute('max', '5');
    priceInput.setAttribute('step', '0.001');
    priceInput.required = true;

    const priceInputGroup = createEl('div', {
      classes: ['input-group'],
      style: { display: 'flex', alignItems: 'center', gap: '10px' }
    });
    priceInputGroup.appendChild(priceInput);
    priceInputGroup.appendChild(
      createEl('span', { classes: ['text-secondary', 'font-weight-bold'], text: '€/L' })
    );

    grid.appendChild(
      createSettingCard({
        key: 'max_price_limit',
        label: 'Tetto Massimo Prezzo',
        description: 'Soglia di sicurezza per evitare errori di battitura nei prezzi carburante.',
        icon: 'fas fa-tags',
        inputElement: priceInputGroup
      })
    );

    // 3. fuel_reserve_alert_liters Input
    const reserveInput = createEl('input', {
      type: 'number',
      name: 'fuel_reserve_alert_liters',
      value: String(rules.fuel_reserve_alert_liters ?? 2000),
      classes: ['form-input']
    }) as HTMLInputElement;
    reserveInput.style.width = '100%';
    reserveInput.setAttribute('min', '0');
    reserveInput.setAttribute('max', '50000');
    reserveInput.setAttribute('step', '1');
    reserveInput.required = true;

    const reserveInputGroup = createEl('div', {
      classes: ['input-group'],
      style: { display: 'flex', alignItems: 'center', gap: '10px' }
    });
    reserveInputGroup.appendChild(reserveInput);
    reserveInputGroup.appendChild(
      createEl('span', { classes: ['text-secondary', 'font-weight-bold'], text: 'L' })
    );

    grid.appendChild(
      createSettingCard({
        key: 'fuel_reserve_alert_liters',
        label: 'Soglia Allerta Riserva',
        description: "Livello minimo di stock in cisterna prima di attivare l'allarme riserva.",
        icon: 'fas fa-oil-can',
        inputElement: reserveInputGroup
      })
    );

    // 4. force_close_hours_threshold Input
    const closeHoursInput = createEl('input', {
      type: 'number',
      name: 'force_close_hours_threshold',
      value: String(rules.force_close_hours_threshold ?? 24),
      classes: ['form-input']
    }) as HTMLInputElement;
    closeHoursInput.style.width = '100%';
    closeHoursInput.setAttribute('min', '1');
    closeHoursInput.setAttribute('max', '168');
    closeHoursInput.setAttribute('step', '1');
    closeHoursInput.required = true;

    const closeHoursInputGroup = createEl('div', {
      classes: ['input-group'],
      style: { display: 'flex', alignItems: 'center', gap: '10px' }
    });
    closeHoursInputGroup.appendChild(closeHoursInput);
    closeHoursInputGroup.appendChild(
      createEl('span', { classes: ['text-secondary', 'font-weight-bold'], text: 'ore' })
    );

    grid.appendChild(
      createSettingCard({
        key: 'force_close_hours_threshold',
        label: 'Scadenza Turno Aperto',
        description:
          'Tempo massimo dopo il quale un turno rimasto aperto può essere forzato in chiusura.',
        icon: 'fas fa-clock',
        inputElement: closeHoursInputGroup
      })
    );

    // 5. critical_discrepancy_alert Input
    const discrepancyInput = createEl('input', {
      type: 'number',
      name: 'critical_discrepancy_alert',
      value: String(rules.critical_discrepancy_alert ?? 50),
      classes: ['form-input']
    }) as HTMLInputElement;
    discrepancyInput.style.width = '100%';
    discrepancyInput.setAttribute('min', '0');
    discrepancyInput.setAttribute('max', '5000');
    discrepancyInput.setAttribute('step', '0.01');
    discrepancyInput.required = true;

    const discrepancyInputGroup = createEl('div', {
      classes: ['input-group'],
      style: { display: 'flex', alignItems: 'center', gap: '10px' }
    });
    discrepancyInputGroup.appendChild(discrepancyInput);
    discrepancyInputGroup.appendChild(
      createEl('span', { classes: ['text-secondary', 'font-weight-bold'], text: '€' })
    );

    grid.appendChild(
      createSettingCard({
        key: 'critical_discrepancy_alert',
        label: 'Soglia Allarme Grave',
        description:
          'Invia una notifica prioritaria se la discrepanza di cassa supera questo valore.',
        icon: 'fas fa-exclamation-triangle',
        inputElement: discrepancyInputGroup
      })
    );

    // 6. notifications_enabled Checkbox
    const notificationsCheckbox = createEl('input', {
      type: 'checkbox',
      name: 'notifications_enabled',
      classes: []
    }) as HTMLInputElement;
    notificationsCheckbox.style.width = '20px';
    notificationsCheckbox.style.height = '20px';
    notificationsCheckbox.checked = rules.notifications_enabled !== false;

    const notificationsLabel = createEl('label', {
      classes: ['ui-toggle'],
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }
    });
    notificationsLabel.appendChild(notificationsCheckbox);
    notificationsLabel.appendChild(
      createEl('span', {
        style: { fontSize: '0.9em', color: 'var(--text-secondary)' },
        text: 'Abilitato'
      })
    );

    grid.appendChild(
      createSettingCard({
        key: 'notifications_enabled',
        label: 'Notifiche Critiche',
        description: "Abilita l'invio di avvisi istantanei per eventi gravi di sistema.",
        icon: 'fas fa-bell',
        inputElement: notificationsLabel
      })
    );

    // 7. last_updated_by Read-only Input
    const updatedByInput = createEl('input', {
      type: 'text',
      name: 'last_updated_by',
      value: rules.last_updated_by || 'Sistema',
      classes: ['form-input']
    }) as HTMLInputElement;
    updatedByInput.readOnly = true;
    updatedByInput.disabled = true;
    updatedByInput.style.width = '100%';
    updatedByInput.style.background = 'var(--bg-body)';
    updatedByInput.style.cursor = 'not-allowed';

    grid.appendChild(
      createSettingCard({
        key: 'last_updated_by',
        label: 'Ultima Modifica di',
        description: "Utente o modulo che ha registrato l'ultimo salvataggio delle regole.",
        icon: 'fas fa-user-edit',
        inputElement: updatedByInput
      })
    );

    // 8. updated_at Read-only Input
    const updatedAtInput = createEl('input', {
      type: 'text',
      name: 'updated_at',
      value: rules.updated_at ? new Date(rules.updated_at).toLocaleString() : 'N/D',
      classes: ['form-input']
    }) as HTMLInputElement;
    updatedAtInput.readOnly = true;
    updatedAtInput.disabled = true;
    updatedAtInput.style.width = '100%';
    updatedAtInput.style.background = 'var(--bg-body)';
    updatedAtInput.style.cursor = 'not-allowed';

    grid.appendChild(
      createSettingCard({
        key: 'updated_at',
        label: 'Data Ultimo Aggiornamento',
        description: 'Data e ora in cui le regole di business sono state aggiornate in archivio.',
        icon: 'fas fa-calendar-alt',
        inputElement: updatedAtInput
      })
    );

    form.appendChild(grid);

    // Sticky Actions Bottom Panel
    const actionsPanel = createEl('div', {
      classes: ['mt-4'],
      style: {
        position: 'sticky',
        bottom: '20px',
        background: 'var(--bg-body)',
        padding: '15px',
        borderTop: '1px solid var(--border-color)',
        zIndex: '10',
        display: 'flex',
        justifyContent: 'flex-end'
      }
    });

    const submitBtn = createEl('button', {
      type: 'submit',
      classes: ['menu-button', 'primary'],
      id: 'save-rules-btn'
    }) as HTMLButtonElement;
    submitBtn.appendChild(createIcon('fas fa-save'));
    submitBtn.appendChild(document.createTextNode(' Salva Regole'));

    actionsPanel.appendChild(submitBtn);
    form.appendChild(actionsPanel);
    settingsContainer.appendChild(form);
    container.appendChild(settingsContainer);

    // Form submit listener
    form.addEventListener('submit', async (e: Event) => {
      e.preventDefault();

      // Client-side validations
      const cash_error_val = parseFloat(cashInput.value);
      if (isNaN(cash_error_val) || cash_error_val < 0 || cash_error_val > 1000) {
        Toast.show('La tolleranza errore cassa deve essere compresa tra 0 e 1000 €.', 'warning');
        cashInput.focus();
        return;
      }

      const max_price_val = parseFloat(priceInput.value);
      if (isNaN(max_price_val) || max_price_val < 0 || max_price_val > 5) {
        Toast.show('Il tetto massimo prezzo deve essere compreso tra 0 e 5 €/L.', 'warning');
        priceInput.focus();
        return;
      }

      const reserve_val = parseFloat(reserveInput.value);
      if (isNaN(reserve_val) || reserve_val < 0 || reserve_val > 50000) {
        Toast.show("La soglia allerta riserva deve essere compresa tra 0 e 50'000 L.", 'warning');
        reserveInput.focus();
        return;
      }

      const close_hours_val = parseInt(closeHoursInput.value, 10);
      if (isNaN(close_hours_val) || close_hours_val < 1 || close_hours_val > 168) {
        Toast.show('La scadenza del turno aperto deve essere compresa tra 1 e 168 ore.', 'warning');
        closeHoursInput.focus();
        return;
      }

      const discrepancy_val = parseFloat(discrepancyInput.value);
      if (isNaN(discrepancy_val) || discrepancy_val < 0 || discrepancy_val > 5000) {
        Toast.show('La soglia allarme grave deve essere compresa tra 0 e 5000 €.', 'warning');
        discrepancyInput.focus();
        return;
      }

      try {
        setButtonLoading(submitBtn, true, 'Salvataggio...');

        // Set metadata on save
        const currentUser = store.getUser();
        const updatedRules = {
          cash_error_threshold: cash_error_val,
          max_price_limit: max_price_val,
          fuel_reserve_alert_liters: reserve_val,
          force_close_hours_threshold: close_hours_val,
          critical_discrepancy_alert: discrepancy_val,
          notifications_enabled: notificationsCheckbox.checked,
          last_updated_by: currentUser?.full_name || currentUser?.email || 'Admin UI'
        };

        await BusinessLogicManager.saveRules(updatedRules);

        // Update read-only metadata fields on UI on successful save
        const freshlySavedRules = await BusinessLogicManager.loadRules();
        if (freshlySavedRules) {
          updatedByInput.value = freshlySavedRules.last_updated_by || 'Sistema';
          updatedAtInput.value = freshlySavedRules.updated_at
            ? new Date(freshlySavedRules.updated_at).toLocaleString()
            : 'N/D';
        }
      } catch (err) {
        handleError(err, 'saveBusinessRulesSettings');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  } catch (err) {
    handleError(err, 'showBusinessRulesSettings', container);
  }
}
