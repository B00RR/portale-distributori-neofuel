/**
 * Toast Notifications System
 * 
 * Sistema moderno di notifiche non bloccanti per sostituire alert()
 * Supporta 4 tipi: success, error, warning, info
 */

export class Toast {
    /**
     * Mostra una notifica toast
     * @param {string} message - Il messaggio da mostrare
     * @param {string} type - Tipo di toast: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Durata in millisecondi (default: 3000)
     */
    static show(message, type = 'info', duration = 3000) {
        // Crea container se non esiste
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        // Crea elemento toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icona basata sul tipo
        const icon = this._getIcon(type);

        toast.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <span class="toast-message">${this._escapeHtml(message)}</span>
    `;

        // Aggiungi al container
        container.appendChild(toast);

        // Trigger reflow per animazione
        void toast.offsetWidth;

        // Mostra con animazione
        setTimeout(() => toast.classList.add('show'), 10);

        // Rimuovi dopo durata specificata
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                // Rimuovi container se vuoto
                if (container.children.length === 0 && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 300); // Tempo animazione fade-out
        }, duration);
    }

    /**
     * Ottiene l'icona FontAwesome appropriata per il tipo
     * @private
     */
    static _getIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Escape HTML per prevenire XSS
     * @private
     */
    static _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export anche come default per compatibilità
export default Toast;
