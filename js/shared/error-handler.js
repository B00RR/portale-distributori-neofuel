
import { Toast } from "../ui/toast.js";

export class AppError extends Error {
    constructor(message, code, originalError) {
        super(message);
        this.code = code;
        this.originalError = originalError;
        this.name = 'AppError';
    }
}

/**
 * Gestisce gli errori in modo centralizzato mostrando un Toast e loggando in console.
 * Opzionalmente renderizza l'errore in un elemento HTML.
 * @param {Error|any} error - L'oggetto errore catturato
 * @param {string} context - Il contesto in cui si è verificato l'errore (es. nome funzione)
 * @param {HTMLElement|null} renderTarget - Elemento dove mostrare l'errore in modo persistente
 */
export function handleError(error, context = '', renderTarget = null) {
    console.error(`[${context}] Error:`, error);

    let userMessage = 'Si è verificato un errore imprevisto.';
    let type = 'error';

    // Gestione errori specifici Supabase o noti
    if (error?.code === 'PGRST116') {
        // Risultato atteso singolo ma trovati 0 o multipli (spesso "non trovato")
        userMessage = 'Dati non trovati.';
        type = 'warning';
    } else if (error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('fetch')) {
        userMessage = 'Errore di connessione. Controlla la tua rete.';
    } else if (error instanceof AppError) {
        userMessage = error.message;
    } else if (error?.message) {
        userMessage = error.message;
    }

    // Mostra il toast
    if (Toast && typeof Toast.show === 'function') {
        Toast.show(userMessage, type);
    } else {
        // Fallback se Toast non è disponibile
        console.warn('Toast not available due to error');
        if (!renderTarget) alert(`${type.toUpperCase()}: ${userMessage}`);
    }

    // Renderizza in pagina se richiesto
    if (renderTarget && renderTarget instanceof HTMLElement) {
        renderTarget.innerHTML = `
        <div class="error-state" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color, #dc3545); margin-bottom: 1rem;"></i>
            <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">${userMessage}</p>
            <button class="menu-button primary" onclick="location.reload()">
                <i class="fas fa-sync-alt"></i> Ricarica Pagina
            </button>
        </div>
     `;
    }
}
