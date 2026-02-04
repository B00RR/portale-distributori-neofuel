import { describe, it, expect } from 'vitest';

import {
    createWarningMessage,
    createSuccessMessage,
    createErrorMessage,
    createBackButton,
    createFormActions,
    createPistolaCard,
    createSummaryBox,
    createSummaryRow,
    createContentBox,
    createDivider
} from '../../js/operator/ui-components.js';

describe('Operator UI Components Module', () => {
    it('should create warning message', () => {
        const html = createWarningMessage('Warning', 'Test warning');
        expect(html).toContain('Warning');
        expect(html).toContain('Test warning');
    });

    it('should create success message', () => {
        const html = createSuccessMessage('Success', 'Operation complete');
        expect(html).toContain('Success');
        expect(html).toContain('Operation complete');
    });

    it('should create error message', () => {
        const error = { message: 'Test error', code: 'ERR001' };
        const html = createErrorMessage('Error Title', error);
        expect(html).toContain('Error Title');
        expect(html).toContain('Test error');
    });

    it('should create back button', () => {
        const html = createBackButton('btn-test');
        expect(html).toContain('btn-test');
        expect(html).toContain('Torna al Menu');
    });

    it('should create form actions', () => {
        const html = createFormActions({ cancelText: 'Cancel', confirmText: 'OK' });
        expect(html).toContain('Cancel');
        expect(html).toContain('OK');
    });

    it('should create pistola card', () => {
        const pistola: any = { id: 1, nome: 'P1', islands: { nome: 'Isola 1' } };
        const html = createPistolaCard(pistola, 1000, 1500);
        expect(html).toContain('P1');
        expect(html).toContain('1000');
    });

    it('should create summary box', () => {
        const rows = [createSummaryRow('Total', '€100')];
        const html = createSummaryBox('Summary', rows);
        expect(html).toContain('Summary');
        expect(html).toContain('Total');
    });

    it('should create content box', () => {
        const html = createContentBox('Test content');
        expect(html).toContain('content-box');
        expect(html).toContain('Test content');
    });

    it('should create divider', () => {
        const html = createDivider();
        expect(html).toContain('section-divider');
    });
});
