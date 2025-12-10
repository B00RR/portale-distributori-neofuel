// ==========================================
// UI HELPERS
// ==========================================
import { escapeHtml } from "./utils.js";

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
                <img src="logo svg.svg" alt="Loading..." class="loader-logo">
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
        <img src="logo svg.svg" alt="Loading..." class="loader-logo">
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

    // Usa una funzione nominata per poter rimuovere il listener se necessario,
    // ma qui usiamo { once: true } che è più pulito
    const okBtn = document.getElementById('info-modal-ok');
    if (okBtn) {
        okBtn.addEventListener('click', () => closeModal(), { once: true });
    }
}

// Conferma riutilizzabile: ritorna Promise<boolean>
export function openConfirmModal(message, confirmText = 'Conferma', cancelText = 'Annulla') {
    return new Promise((resolve) => {
        openModal('Conferma');
        const target = document.getElementById('modal-body');
        target.innerHTML = `
      <p style="margin-bottom:16px;">${escapeHtml(message)}</p>
      <div style="text-align:right; display:flex; justify-content:flex-end; gap:8px;">
        <button id="confirm-modal-cancel" class="menu-button secondary">${escapeHtml(cancelText)}</button>
        <button id="confirm-modal-ok" class="menu-button danger">${escapeHtml(confirmText)}</button>
      </div>
    `;

        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const okBtn = document.getElementById('confirm-modal-ok');

        const cleanup = (value) => {
            closeModal();
            resolve(value);
        };

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => cleanup(false), { once: true });
        }

        if (okBtn) {
            okBtn.addEventListener('click', () => cleanup(true), { once: true });
        }
    });
}
