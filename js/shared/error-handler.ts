/**
 * Error Handler Module
 * Centralized error handling with Toast notifications and logging
 */

import { logger } from '../core/logger.js';
import { Toast } from '../ui/toast.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml } from '../utils/utils.js';
const isDevelopment = import.meta.env.DEV;

// ========== TYPE DEFINITIONS ==========

export type ErrorCode = 'PGRST116' | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | string;

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface ErrorDetails {
    code?: ErrorCode;
    message?: string;
    originalError?: unknown;
}

// ========== CUSTOM ERROR CLASS ==========

export class AppError extends Error {
  code: ErrorCode;
  originalError?: unknown;

  constructor(message: string, code: ErrorCode = 'APP_ERROR', originalError?: unknown) {
    super(message);
    this.code = code;
    this.originalError = originalError;
    this.name = 'AppError';

    // Maintains proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// ========== ERROR HANDLER FUNCTION ==========

/**
 * Handles errors centrally by showing a Toast and logging to console
 * SECURITY: Uses logger module to prevent sensitive information disclosure
 * @param error - The caught error object
 * @param context - The context where the error occurred (e.g., function name)
 * @param renderTarget - Optional element where to display the error persistently
 */
export function handleError(
  error: unknown,
  context: string = '',
  renderTarget: HTMLElement | null = null
): void {
  // SECURITY: Use secure logger that masks sensitive data
  const errorId = logger.error(context, error);
  void errorId; // Explicitly marked as unused for CI

  let userMessage = 'Si è verificato un errore imprevisto.';
  let type: ToastType = 'error';

  // Handle specific Supabase or known errors
  const errorObj = error as ErrorDetails;

  if (errorObj?.code === 'PGRST116') {
    // Expected single result but found 0 or multiple (often "not found")
    userMessage = 'Dati non trovati.';
    type = 'warning';
  } else if (
    errorObj?.message?.toLowerCase().includes('network') ||
        errorObj?.message?.toLowerCase().includes('fetch')
  ) {
    userMessage = 'Errore di connessione. Controlla la tua rete.';
  } else if (error instanceof AppError) {
    userMessage = error.message;
  } else if (errorObj?.message) {
    // SECURITY: Don't expose raw database error messages to users
    userMessage = isDevelopment ? errorObj.message : 'Si è verificato un errore. Contatta il supporto.';
  }

  // Show toast
  if (Toast && typeof Toast.show === 'function') {
    Toast.show(userMessage, type);
  } else {
    // Fallback if Toast is not available
    logger.warn('errorHandler', 'Toast not available, error message:', userMessage);
  }

  // Render in page if requested
  if (renderTarget && renderTarget instanceof HTMLElement) {
    setSafeHTML(renderTarget, `
            <div class="error-state" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color, #dc3545); margin-bottom: 1rem;"></i>
                <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">${escapeHtml(userMessage)}</p>
                <button class="menu-button primary" onclick="location.reload()">
                    <i class="fas fa-sync-alt"></i> Ricarica Pagina
                </button>
            </div>
        `);
  }
}



// Helper escapeHtml rimosso in favore di import centralizzato da ../utils/utils.js
