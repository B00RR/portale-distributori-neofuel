// ==========================================
// UI HELPERS
// ==========================================
import { escapeHtml } from "../utils/utils.js";

// Helper: Inizializza elementi admin content (pattern ripetuto)
export function initAdminContent() {
    return {
        content: document.getElementById('admin-content'),
        actions: document.getElementById('content-actions')
    };
}

// Helper: Mostra messaggio di caricamento (Logo Animato)
export function showLoadingMessage(content, message = '') {
    if (content) {
        content.innerHTML = `
            <div class="loader-container">
                <img src="assets/images/logo svg.svg" alt="Loading..." class="loader-logo">
            </div>
        `;
    }
}

// Helper: Overlay Full Screen Loader (es. per Login)
export function showFullScreenLoader(message = '') {
    let loader = document.getElementById('full-screen-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'full-screen-loader';
        loader.className = 'loader-overlay-full';
        document.body.appendChild(loader);
    }
    loader.innerHTML = `
        <img src="assets/images/logo svg.svg" alt="Loading..." class="loader-logo">
    `;
    loader.style.display = 'flex';
}

export function hideFullScreenLoader() {
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

// Helper: Mostra messaggio di errore (pattern ripetuto)
export function showErrorMessage(content, error, defaultMessage = 'Errore di caricamento') {
    if (content) {
        const errorMsg = error?.message || error || defaultMessage;
        content.innerHTML = `<span style="color:red">${escapeHtml(errorMsg)}</span>`;
    }
    console.error(defaultMessage, error);
}

// ---- Modal riutilizzabile ----
export function openModal(title = "") {
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

        // Chiudi cliccando fuori
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Chiudi col tasto X
        const closeBtn = modal.querySelector('#modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
    }

    const titleEl = modal.querySelector('#modal-title');
    if (titleEl) titleEl.textContent = title;

    const bodyEl = modal.querySelector('#modal-body');
    if (bodyEl) bodyEl.innerHTML = ''; // Pulisci contenuto precedente

    modal.style.display = 'flex';
}

export function closeModal() {
    const modal = document.getElementById('app-modal');
    if (modal) {
        modal.style.display = 'none';
        const bodyEl = modal.querySelector('#modal-body');
        if (bodyEl) bodyEl.innerHTML = ''; // Pulisci per evitare ID duplicati o listener pendenti
    }
}

// Messaggio informativo (solo Ok)
export function showInfoModal(message, title = 'Informazione') {
    openModal(title);
    const target = document.getElementById('modal-body');
    target.innerHTML = `
    <p style="margin-bottom:16px;">${escapeHtml(message)}</p>
    <div style="text-align:right;">
      <button id="info-modal-ok" class="menu-button">Ok</button>
    </div>
  `;

    const okBtn = document.getElementById('info-modal-ok');
    if (okBtn) {
        okBtn.addEventListener('click', () => closeModal(), { once: true });
    }
}

export function openConfirmModal(message) {
    return new Promise((resolve) => {
        openModal('Conferma');
        const target = document.getElementById('modal-body');
        target.innerHTML = `
            <p>${escapeHtml(message)}</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button id="confirm-cancel" class="menu-button btn-danger">Annulla</button>
                <button id="confirm-ok" class="menu-button btn-success">Conferma</button>
            </div>
        `;

        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        const handleOk = () => {
            closeModal();
            resolve(true);
        };

        const handleCancel = () => {
            closeModal();
            resolve(false);
        };

        okBtn.addEventListener('click', handleOk, { once: true });
        cancelBtn.addEventListener('click', handleCancel, { once: true });
    });
}

/**
 * Mostra un modal di input (sostituto premium di prompt())
 * @param {string} message Messaggio da mostrare
 * @param {string} defaultValue Valore predefinito
 * @param {string} title Titolo del modal
 * @returns {Promise<string|null>} Il valore inserito o null se annullato
 */
export function showPromptModal(message, defaultValue = '', title = 'Input Richiesto') {
    return new Promise((resolve) => {
        openModal(title);
        const target = document.getElementById('modal-body');
        target.innerHTML = `
            <p style="margin-bottom: 15px;">${escapeHtml(message)}</p>
            <div class="form-group">
                <input type="text" id="prompt-input" class="form-control" value="${escapeHtml(defaultValue)}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button id="prompt-cancel" class="menu-button">Annulla</button>
                <button id="prompt-ok" class="menu-button primary">Ok</button>
            </div>
        `;

        const input = document.getElementById('prompt-input');
        const okBtn = document.getElementById('prompt-ok');
        const cancelBtn = document.getElementById('prompt-cancel');

        // Focus automatico sull'input
        setTimeout(() => input?.focus(), 100);

        const handleOk = () => {
            const val = input.value;
            closeModal();
            resolve(val);
        };

        const handleCancel = () => {
            closeModal();
            resolve(null);
        };

        okBtn.addEventListener('click', handleOk, { once: true });
        cancelBtn.addEventListener('click', handleCancel, { once: true });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleOk();
            if (e.key === 'Escape') handleCancel();
        });
    });
}

export function setButtonLoading(btn, isLoading, loadingText = 'Attendi...') {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}
