import { openModal, closeModal } from '../ui/ui.js';
// Import the component to register it
import '../ui/components/ClosureWizard.js';

/**
 * Open a modal titled "Chiusura Turno" and mount a <closure-wizard> element configured with the provided station and user identifiers.
 *
 * @param stationId - The station identifier to set on the wizard (converted to string).
 * @param userId - The operator identifier to set on the wizard (converted to string).
 */
export async function startClosureWizard(stationId: number | string, userId: string | number): Promise<void> {
    try {
        openModal('Chiusura Turno');
        const modalBody = document.getElementById('modal-body');
        if (!modalBody) return;

        modalBody.innerHTML = ''; // Clear existing content

        const wizard = document.createElement('closure-wizard');
        wizard.setAttribute('stationId', stationId.toString());
        wizard.setAttribute('userId', userId.toString());

        // Listen for cancel event to close modal
        wizard.addEventListener('cancel', () => closeModal());

        modalBody.appendChild(wizard);

    } catch (err: any) {
        console.error('[Closure Wrapper] Error starting wizard:', err);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) {
            modalBody.innerHTML = `<p style="color: red; padding: 20px;">Errore: ${err.message}</p>`;
        }
    }
}