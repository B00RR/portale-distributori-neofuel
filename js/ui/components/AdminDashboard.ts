import { html, css, CSSResultGroup, TemplateResult, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { showAdminArea } from '../../admin.js';

/**
 * Admin Dashboard - LitElement wrapper for the existing admin layout.
 * Acts as a bridge between the new declarative <app-root> and the
 * existing imperative showAdminArea function.
 */
@customElement('admin-dashboard')
export class AdminDashboard extends LitElement {
    static override styles: CSSResultGroup = css`
        :host {
            display: block;
        }

        #admin-shell-container {
            min-height: 100%;
        }
    `;

    protected override firstUpdated(): void {
        this.initializeAdminShell();
    }

    private initializeAdminShell(): void {
        const container = this.renderRoot.querySelector('#admin-shell-container') as HTMLElement;
        if (!container) {
            console.error('[AdminDashboard] Container not found');
            return;
        }

        console.log('[AdminDashboard] Initializing Admin Area');

        // The existing showAdminArea targets #main-content, so we need to
        // temporarily set our container's ID to main-content
        const originalMainContent = document.getElementById('main-content');
        if (originalMainContent) {
            originalMainContent.id = 'main-content-backup';
        }
        container.id = 'main-content';

        // Call the existing admin area function
        showAdminArea();

        // Restore original ID after a tick
        setTimeout(() => {
            if (originalMainContent) {
                container.id = 'admin-shell-container';
                originalMainContent.id = 'main-content';
            }
        }, 100);
    }

    override render(): TemplateResult {
        return html`<div id="admin-shell-container"></div>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'admin-dashboard': AdminDashboard;
    }
}
