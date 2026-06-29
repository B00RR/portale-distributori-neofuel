/**
 * Toast Notifications System
 * Modern non-blocking notifications replacing alert()
 */

import { logger } from '../core/logger.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  text: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

export class Toast {
  /**
   * Show a toast notification
   * @param message - The message to display
   * @param type - Type of toast: 'success', 'error', 'warning', 'info'
   * @param duration - Duration in ms (default: 3000)
   * @param options - Additional options (e.g. action button)
   */
  static show(
    message: string,
    type: ToastType = 'info',
    duration: number = 3000,
    options: ToastOptions = {}
  ): void {
    // Create container if not exists
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      // Polite live region so screen readers announce toast text changes.
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    // Errors/warnings interrupt; success/info announce politely via the container.
    if (type === 'error' || type === 'warning') {
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';

    const icon = document.createElement('i');
    icon.className = `fas fa-${this._getIcon(type)}`;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;

    row.appendChild(icon);
    row.appendChild(messageSpan);
    toast.appendChild(row);

    if (options.action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action-btn';
      btn.style.marginLeft = '15px';
      btn.style.padding = '4px 10px';
      btn.style.background = 'rgba(255,255,255,0.2)';
      btn.style.border = '1px solid rgba(255,255,255,0.4)';
      btn.style.color = 'white';
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = '600';
      btn.textContent = options.action.text;

      btn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        logger.debug('Toast', '[Toast] Action button clicked');
        options.action?.onClick();
      });

      toast.appendChild(btn);
    }

    // Add to container
    container.appendChild(toast);

    // Trigger reflow for animation
    void toast.offsetWidth;

    // Show with animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after duration (if > 0)
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast, container as HTMLElement);
      }, duration);
    }
  }

  static dismiss(toast: HTMLElement, container: HTMLElement): void {
    if (!toast.classList.contains('show')) {
      return;
    }

    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      // Remove container if empty
      if (container.children.length === 0 && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 300);
  }

  /**
   * Get FontAwesome icon for type
   */
  private static _getIcon(type: ToastType): string {
    const icons = new Map<ToastType, string>([
      ['success', 'check-circle'],
      ['error', 'exclamation-circle'],
      ['warning', 'exclamation-triangle'],
      ['info', 'info-circle']
    ]);
    return icons.get(type) || 'info-circle';
  }
}

// Export also as default for compatibility
export default Toast;
