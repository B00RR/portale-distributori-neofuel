// ==========================================
// APP ENTRY POINT
// Refactored: App Root handles auth and routing
// ==========================================
import { initAnalytics } from './core/analytics.js';
import { initializeCalculationPresets } from './utils/calculation-presets.js';
import { requestPasswordReset } from './core/auth.js';
import { CustomWindow } from './types.js';

// Import AppRoot component to register it
import './ui/components/AppRoot.js';
// Import dependent components
import './ui/components/OperatorDashboard.js';
import './ui/components/AdminDashboard.js';

const customWindow = window as unknown as CustomWindow;

// Expose global functions for compatibility (password reset link in emails)
customWindow.requestPasswordReset = requestPasswordReset;

/**
 * Minimal initialization - AppRoot handles the heavy lifting
 */
function initializeApp(): void {
    // Initialize monitoring and analytics
    initAnalytics();

    // Initialize calculation presets for revenue/expense calculations
    initializeCalculationPresets();

    console.log('[App] Bootstrap complete. AppRoot is now in control.');
}

// Avvio
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
