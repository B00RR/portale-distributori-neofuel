// ==========================================
// TOAST NOTIFICATIONS SYSTEM
// ==========================================
// Elegant non-blocking notifications to replace alert()

export class Toast {
    static #container = null;
    static #queue = [];
    static #maxVisible = 3;

    /**
     * Initialize the toast container
     */
    static init() {
        if (this.#container) return;

        this.#container = document.createElement('div');
        this.#container.className = 'toast-container';
        document.body.appendChild(this.#container);
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {'success'|'error'|'warning'|'info'} type - Toast type
     * @param {number} duration - Duration in ms (0 = persistent)
     */
    static show(message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <i class="fas fa-${this.#getIcon(type)} toast-icon"></i>
      <span class="toast-message">${this.#escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Chiudi">
        <i class="fas fa-times"></i>
      </button>
    `;

        // Close button handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.#dismiss(toast);
        });

        // Add to container
        this.#container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => this.#dismiss(toast), duration);
        }

        return toast;
    }

    /**
     * Show success toast
     */
    static success(message, duration = 3000) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast
     */
    static error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast
     */
    static warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast
     */
    static info(message, duration = 3000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Dismiss a toast
     */
    static #dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    /**
     * Clear all toasts
     */
    static clearAll() {
        if (!this.#container) return;

        const toasts = this.#container.querySelectorAll('.toast');
        toasts.forEach(toast => this.#dismiss(toast));
    }

    /**
     * Get icon for toast type
     */
    static #getIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Escape HTML to prevent XSS
     */
    static #escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Toast.init());
} else {
    Toast.init();
}

// Export for global access (optional)
window.Toast = Toast;
