/**
 * Operator Layout Module
 * Handles rendering of operator shell and shared UI components
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStationName } from '../core/api.js';
import { clearSession } from '../core/auth.js';
import { store, User } from '../shared/state.js';
import { openConfirmModal } from '../ui/ui.js';

import { checkOpeningStatus } from './opening.js';
import { OperatorView } from './router.js';

// ========== TYPE DEFINITIONS ==========

export interface OperatorHandlers {
    onNavigate: (view: OperatorView) => void;
    onOpening: (stationId: string, userId: string) => void;
    onClosure: (stationId: string, userId: string) => void;
}

interface ExtendedUser extends User {
    assignedStations?: Array<{ id: string }>;
}

interface OpeningData {
    closing_data?: {
        closure_stage?: string;
    };
    date_time: string;
    users?: {
        full_name?: string;
    };
}

// ========== FUNCTIONS ==========

/**
 * Render the operator shell layout
 */
export async function renderOperatorShell(container: HTMLElement, handlers: OperatorHandlers): Promise<void> {
  const user = store.getUser() as ExtendedUser | null;
  const stationId = user?.station_id || user?.assignedStations?.[0]?.id;

  if (!document.getElementById('operator-custom-styles')) {
    injectStyles();
  }

  container.innerHTML = `
        <div class="operator-container">
            <header class="operator-header">
                <div class="header-left">
                    <img src="/assets/images/logo-svg.svg" alt="Neofuel" style="height: 40px; vertical-align: middle;">
                    <span class="station-badge" id="station-badge">Caricamento...</span>
                </div>
                <div class="header-right">
                    <span id="sync-indicator" class="sync-badge" title="Operazioni in attesa di sincronizzazione">
                        <i class="fas fa-sync-alt"></i> <span id="sync-count">0</span>
                    </span>
                    <button id="op-logout-btn" class="icon-btn" aria-label="Esci" title="Esci"><i class="fas fa-sign-out-alt"></i></button>
                </div>
            </header>
            
            <div class="operator-menu" data-testid="operator-menu">
                <button class="op-menu-item primary" id="btn-turno" data-testid="btn-turno">
                    <i class="fas fa-door-open" id="turno-icon"></i>
                    <span id="turno-text">Apertura</span>
                    <span class="status-badge" id="opening-status"></span>
                </button>

                <div class="op-menu-accordion" data-testid="menu-accordion-movements">
                    <button class="op-menu-item accordion-trigger" id="btn-movimenti" data-testid="btn-movimenti">
                        <i class="fas fa-exchange-alt"></i>
                        <span>Movimenti</span>
                        <i class="fas fa-chevron-down accordion-icon"></i>
                    </button>
                    <div class="accordion-content" id="movimenti-content">
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
    `;

  const userId = user?.id || user?.user_id;

  if (stationId && userId) {
    updateStationBadge(String(stationId));
    updateTurnoButton(String(stationId), String(userId), handlers);
  }

  attachEventListeners(handlers);
  updateSyncBadge();

  document.addEventListener('sync-status-changed', updateSyncBadge);
}

/**
 * Update the station badge with the real name
 */
async function updateStationBadge(stationId: string | number): Promise<void> {
  try {
    const name = await getStationName(stationId);
    const badge = document.getElementById('station-badge');
    if (badge) {badge.textContent = name;}
  } catch (err) {
    console.error('Error updating station badge:', err);
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
    console.error('Btn Turno not found');
    return;
  }

  const opening = await (checkOpeningStatus as any)(stationId) as OpeningData | null;

  const turnoIcon = btnTurno.querySelector('#turno-icon') as HTMLElement | null;
  const turnoText = btnTurno.querySelector('#turno-text') as HTMLElement | null;

  // Debug badge
  if (!badge) {
    console.error('[Layout] Badge opening-status NOT FOUND in DOM.');
  }

  if (opening) {
    if (turnoIcon) {turnoIcon.className = 'fas fa-door-closed';}
    if (turnoText) {turnoText.textContent = 'Chiusura';}

    // Remove old listeners by using onclick property (safest simple way)
    btnTurno.onclick = () => handlers.onClosure(String(stationId), String(userId));

    if (badge) {
      const hasPartial = opening.closing_data?.closure_stage === 'partial';
      const text = hasPartial ? 'Parziale' : 'Aperto';
      badge.textContent = text;
      badge.className = `status-badge ${hasPartial ? 'status-partial' : 'status-open'}`;
      badge.title = `Aperto da ${opening.users?.full_name || 'Operatore'} il ${new Date(opening.date_time).toLocaleString('it-IT')}`;
      // Force visibility
      badge.style.display = 'inline-block';
    }
  } else {
    if (turnoIcon) {turnoIcon.className = 'fas fa-door-open';}
    if (turnoText) {turnoText.textContent = 'Apertura';}

    btnTurno.onclick = () => handlers.onOpening(String(stationId), String(userId));

    if (badge) {
      badge.textContent = 'Chiuso';
      badge.className = 'status-badge status-closed';
      badge.title = 'Nessuna apertura attiva';
      badge.style.display = 'inline-block';
    }
  }
}

/**
 * Update the sync indicator badge
 */
async function updateSyncBadge(): Promise<void> {
  try {
    const { offlineDB } = await import('../core/offline-db.js') as any;
    const count = await offlineDB.getQueueCount();
    const badge = document.getElementById('sync-indicator');
    const countSpan = document.getElementById('sync-count');
    if (badge && countSpan) {
      countSpan.textContent = count.toString();
      badge.classList.toggle('active', count > 0);
    }
  } catch (err) {
    console.warn('Sync indicator failed:', err);
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

  const btnMovimenti = document.getElementById('btn-movimenti');
  const movimentiContent = document.getElementById('movimenti-content');
  if (btnMovimenti && movimentiContent) {
    btnMovimenti.addEventListener('click', () => {
      const isOpen = movimentiContent.classList.contains('open');
      movimentiContent.classList.toggle('open');
      const icon = btnMovimenti.querySelector('.accordion-icon') as HTMLElement | null;
      if (icon) {
        icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  }

  const menuMap: Record<string, OperatorView> = {
    'btn-crediti': 'crediti',
    'btn-voucher': 'voucher',
    'btn-uscite': 'uscite',
    'btn-incassi': 'incassi',
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
  style.innerHTML = `
      .result-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;
      }
      .result-item:hover { background: #f9f9f9; }
      .customer-header {
        background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;
        border-left: 4px solid #0284c7;
      }
      .balance-display { font-size: 1.2em; color: #0284c7; margin-top: 5px; }
      .action-tabs { display: flex; gap: 10px; margin-bottom: 20px; }
      .tab-btn {
        flex: 1; padding: 10px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer;
      }
      .tab-btn.active { background: #0284c7; color: white; border-color: #0284c7; }
      .voucher-amount { font-size: 2em; font-weight: bold; color: #10b981; margin: 10px 0; }
      .sync-badge {
        background: #f59e0b; color: white; font-size: 0.75em; padding: 2px 6px;
        border-radius: 10px; margin-left: 5px; display: none;
      }
      .sync-badge.active { display: inline-block; animation: pulse 2s infinite; }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `;
  document.head.appendChild(style);
}
