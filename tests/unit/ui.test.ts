/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    openModal,
    closeModal,
    showInfoModal,
    openConfirmModal,
    showPromptModal,
    showLoadingMessage,
    showFullScreenLoader,
    hideFullScreenLoader,
    showErrorMessage,
    setButtonLoading,
    initAdminContent
} from '../../js/ui/ui.js';

describe('UI Module', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('Loaders', () => {
        it('showLoadingMessage should inject loader html', () => {
            const container = document.createElement('div');
            showLoadingMessage(container);
            expect(container.innerHTML).toContain('loader-logo');
        });

        it('showFullScreenLoader should create and display overlay', () => {
            showFullScreenLoader();
            const loader = document.getElementById('full-screen-loader');
            expect(loader).toBeTruthy();
            expect(loader?.style.display).toBe('flex');

            // Call again to ensure no duplicate
            showFullScreenLoader();
            expect(document.querySelectorAll('#full-screen-loader').length).toBe(1);
        });

        it('hideFullScreenLoader should fade out and remove', () => {
            showFullScreenLoader();
            hideFullScreenLoader();

            const loader = document.getElementById('full-screen-loader') as HTMLElement;
            expect(loader.style.opacity).toBe('0');

            vi.advanceTimersByTime(300);
            expect(loader.style.display).toBe('none');
        });

        it('setButtonLoading should toggle state', () => {
            const btn = document.createElement('button');
            btn.innerHTML = 'Save';

            setButtonLoading(btn, true, 'Saving...');
            expect(btn.disabled).toBe(true);
            expect(btn.innerHTML).toContain('Saving...');
            expect(btn.dataset.originalText).toBe('Save');

            setButtonLoading(btn, false);
            expect(btn.disabled).toBe(false);
            expect(btn.innerHTML).toBe('Save');
        });
    });

    describe('Modals', () => {
        it('openModal should create modal structure', () => {
            openModal('Test Title');
            const modal = document.getElementById('app-modal');
            const title = document.getElementById('modal-title');

            expect(modal).toBeTruthy();
            expect(modal?.style.display).toBe('flex');
            expect(title?.textContent).toBe('Test Title');
        });

        it('closeModal should hide modal and clear body', () => {
            openModal('Test');
            const body = document.getElementById('modal-body') as HTMLElement;
            body.innerHTML = '<p>Content</p>';

            closeModal();
            const modal = document.getElementById('app-modal');

            expect(modal?.style.display).toBe('none');
            expect(body.innerHTML).toBe('');
        });

        it('openConfirmModal should resolve true on OK', async () => {
            const promise = openConfirmModal('Are you sure?');

            const okBtn = document.getElementById('confirm-ok') as HTMLButtonElement;
            okBtn.click();

            const result = await promise;
            expect(result).toBe(true);
        });

        it('openConfirmModal should resolve false on Cancel', async () => {
            const promise = openConfirmModal('Are you sure?');

            const cancelBtn = document.getElementById('confirm-cancel') as HTMLButtonElement;
            cancelBtn.click();

            const result = await promise;
            expect(result).toBe(false);
        });

        it('showPromptModal should resolve with value on OK', async () => {
            // Mock focus which might fail in JSDOM if not setting up full layout
            const promise = showPromptModal('Enter name', 'John');

            const input = document.getElementById('prompt-input') as HTMLInputElement;
            expect(input.value).toBe('John');
            input.value = 'Jane';

            const okBtn = document.getElementById('prompt-ok') as HTMLButtonElement;
            okBtn.click();

            const result = await promise;
            expect(result).toBe('Jane');
        });

        it('showPromptModal should resolve null on Cancel', async () => {
            const promise = showPromptModal('Enter name');
            const cancelBtn = document.getElementById('prompt-cancel') as HTMLButtonElement;
            cancelBtn.click();

            const result = await promise;
            expect(result).toBeNull();
        });

        it('showInfoModal should close on OK and have primary button', () => {
            showInfoModal('Info message');
            const modal = document.getElementById('app-modal');
            expect(modal?.style.display).toBe('flex');

            const okBtn = document.getElementById('info-modal-ok') as HTMLButtonElement;
            expect(okBtn.className).toContain('primary');
            okBtn.click();

            expect(modal?.style.display).toBe('none');
        });
    });

    describe('Error Messages', () => {
        it('showErrorMessage should format error string', () => {
            const container = document.createElement('div');
            showErrorMessage(container, 'Fatal Error');
            expect(container.innerHTML).toContain('Fatal Error');
            expect(container.innerHTML).toContain('text-danger');
        });

        it('showErrorMessage should handle Error object', () => {
            const container = document.createElement('div');
            showErrorMessage(container, new Error('Object Error'));
            expect(container.innerHTML).toContain('Object Error');
        });

        it('showErrorMessage should use default message', () => {
            const container = document.createElement('div');
            showErrorMessage(container, null, 'Default Msg');
            expect(container.innerHTML).toContain('Default Msg');
        });
    });

    describe('Init Admin', () => {
        it('initAdminContent should return elements', () => {
            document.body.innerHTML = '<div id="admin-content"></div><div id="content-actions"></div>';
            const els = initAdminContent();
            expect(els.content).toBeTruthy();
            expect(els.actions).toBeTruthy();
        });
    });
});
