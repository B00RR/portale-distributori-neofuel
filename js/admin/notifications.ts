import { handleError } from '../shared/error-handler.js';

export async function showNotificheAdmin(container: HTMLElement): Promise<void> {
    try {
        container.innerHTML = '<p>Nessuna notifica.</p>';
    } catch (err) {
        handleError(err as Error, 'showNotificheAdmin', container);
    }
}
