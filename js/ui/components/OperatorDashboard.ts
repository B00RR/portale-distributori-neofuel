import { html, css, CSSResultGroup, TemplateResult, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { renderOperatorShell, OperatorHandlers } from '../../operator/layout.js';
import { router, OperatorView } from '../../operator/router.js';
import { store } from '../../shared/state.js';

/**
 * Operator Dashboard - LitElement wrapper for the existing operator layout.
 * Acts as a bridge between the new declarative <app-root> and the
 * existing imperative renderOperatorShell function.
 */
@customElement('operator-dashboard')
export class OperatorDashboard extends LitElement {
    @property({ type: String }) userId: string = '';
    @property({ type: Number }) stationId: number = 0;

    static override styles: CSSResultGroup = css`
        :host {
            display: block;
        }

        #operator-shell-container {
            min-height: 100%;
        }
    `;

    protected override firstUpdated(): void {
        this.initializeOperatorShell();
    }

    private async initializeOperatorShell(): Promise<void> {
        const container = this.renderRoot.querySelector('#operator-shell-container') as HTMLElement;
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
        return html`<div id="operator-shell-container"></div>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'operator-dashboard': OperatorDashboard;
    }
}
