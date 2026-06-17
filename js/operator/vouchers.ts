import { openModal } from '../ui/ui.js';
// Import the web component definition to ensure it's registered
import '../ui/components/VoucherManager.js';

/**
 * Shows the Voucher Manager Modal
 * Replaces legacy imperative code with declarative <voucher-manager> component
 */
export async function showVoucherMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Riscatto Voucher');

  const container = document.getElementById('modal-body');
  if (!container) {return;}

  // Clear previous content
  container.innerHTML = '';

  // Create and configure component
  const manager = document.createElement('voucher-manager');
  manager.setAttribute('stationId', String(stationId));
  manager.setAttribute('userId', String(userId));

  // Listen for completion events to maybe close modal or refresh data
  // Note: We use 'any' cast for custom event typing if needed, 
  // or simply trust the event structure.
  manager.addEventListener('voucher-redeemed', ((e: CustomEvent) => {
    console.log('Voucher redeemed:', e.detail);
    // Optional: Refresh dashboard data if needed, or let user close modal manually
    // closeModal(); // Or keep open for next scan (VoucherManager UI allows 'Nuova Scansione')
  }) as EventListener);

  container.appendChild(manager);

  // Handle modal close cleanup if needed (Wrapper logic)
  // The component handles its own disconnectedCallback to stop scanner.
}
