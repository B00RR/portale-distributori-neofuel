import { html, css, TemplateResult, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { renderOperatorShell, OperatorHandlers } from '../../operator/layout.js';
import { router, OperatorView } from '../../operator/router.js';
import { store } from '../../shared/state.js';

/**
 * Operator Dashboard - LitElement wrapper for the existing operator layout.
 * Uses Light DOM to allow renderOperatorShell to access the container via document.getElementById.
 */
@customElement('operator-dashboard')
export class OperatorDashboard extends LitElement {
    @property({ type: String }) userId: string = '';
    @property({ type: Number }) stationId: number = 0;

    // Use Light DOM instead of Shadow DOM for legacy compatibility
    protected override createRenderRoot(): HTMLElement | DocumentFragment {
        return this;
    }

    static styles = css`
        operator-dashboard {
            display: block;
            min-height: 100vh;
        }
    `;

    protected override firstUpdated(): void {
        this.initializeOperatorShell();
    }

    private async initializeOperatorShell(): Promise<void> {
        const container = this.querySelector('#main-content') as HTMLElement;
        if (!container) {
            console.error('[OperatorDashboard] Container not found');
            return;
        }

        console.log('[OperatorDashboard] Initializing. User:', this.userId, 'Station:', this.stationId);

        // Ensure store has fresh station_id
        const user = store.getUser();
        if (user && this.stationId) {
            if (user.station_id !== this.stationId) {
                console.log('[OperatorDashboard] Updating station_id in store:', user.station_id, '->', this.stationId);
                user.station_id = this.stationId;
                store.setUser(user);
            }
        }

        // Define handlers for the layout
        const handlers: OperatorHandlers = {
            onNavigate: (view: OperatorView) => router.navigateTo(view),
            onOpening: () => router.navigateTo('apertura'),
            onClosure: () => router.navigateTo('chiusura')
        };

        // Render the operator shell into our container
        await renderOperatorShell(container, handlers);
    }

    override render(): TemplateResult {
        // Render the main-content element directly in Light DOM
        return html`<main id="main-content" style="padding: 16px; min-height: 100vh;"></main>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'operator-dashboard': OperatorDashboard;
    }
}
