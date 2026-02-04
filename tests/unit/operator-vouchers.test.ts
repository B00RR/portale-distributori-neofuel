import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUI } = vi.hoisted(() => ({
    mockUI: { openModal: vi.fn() }
}));

vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/components/VoucherManager.js', () => ({}));

import { showVoucherMenu } from '../../js/operator/vouchers.js';

describe('Operator Vouchers Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modal-body"></div>';
    });

    it('should show voucher menu modal', async () => {
        await showVoucherMenu('ST-123', 'user-456');

        expect(mockUI.openModal).toHaveBeenCalledWith('Riscatto Voucher');
    });

    it('should create voucher-manager component', async () => {
        await showVoucherMenu('ST-123', 'user-456');

        const component = document.querySelector('voucher-manager');
        expect(component).not.toBeNull();
        expect(component?.getAttribute('stationId')).toBe('ST-123');
        expect(component?.getAttribute('userId')).toBe('user-456');
    });

    it('should clear previous modal content', async () => {
        const container = document.getElementById('modal-body')!;
        container.innerHTML = '<div>Old content</div>';

        await showVoucherMenu('ST-123', 'user-456');

        expect(container.innerHTML).not.toContain('Old content');
        expect(container.querySelector('voucher-manager')).not.toBeNull();
    });
});
