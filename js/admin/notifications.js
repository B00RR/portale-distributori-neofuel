import { handleError } from "../shared/error-handler.js";

export async function showNotificheAdmin(container) {
    try {
        container.innerHTML = '<p>Nessuna notifica.</p>';
    } catch (err) {
        handleError(err, 'showNotificheAdmin', container);
    }
}
