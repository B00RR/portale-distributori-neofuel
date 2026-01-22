/**
 * Admin Notifications Module
 * Handles notification display in the admin panel
 */

import { handleError } from '../shared/error-handler.js';

/**
 * Renders admin notifications into the provided container element.
 *
 * On error, delegates handling to the module's centralized error handler.
 *
 * @param container - Element used as the notification render target
 */
export async function showNotificheAdmin(container: HTMLElement): Promise<void> {
    try {
        container.innerHTML = '<p>Nessuna notifica.</p>';
    } catch (err) {
        handleError(err, 'showNotificheAdmin', container);
    }
}