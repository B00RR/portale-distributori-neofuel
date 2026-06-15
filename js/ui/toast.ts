/**
 * Toast Notifications System
 * Modern non-blocking notifications replacing alert()
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { escapeHtml } from '../utils/utils.js';

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
      document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon based on type
    const icon = this._getIcon(type);

    let contentHtml = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${icon}"></i>
                <span class="toast-message">${escapeHtml(message)}</span>
            </div>
        `;

    if (options.action) {
      contentHtml += `
            <button class="toast-action-btn" style="margin-left: 15px; padding: 4px 10px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white; border-radius: 4px; cursor: pointer; font-weight: 600;">
                ${escapeHtml(options.action.text)}
            </button>
            `;
    }

    toast.innerHTML = contentHtml;

    // Bind custom action
    if (options.action && options.action.onClick) {
      const btn = toast.querySelector('.toast-action-btn');
      if (btn) {
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          console.log('[Toast] Action button clicked');
          if (options.action) {options.action.onClick();}
        });
      }
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
    if (!toast.classList.contains('show')) { return; }

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
    const icons: Record<ToastType, string> = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };
    return icons[type] || 'info-circle';
  }
}

// Export also as default for compatibility
export default Toast;
