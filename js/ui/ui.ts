/**
 * UI Helpers Module
 * Provides reusable UI functions: loaders, modals, confirmations, prompts
 */

import { escapeHtml } from '../utils/utils.js';

// ========== TYPE DEFINITIONS ==========

export interface AdminContentElements {
    content: HTMLElement | null;
    actions: HTMLElement | null;
}

// ========== INITIALIZATION HELPERS ==========

/**
 * Initialize admin content elements (repeated pattern)
 */
export function initAdminContent(): AdminContentElements {
  return {
    content: document.getElementById('admin-content'),
    actions: document.getElementById('content-actions')
  };
}

// ========== LOADING INDICATORS ==========

/**
 * Show loading message (Animated Logo)
 */
export function showLoadingMessage(content: HTMLElement | null): void {
  if (content) {
    content.innerHTML = `
            <div class="loader-container">
                <img src="/assets/images/logo-svg.svg" alt="Loading..." class="loader-logo">
            </div>
        `;
  }
}

/**
 * Show full screen loader overlay (e.g., for Login)
 */
export function showFullScreenLoader(): void {
  let loader = document.getElementById('full-screen-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'full-screen-loader';
    loader.className = 'loader-overlay-full';
    document.body.appendChild(loader);
  }
  loader.innerHTML = `
        <img src="/assets/images/logo-svg.svg" alt="Loading..." class="loader-logo">
    `;
  loader.style.display = 'flex';
}

/**
 * Hide full screen loader with fade out effect
 */
export function hideFullScreenLoader(): void {
  const loader = document.getElementById('full-screen-loader');
  if (loader) {
    // Fade out effect
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      loader.style.display = 'none';
      loader.style.opacity = '1';
    }, 300);
  }
}

/**
 * Show error message (repeated pattern)
 */
export function showErrorMessage(
  content: HTMLElement | null,
  error: unknown,
  defaultMessage: string = 'Errore di caricamento'
): void {
  if (content) {
    const errorObj = error as { message?: string };
    const errorMsg = errorObj?.message || (typeof error === 'string' ? error : null) || defaultMessage;
    content.innerHTML = `<span class="text-danger">${escapeHtml(errorMsg)}</span>`;
  }
  console.error(defaultMessage, error);
}

// ========== MODAL FUNCTIONS ==========

/**
 * Open reusable modal
 */
export function openModal(title: string = ''): void {
  let modal = document.getElementById('app-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modal-title"></h3>
                    <button id="modal-close-btn">&times;</button>
                </div>
                <div id="modal-body" class="modal-body"></div>
            </div>
        `;
    document.body.appendChild(modal);

    // Close when clicking outside
    modal.addEventListener('click', (e: Event) => {
      if (e.target === modal) {closeModal();}
    });

    // Close with X button
    const closeBtn = modal.querySelector('#modal-close-btn');
    if (closeBtn) {closeBtn.addEventListener('click', closeModal);}
  }

  const titleEl = modal.querySelector('#modal-title');
  if (titleEl) {titleEl.textContent = title;}

  const bodyEl = modal.querySelector('#modal-body');
  if (bodyEl) {bodyEl.innerHTML = '';} // Clear previous content

  modal.style.display = 'flex';
}

/**
 * Close modal
 */
export function closeModal(): void {
  const modal = document.getElementById('app-modal');
  if (modal) {
    modal.style.display = 'none';
    const bodyEl = modal.querySelector('#modal-body');
    if (bodyEl) {bodyEl.innerHTML = '';} // Clean to avoid duplicate IDs or pending listeners
  }
}

/**
 * Show info modal (only Ok button)
 */
export function showInfoModal(message: string, title: string = 'Informazione'): void {
  openModal(title);
  const target = document.getElementById('modal-body');
  if (!target) {return;}

  target.innerHTML = `
        <p class="mb-3">${escapeHtml(message)}</p>
        <div class="text-right">
            <button id="info-modal-ok" class="menu-button primary">Ok</button>
        </div>
    `;

  const okBtn = document.getElementById('info-modal-ok');
  if (okBtn) {
    okBtn.addEventListener('click', () => closeModal(), { once: true });
  }
}

/**
 * Show confirmation modal (Ok/Cancel)
 * @returns Promise that resolves to true if confirmed, false if cancelled
 */
export function openConfirmModal(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    openModal('Conferma');
    const target = document.getElementById('modal-body');
    if (!target) {
      resolve(false);
      return;
    }

    target.innerHTML = `
            <p>${escapeHtml(message)}</p>
            <div class="d-flex justify-end gap-2 mt-4">
                <button id="confirm-cancel" class="menu-button btn-danger">Annulla</button>
                <button id="confirm-ok" class="menu-button btn-success">Conferma</button>
            </div>
        `;

    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    const handleOk = (): void => {
      closeModal();
      resolve(true);
    };

    const handleCancel = (): void => {
      closeModal();
      resolve(false);
    };

    if (okBtn) {okBtn.addEventListener('click', handleOk, { once: true });}
    if (cancelBtn) {cancelBtn.addEventListener('click', handleCancel, { once: true });}
  });
}

/**
 * Show prompt modal (premium replacement for prompt())
 * @param message - Message to display
 * @param defaultValue - Default value
 * @param title - Modal title
 * @returns Promise that resolves to the input value or null if cancelled
 */
export function showPromptModal(
  message: string,
  defaultValue: string = '',
  title: string = 'Input Richiesto'
): Promise<string | null> {
  return new Promise((resolve) => {
    openModal(title);
    const target = document.getElementById('modal-body');
    if (!target) {
      resolve(null);
      return;
    }

    target.innerHTML = `
            <p class="mb-3">${escapeHtml(message)}</p>
            <div class="form-group">
                <input type="text" id="prompt-input" class="form-control w-100 p-2" value="${escapeHtml(defaultValue)}">
            </div>
            <div class="d-flex justify-end gap-2 mt-4">
                <button id="prompt-cancel" class="menu-button">Annulla</button>
                <button id="prompt-ok" class="menu-button primary">Ok</button>
            </div>
        `;

    const input = document.getElementById('prompt-input') as HTMLInputElement | null;
    const okBtn = document.getElementById('prompt-ok');
    const cancelBtn = document.getElementById('prompt-cancel');

    // Auto-focus on input
    setTimeout(() => input?.focus(), 100);

    const handleOk = (): void => {
      const val = input?.value || '';
      closeModal();
      resolve(val);
    };

    const handleCancel = (): void => {
      closeModal();
      resolve(null);
    };

    if (okBtn) {okBtn.addEventListener('click', handleOk, { once: true });}
    if (cancelBtn) {cancelBtn.addEventListener('click', handleCancel, { once: true });}
    if (input) {
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {handleOk();}
        if (e.key === 'Escape') {handleCancel();}
      });
    }
  });
}

// ========== BUTTON STATE ==========

/**
 * Set button loading state
 */
export function setButtonLoading(
  btn: HTMLButtonElement | null,
  isLoading: boolean,
  loadingText: string = 'Attendi...'
): void {
  if (!btn) {return;}

  if (isLoading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}
