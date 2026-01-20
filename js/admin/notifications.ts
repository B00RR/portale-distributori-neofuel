/**
 * Admin Notifications Module
 * Handles notification display in the admin panel
 */

import { handleError } from '../shared/error-handler.js';

/**
 * Display notifications in the admin panel
 * @param container - HTML element where notifications will be rendered
 */
export async function showNotificheAdmin(container: HTMLElement): Promise<void> {
    try {
        container.innerHTML = '<p>Nessuna notifica.</p>';
    } catch (err) {
        handleError(err, 'showNotificheAdmin', container);
    }
}
