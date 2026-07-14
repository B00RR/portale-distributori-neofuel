import { logger } from '../core/logger.js';
import { store } from '../shared/state.js';
import { setSafeHTML } from '../utils/sanitizer.js';
/**
 * UI Helpers Module
 * Provides reusable UI functions: loaders, modals, confirmations, prompts
 */

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
  if (!content) {
    return;
  }
  content.replaceChildren();
  const container = document.createElement('div');
  container.className = 'loader-container';

  const img = document.createElement('img');
  img.src = '/assets/images/logo-svg.svg';
  img.alt = 'Loading...';
  img.className = 'loader-logo';

  container.appendChild(img);
  content.appendChild(container);
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
  loader.replaceChildren();

  const img = document.createElement('img');
  img.src = '/assets/images/logo-svg.svg';
  img.alt = 'Loading...';
  img.className = 'loader-logo';

  loader.appendChild(img);
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
    const errorMsg =
      errorObj?.message || (typeof error === 'string' ? error : null) || defaultMessage;

    const span = document.createElement('span');
    span.className = 'text-danger';
    // Assertive live region so screen readers announce load errors.
    span.setAttribute('role', 'alert');
    span.setAttribute('aria-live', 'assertive');
    span.textContent = errorMsg;

    content.replaceChildren();
    content.appendChild(span);
  }
  logger.error('showErrorMessage', error);
}

// ========== MODAL FUNCTIONS ==========

// Element focused before the modal opened; focus is restored to it on close.
let lastFocusedBeforeModal: HTMLElement | null = null;

const MODAL_FOCUSABLES = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const MODAL_CLOSE_EVENT = 'app-modal-close';

function createModalSettler<T>(
  modal: HTMLElement,
  resolve: (value: T) => void,
  cancelledValue: T
): (value: T) => void {
  let settled = false;

  const handleDismiss = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    modal.removeEventListener(MODAL_CLOSE_EVENT, handleDismiss);
    resolve(cancelledValue);
  };

  modal.addEventListener(MODAL_CLOSE_EVENT, handleDismiss);

  return (value: T): void => {
    if (settled) {
      return;
    }
    settled = true;
    modal.removeEventListener(MODAL_CLOSE_EVENT, handleDismiss);
    closeModal();
    resolve(value);
  };
}

/**
 * Open reusable modal
 */
