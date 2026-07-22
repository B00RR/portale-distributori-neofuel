import { supabase } from '../core/api.js';
import { isOffline, queueAction } from '../core/offline-queue.js';
import { openModal } from '../ui/ui.js';

// Import the web component definition to ensure it's registered
import '../ui/components/VoucherManager.js';

import { checkOpeningStatus } from './opening.js';

/**
 * Shows the Voucher Manager Modal
 * Replaces legacy imperative code with declarative <voucher-manager> component
 */
export async function showVoucherMenu(stationId: number | string, userId: string): Promise<void> {
  openModal('Riscatto Voucher');

  const container = document.getElementById('modal-body');
  if (!container) {
    return;
  }

  // Clear previous content
  container.replaceChildren();

  // Determine the active shift so the voucher redemption is tied to it.
  const activeOpening = await checkOpeningStatus(stationId);
  const shiftId = activeOpening?.id ?? '';

  // Create and configure component
  const manager = document.createElement('voucher-manager');
  manager.setAttribute('stationId', String(stationId));
  manager.setAttribute('userId', String(userId));
  if (shiftId) {
    manager.setAttribute('shiftId', String(shiftId));
  }

  // Listen for completion events to maybe close modal or refresh data
  // Note: We use 'any' cast for custom event typing if needed,
  // or simply trust the event structure.
  manager.addEventListener('voucher-redeemed', ((_e: CustomEvent) => {
    // Optional: Refresh dashboard data if needed, or let user close modal manually
    // closeModal(); // Or keep open for next scan (VoucherManager UI allows 'Nuova Scansione')
  }) as EventListener);

  container.appendChild(manager);

  // Handle modal close cleanup if needed (Wrapper logic)
  // The component handles its own disconnectedCallback to stop scanner.
}

export async function processPointsRedeem(
  stationId: number | string,
  userId: string,
  amount: number,
  shiftId?: number | string | null,
  options?: { skipOfflineQueue?: boolean; requestId?: string }
): Promise<void> {
  const numericStationId = Number(stationId);
  const numericUserId = Number(userId);
  const numericShiftId = shiftId ? Number(shiftId) : null;

  if (!options?.skipOfflineQueue && isOffline()) {
    await queueAction('movement_create', {
      kind: 'points_redeem',
      stationId: numericStationId,
      operatorId: String(userId),
      shiftId: numericShiftId,
      amount
    });
    return;
  }

  const requestId =
    options?.requestId ??
    `points_${numericStationId}_${numericShiftId ?? 'no-shift'}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const rpcParams: {
    p_station_id: number;
    p_operator_id: number;
    p_importo: number;
    p_request_id: string;
    p_shift_id?: number | null;
  } = {
    p_station_id: numericStationId,
    p_operator_id: numericUserId,
    p_importo: amount,
    p_request_id: requestId
  };

  if (numericShiftId !== null) {
    rpcParams.p_shift_id = numericShiftId;
  }

  const { data: result, error } = await supabase.rpc('register_punti_riscatto', rpcParams);

  if (error) {
    throw error;
  }
  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    !(result as { success?: boolean }).success
  ) {
    throw new Error(String((result as { error?: string }).error ?? 'Riscatto punti fallito'));
  }
}
