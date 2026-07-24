/**
 * Operator Layout Module
 * Handles rendering of operator shell and shared UI components
 */

import { getStationName, supabase } from '../core/api.js';
import { clearSession } from '../core/auth.js';
import { logger } from '../core/logger.js';
import { getFailedCount, getPendingCount } from '../core/offline-queue.js';
import { store, User } from '../shared/state.js';
import { openConfirmModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';

import { showOfflineFailedActionsModal } from './offline-status.js';
import { checkOpeningStatus } from './opening.js';
import { OperatorView } from './router.js';
import { getSelectedOperatorStationId, setSelectedOperatorStation } from './station-context.js';

// ========== TYPE DEFINITIONS ==========

export interface OperatorHandlers {
  onNavigate: (view: OperatorView) => void;
  onOpening: (stationId: string, userId: string) => void;
  onClosure: (stationId: string, userId: string) => void;
  onStationChange?: (stationId: string) => void;
}

interface ExtendedUser extends User {
  assignedStations?: Array<{ id: string | number; name?: string }>;
}

let activeShiftsChannel: ReturnType<typeof supabase.channel> | null = null;
let activeSubscribedStationId: string | null = null;

export function unsubscribeShiftsRealtime(): void {
  if (activeShiftsChannel) {
    try {
      void supabase.removeChannel(activeShiftsChannel);
    } catch (err) {
      logger.error('operatorLayout', 'Errore rimozione canale realtime shifts:', err);
    }
    activeShiftsChannel = null;
    activeSubscribedStationId = null;
  }
}

export function setupShiftsRealtimeSubscription(
  stationId: string | number,
  userId: string | number,
  handlers: OperatorHandlers
): void {
  const normalizedId = String(stationId).trim();
  if (activeSubscribedStationId === normalizedId && activeShiftsChannel) {
    return;
  }

  unsubscribeShiftsRealtime();

  activeSubscribedStationId = normalizedId;
  try {
    activeShiftsChannel = supabase
      .channel(`shifts_realtime_${normalizedId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: `station_id=eq.${normalizedId}`
        },
        () => {
          void updateTurnoButton(normalizedId, userId, handlers);
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || err) {
          logger.error('operatorLayout', 'Realtime shifts subscription error:', err || status);
        }
      });
  } catch (err) {
    logger.error('operatorLayout', 'Errore configurazione realtime shifts:', err);
  }
}

// ========== FUNCTIONS ==========

/**
 * Render the operator shell layout
 */
export async function renderOperatorShell(
  container: HTMLElement,
  handlers: OperatorHandlers
): Promise<void> {
  const user = store.getUser() as ExtendedUser | null;
  const stationId = getSelectedOperatorStationId(user);

  if (!document.getElementById('operator-custom-styles')) {
    injectStyles();
  }

  setSafeHTML(
    container,
    `
        <div class="operator-container">
            <header class="operator-header">
                <div class="header-left">
                    <img src="/assets/images/logo-svg.svg" alt="Neofuel" style="height: 40px; vertical-align: middle;">
                    <span class="station-badge" id="station-badge">Caricamento...</span>
                    <span class="station-selector-slot" id="operator-station-selector-slot"></span>
                </div>
                <div class="header-right">
                    <span id="sync-indicator" class="sync-badge" title="Operazioni in attesa di sincronizzazione">
                        <i class="fas fa-sync-alt"></i> <span id="sync-count">0</span>
                    </span>
                    <button id="op-logout-btn" class="icon-btn" aria-label="Esci" title="Esci"><i class="fas fa-sign-out-alt"></i></button>
                    <button id="op-offline-btn" class="icon-btn sync-badge" aria-label="Azioni offline" title="Azioni offline">
                        <i class="fas fa-save"></i> <span id="sync-count">0</span>
                    </button>
                </div>
            </header>
            
            <div class="operator-menu" data-testid="operator-menu">
                <button class="op-menu-item primary" id="btn-turno" data-testid="btn-turno">
                    <i class="fas fa-door-closed" id="turno-icon"></i>
                    <span id="turno-text">Chiusura</span>
                    <span class="status-badge" id="opening-status"></span>
                </button>

                <button class="op-menu-item" id="btn-resoconto" data-testid="btn-resoconto">
                    <i class="fas fa-clipboard-list"></i>
                    <span>Resoconto turno</span>
                </button>

                <div class="op-menu-accordion" data-testid="menu-accordion-movements">
                    <button class="op-menu-item accordion-trigger" id="btn-movimenti" data-testid="btn-movimenti" aria-expanded="false" aria-controls="movimenti-content">
                        <i class="fas fa-exchange-alt"></i>
                        <span>Movimenti</span>
                        <i class="fas fa-chevron-down accordion-icon"></i>
                    </button>
                    <div class="accordion-content" id="movimenti-content" hidden aria-hidden="true">
                        <button class="op-submenu-item" id="btn-crediti" data-testid="btn-crediti">
                            <i class="fas fa-credit-card"></i>
                            <span>Crediti</span>
                        </button>
                        <button class="op-submenu-item" id="btn-voucher" data-testid="btn-voucher">
                            <i class="fas fa-ticket-alt"></i>
                            <span>Voucher</span>
                        </button>
                        <button class="op-submenu-item" id="btn-uscite" data-testid="btn-uscite">
                            <i class="fas fa-hand-holding-usd"></i>
                            <span>Uscite</span>
                        </button>
                        <button class="op-submenu-item" id="btn-incassi" data-testid="btn-incassi">
                            <i class="fas fa-cash-register"></i>
                            <span>Incassi</span>
                        </button>
                        <button class="op-submenu-item" id="btn-refund" data-testid="btn-refund">
                            <i class="fas fa-undo"></i>
                            <span>Rimborso clienti</span>
                        </button>
                    </div>
                </div>

                <button class="op-menu-item" id="btn-fatture" data-testid="btn-fatture">
                    <i class="fas fa-file-invoice"></i>
                    <span>Fatture</span>
                </button>

                <button class="op-menu-item" id="btn-prezzi" data-testid="btn-prezzi">
                    <i class="fas fa-tags"></i>
                    <span>Prezzi</span>
                </button>
            </div>
            
            <div id="operator-content" class="operator-content">
                <div class="welcome-message">
                    <p>Seleziona un'attività dal menu in alto.</p>
                </div>
            </div>
        </div>
    `
  );

  // #248: qui serve l'id numerico DB (user_id), non l'UUID auth: i handler
  // del turno delegano al router che lo propaga ai flussi shift/crediti.
  const userId = user?.user_id;

  renderStationSelector(user, stationId, userId ? String(userId) : null, handlers);

  if (stationId && userId) {
    updateStationBadge(stationId);
    updateTurnoButton(stationId, String(userId), handlers);
    setupShiftsRealtimeSubscription(stationId, String(userId), handlers);
  }

  attachEventListeners(handlers);
  updateSyncBadge();

  document.addEventListener('sync-status-changed', updateSyncBadge);
}

function renderStationSelector(
  user: ExtendedUser | null,
  stationId: string | null,
  userId: string | null,
  handlers: OperatorHandlers
): void {
  const assignedStations = user?.assignedStations ?? [];
  if (assignedStations.length <= 1 || !stationId || !userId) {
    return;
  }

  const slot = document.getElementById('operator-station-selector-slot');
  if (!slot) {
    return;
  }

  const label = document.createElement('label');
  label.className = 'operator-station-selector-label';
  label.htmlFor = 'operator-station-select';
  label.textContent = 'Stazione';

  const select = document.createElement('select');
  select.id = 'operator-station-select';
  select.className = 'operator-station-select';
  select.setAttribute('aria-label', 'Seleziona stazione operatore');

  assignedStations.forEach(station => {
    const option = document.createElement('option');
    option.value = String(station.id);
    option.textContent = station.name || `Stazione ${station.id}`;
    option.selected = option.value === stationId;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    const selectedStationId = setSelectedOperatorStation(select.value);
    if (!selectedStationId) {
      return;
    }

    updateStationBadge(selectedStationId);
    updateTurnoButton(selectedStationId, userId, handlers);
    setupShiftsRealtimeSubscription(selectedStationId, userId, handlers);
    handlers.onStationChange?.(selectedStationId);
  });

  slot.append(label, select);
}

/**
 * Update the station badge with the real name
 */
async function updateStationBadge(stationId: string | number): Promise<void> {
  try {
    const name = await getStationName(stationId);
    const badge = document.getElementById('station-badge');
    if (badge) {
      badge.textContent = name;
    }
  } catch (err) {
    logger.error('operatorLayout', 'Error updating station badge:', err);
  }
}

/**
 * Update the dynamic "Turno" button state
 */
export async function updateTurnoButton(
  stationId: string | number,
  userId: string | number,
  handlers: OperatorHandlers
): Promise<void> {
  const btnTurno = document.getElementById('btn-turno');
  const badge = document.getElementById('opening-status');

  if (!btnTurno) {
    logger.error('operatorLayout', 'Btn Turno not found');
    return;
  }

  const opening = await checkOpeningStatus(stationId);

  const turnoIcon = btnTurno.querySelector('#turno-icon') as HTMLElement | null;
  const turnoText = btnTurno.querySelector('#turno-text') as HTMLElement | null;

  // Debug badge
  if (!badge) {
    logger.error('operatorLayout', 'Badge opening-status NOT FOUND in DOM.');
  }

  if (turnoIcon) {
    turnoIcon.className = 'fas fa-door-closed';
  }
  if (turnoText) {
    turnoText.textContent = 'Chiusura';
  }

  // Always invoke onClosure; startClosureWizard determines opening vs closure flow
  btnTurno.onclick = () => handlers.onClosure(String(stationId), String(userId));

  if (badge) {
    if (opening) {
      const hasPartial =
        opening.closing_data !== null &&
        typeof opening.closing_data === 'object' &&
        'closure_stage' in opening.closing_data &&
        (opening.closing_data as Record<string, unknown>).closure_stage === 'partial';
      const text = hasPartial ? 'Parziale' : 'Aperto';
      badge.textContent = text;
      badge.className = `status-badge ${hasPartial ? 'status-partial' : 'status-open'}`;
      badge.title = `Aperto da ${opening.users?.full_name || 'Operatore'} il ${new Date(opening.opened_at).toLocaleString('it-IT')}`;
    } else {
      badge.textContent = 'Chiuso';
      badge.className = 'status-badge status-closed';
      badge.title = 'Nessuna apertura attiva';
    }
    badge.style.display = 'inline-block';
  }
}

/**
 * Update the sync indicator badge
 */
async function updateSyncBadge(): Promise<void> {
  try {
    const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);
    const count = pending + failed;
    const badge = document.getElementById('sync-indicator');
    const offlineBtn = document.getElementById('op-offline-btn');
    const countSpans = document.querySelectorAll('#sync-count');
    countSpans.forEach(span => {
      span.textContent = count.toString();
    });
    badge?.classList.toggle('active', count > 0);
    offlineBtn?.classList.toggle('has-failed', failed > 0);
    offlineBtn?.classList.toggle('active', count > 0);
  } catch (err) {
    logger.warn('operatorLayout', 'Sync indicator failed:', err);
  }
}

/**
 * Attach global event listeners
 */
function attachEventListeners(handlers: OperatorHandlers): void {
  const logoutBtn = document.getElementById('op-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const confirmed = await openConfirmModal('Vuoi uscire dal portale operatore?');
      if (confirmed) {
        await clearSession();
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = window.location.pathname;
      }
    });
  }

  const offlineBtn = document.getElementById('op-offline-btn');
  if (offlineBtn) {
    offlineBtn.addEventListener('click', () => {
      void showOfflineFailedActionsModal();
    });
  }

  const btnMovimenti = document.getElementById('btn-movimenti');
  const movimentiContent = document.getElementById('movimenti-content');
  if (btnMovimenti && movimentiContent) {
    btnMovimenti.addEventListener('click', () => {
      const isOpen = movimentiContent.classList.contains('open');
      const nextOpen = !isOpen;
      movimentiContent.classList.toggle('open', nextOpen);
      movimentiContent.hidden = !nextOpen;
      movimentiContent.setAttribute('aria-hidden', String(!nextOpen));
      btnMovimenti.setAttribute('aria-expanded', String(nextOpen));
      const icon = btnMovimenti.querySelector('.accordion-icon') as HTMLElement | null;
      if (icon) {
        icon.style.transform = nextOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  const menuMap: Record<string, OperatorView> = {
    'btn-resoconto': 'resoconto',
    'btn-crediti': 'crediti',
    'btn-voucher': 'voucher',
    'btn-uscite': 'uscite',
    'btn-incassi': 'incassi',
    'btn-refund': 'rimborso',
    'btn-fatture': 'fatture',
    'btn-prezzi': 'prezzi'
  };

  Object.entries(menuMap).forEach(([id, view]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => handlers.onNavigate(view));
    }
  });
}

/**
 * Inject local styles
 */
function injectStyles(): void {
  const style = document.createElement('style');
  style.id = 'operator-custom-styles';
  setSafeHTML(
    style,
    `
      .result-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer;
      }
      .result-item:hover { background: var(--bg-body); }
      .customer-header {
        background: rgba(59, 130, 246, 0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px;
        border-left: 4px solid var(--info-color);
      }
      .balance-display { font-size: 1.2em; color: var(--info-color); margin-top: 5px; }
      .action-tabs { display: flex; gap: 10px; margin-bottom: 20px; }
      .tab-btn {
        flex: 1; padding: 10px; border: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 6px; cursor: pointer;
      }
      .tab-btn.active { background: var(--info-color); color: var(--text-light); border-color: var(--info-color); }
      .voucher-amount { font-size: 2em; font-weight: bold; color: var(--success-color); margin: 10px 0; }
      .sync-badge {
        background: var(--warning-color); color: var(--text-light); font-size: 0.75em; padding: 2px 6px;
        border-radius: 10px; margin-left: 5px; display: none;
      }
      .sync-badge.active { display: inline-block; animation: pulse 2s infinite; }
      .sync-badge.has-failed { background: var(--danger-color); }
      #op-offline-btn { display: none; }
      #op-offline-btn.active { display: inline-block; }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `
  );
  document.head.appendChild(style);
}