export function openModal(title: string = ''): void {
  let modal = document.getElementById('app-modal');
  const isReplacingOpenModal = modal?.style.display === 'flex';
  if (modal && isReplacingOpenModal) {
    modal.dispatchEvent(new Event(MODAL_CLOSE_EVENT));
  }
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title');
    modal.setAttribute('tabindex', '-1');
    // Static internal markup — no user input
    setSafeHTML(
      modal,
      `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modal-title"></h3>
                    <button id="modal-close-btn" aria-label="Chiudi" title="Chiudi">&times;</button>
                </div>
                <div id="modal-body" class="modal-body"></div>
            </div>
        `
    );
    document.body.appendChild(modal);

    // Close when clicking outside
    modal.addEventListener('click', (e: Event) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Close with X button
    const closeBtn = modal.querySelector('#modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // Escape closes the dialog; Tab is trapped within it.
    const modalEl = modal;
    modalEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key !== 'Tab') {
        return;
      }
      const focusables = Array.from(modalEl.querySelectorAll<HTMLElement>(MODAL_FOCUSABLES)).filter(
        el => !el.hasAttribute('disabled')
      );
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  const titleEl = modal.querySelector('#modal-title');
  if (titleEl) {
    titleEl.textContent = title;
  }

  const bodyEl = modal.querySelector('#modal-body');
  if (bodyEl) {
    bodyEl.replaceChildren();
  } // Clear previous content

  if (!isReplacingOpenModal) {
    lastFocusedBeforeModal = document.activeElement as HTMLElement | null;
  }
  store.setBusy(true);
  modal.style.display = 'flex';
  const firstFocusable = modal.querySelector<HTMLElement>(MODAL_FOCUSABLES);
  (firstFocusable ?? modal).focus();
}

/**
 * Close modal
 */
export function closeModal(): void {
  const modal = document.getElementById('app-modal');
  if (modal) {
    modal.dispatchEvent(new Event(MODAL_CLOSE_EVENT));
    store.setBusy(false);
    modal.style.display = 'none';
    const bodyEl = modal.querySelector('#modal-body');
    if (bodyEl) {
      bodyEl.replaceChildren();
    } // Clean to avoid duplicate IDs or pending listeners
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }
}

/**
 * Show info modal (only Ok button)
 */
export function showInfoModal(message: string, title: string = 'Informazione'): void {
  openModal(title);
  const target = document.getElementById('modal-body');
  if (!target) {
    return;
  }

  target.replaceChildren();

  const p = document.createElement('p');
  p.className = 'mb-3';
  p.textContent = message;
  target.appendChild(p);

  const actions = document.createElement('div');
  actions.className = 'text-right';

  const okBtn = document.createElement('button');
  okBtn.id = 'info-modal-ok';
  okBtn.className = 'menu-button primary';
  okBtn.textContent = 'Ok';
  actions.appendChild(okBtn);
  target.appendChild(actions);

  okBtn.addEventListener('click', () => closeModal(), { once: true });
}

/**
 * Show confirmation modal (Ok/Cancel)
 * @returns Promise that resolves to true if confirmed, false if cancelled
 */
export function openConfirmModal(message: string): Promise<boolean> {
  return new Promise(resolve => {
    openModal('Conferma');
    const target = document.getElementById('modal-body');
    const modal = document.getElementById('app-modal');
    if (!target || !modal) {
      resolve(false);
      return;
    }

    target.replaceChildren();

    const p = document.createElement('p');
    p.textContent = message;
    target.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'd-flex justify-end gap-2 mt-4';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'confirm-cancel';
    cancelBtn.className = 'menu-button btn-danger';
    cancelBtn.textContent = 'Annulla';
    actions.appendChild(cancelBtn);

    const okBtn = document.createElement('button');
    okBtn.id = 'confirm-ok';
    okBtn.className = 'menu-button btn-success';
    okBtn.textContent = 'Conferma';
    actions.appendChild(okBtn);

    target.appendChild(actions);

    const settle = createModalSettler<boolean>(modal, resolve, false);
    const handleOk = (): void => settle(true);
    const handleCancel = (): void => settle(false);

    okBtn.addEventListener('click', handleOk, { once: true });
    cancelBtn.addEventListener('click', handleCancel, { once: true });
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
  return new Promise(resolve => {
    openModal(title);
    const target = document.getElementById('modal-body');
    const modal = document.getElementById('app-modal');
    if (!target || !modal) {
      resolve(null);
      return;
    }

    target.replaceChildren();

    const p = document.createElement('p');
    p.className = 'mb-3';
    p.textContent = message;
    target.appendChild(p);

    const group = document.createElement('div');
    group.className = 'form-group';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'prompt-input';
    input.className = 'form-control w-100 p-2';
    input.value = defaultValue;

    group.appendChild(input);
    target.appendChild(group);

    const actions = document.createElement('div');
    actions.className = 'd-flex justify-end gap-2 mt-4';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'prompt-cancel';
    cancelBtn.className = 'menu-button';
    cancelBtn.textContent = 'Annulla';
    actions.appendChild(cancelBtn);

    const okBtn = document.createElement('button');
    okBtn.id = 'prompt-ok';
    okBtn.className = 'menu-button primary';
    okBtn.textContent = 'Ok';
    actions.appendChild(okBtn);

    target.appendChild(actions);

    // Auto-focus on input
    setTimeout(() => input.focus(), 100);

    const settle = createModalSettler<string | null>(modal, resolve, null);
    const handleOk = (): void => settle(input.value || '');
    const handleCancel = (): void => settle(null);

    okBtn.addEventListener('click', handleOk, { once: true });
    cancelBtn.addEventListener('click', handleCancel, { once: true });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleOk();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    });
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
  if (!btn) {
    return;
  }

  if (isLoading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.replaceChildren();

    const icon = document.createElement('i');
    icon.className = 'fas fa-spinner fa-spin';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' ' + loadingText));
  } else {
    const original = btn.dataset.originalText;
    if (original) {
      setSafeHTML(btn, original);
    }
    btn.disabled = false;
  }
}
