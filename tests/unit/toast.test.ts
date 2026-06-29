import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Toast from '../../js/ui/toast.js';

describe('Toast Module', () => {
    let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should create container if missing', () => {
        expect(document.getElementById('toast-container')).toBeNull();
        Toast.show('Test');
        expect(document.getElementById('toast-container')).not.toBeNull();
    });

    it('should show success toast', () => {
        Toast.show('Success message', 'success');
        const toast = document.querySelector('.toast-success');
        expect(toast).toBeTruthy();
        expect(toast?.textContent).toContain('Success message');
        // Check icon class
        expect(toast?.innerHTML).toContain('fa-check-circle');
    });

    it('should show error toast', () => {
        Toast.show('Error msg', 'error');
        const toast = document.querySelector('.toast-error');
        expect(toast?.innerHTML).toContain('fa-exclamation-circle');
    });

    it('should auto-dismiss after duration', () => {
        Toast.show('Auto dismiss', 'info', 1000);
        const toast = document.querySelector('.toast');
        expect(toast).toBeTruthy();

        // Fast forward
        vi.advanceTimersByTime(1000); // Trigger dismiss
        vi.advanceTimersByTime(300); // Trigger remove animation

        expect(document.querySelector('.toast')).toBeNull();
    });

    it('should not auto-dismiss if duration is 0', () => {
        Toast.show('Sticky', 'info', 0);
        vi.advanceTimersByTime(5000);
        expect(document.querySelector('.toast')).toBeTruthy();
    });

    it('should handle action button', () => {
        const onClickSpy = vi.fn();
        Toast.show('Action required', 'warning', 0, {
            action: { text: 'Retry', onClick: onClickSpy }
        });

        const btn = document.querySelector('.toast-action-btn') as HTMLElement;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toContain('Retry');

        btn.click();
        expect(onClickSpy).toHaveBeenCalled();
        // The action handler logs a debug line; verify it (and keep test output clean).
        expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should clean up container when empty', () => {
        Toast.show('Msg 1', 'info', 100);
        vi.advanceTimersByTime(100);
        vi.advanceTimersByTime(300);

        expect(document.getElementById('toast-container')).toBeNull();
    });

    it('should handle dismiss of already removed toast', () => {
        // Create toast
        Toast.show('Msg', 'info', 1000);
        const toast = document.querySelector('.toast') as HTMLElement;
        const container = document.getElementById('toast-container') as HTMLElement;

        // Manually remove class 'show' to simulate it's already dismissing
        toast.classList.remove('show');

        // Call dismiss directly
        Toast.dismiss(toast, container);

        // Should return early, meaning element still there until something else removes it (or nothing happens)
        // Check if setTimeout was called?
        // Or check simply it didn't crash.
        // If it proceeded, it would wait 300ms then remove.
        // Since we removed 'show', it returns.

        vi.advanceTimersByTime(300);
        // Toast should strictly speaking still be in DOM if logic return early
        // BUT wait, Toast.dismiss logic: if (!toast.classList.contains('show')) return;
        // So yes, it should still be there.
        expect(document.contains(toast)).toBe(true);
    });

    it('should fallback to default icon if type unknown', () => {
        Toast.show('Unknown', 'custom' as unknown as 'success' | 'error' | 'info' | 'warning');
        const toast = document.querySelector('.toast-custom');
        expect(toast?.innerHTML).toContain('fa-info-circle');
    });

    it('should expose the container as a polite live region', () => {
        Toast.show('ok', 'success');
        const container = document.getElementById('toast-container');
        expect(container?.getAttribute('role')).toBe('status');
        expect(container?.getAttribute('aria-live')).toBe('polite');
    });

    it('should mark error toasts as assertive alerts', () => {
        Toast.show('boom', 'error');
        const toast = document.querySelector('.toast-error');
        expect(toast?.getAttribute('role')).toBe('alert');
        expect(toast?.getAttribute('aria-live')).toBe('assertive');
    });
});
