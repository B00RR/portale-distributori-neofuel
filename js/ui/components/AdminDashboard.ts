import { html, css, TemplateResult, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { showAdminArea } from '../../admin.js';

/**
 * Admin Dashboard - LitElement wrapper for the existing admin layout.
 * Uses Light DOM to allow showAdminArea to access the container via document.getElementById.
 */
@customElement('admin-dashboard')
export class AdminDashboard extends LitElement {
    // Use Light DOM instead of Shadow DOM for legacy compatibility
    protected override createRenderRoot(): HTMLElement | DocumentFragment {
        return this;
    }

    static styles = css`
        admin-dashboard {
            display: block;
            min-height: 100vh;
        }
    `;

    protected override firstUpdated(): void {
        this.initializeAdminShell();
    }

    private initializeAdminShell(): void {
        const container = this.querySelector('#main-content') as HTMLElement;
        if (!container) {
            console.error('[AdminDashboard] Container not found');
            return;
        }

        console.log('[AdminDashboard] Initializing Admin Area');

        // Call the existing admin area function - it will find #main-content in the Light DOM
        showAdminArea();
    }

    override render(): TemplateResult {
        // Render the main-content element directly in Light DOM
        return html`<main id="main-content" style="padding: 16px; min-height: 100vh;"></main>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'admin-dashboard': AdminDashboard;
    }
}
