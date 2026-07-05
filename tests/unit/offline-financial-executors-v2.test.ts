import { readFileSync } from 'node:fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockRegisterExecutor,
    mockLogger,
    mockProcessNewCredit,
    mockProcessPayment,
    mockProcessOutflow,
    mockProcessExtraIncome,
    mockProcessInvoiceRequest
} = vi.hoisted(() => ({
    mockRegisterExecutor: vi.fn(),
    mockLogger: { warn: vi.fn(), error: vi.fn() },
    mockProcessNewCredit: vi.fn().mockResolvedValue(undefined),
    mockProcessPayment: vi.fn().mockResolvedValue(undefined),
    mockProcessOutflow: vi.fn().mockResolvedValue(undefined),
    mockProcessExtraIncome: vi.fn().mockResolvedValue(undefined),
    mockProcessInvoiceRequest: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../js/core/offline-queue.js', () => ({
    registerExecutor: mockRegisterExecutor
}));

vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/operator/credits.js', () => ({
    processNewCredit: mockProcessNewCredit,
    processPayment: mockProcessPayment
}));
vi.mock('../../js/operator/outflows.js', () => ({ processOutflow: mockProcessOutflow }));
vi.mock('../../js/operator/extra-income.js', () => ({ processExtraIncome: mockProcessExtraIncome }));
vi.mock('../../js/operator/invoices.js', () => ({
    processInvoiceRequest: mockProcessInvoiceRequest
}));

type CapturedExecutor = (action: { payload: Record<string, unknown> }) => Promise<boolean>;

async function loadExecutor(): Promise<CapturedExecutor> {
    vi.resetModules();
    await import('../../js/operator/offline-financial-executors-v2.js');
    expect(mockRegisterExecutor).toHaveBeenCalledWith('movement_create', expect.any(Function));
    return mockRegisterExecutor.mock.calls.at(-1)?.[1] as CapturedExecutor;
}

describe('Offline financial executors bootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers movement_create during app bootstrap', () => {
        const appSource = readFileSync('js/app.ts', 'utf8');

        expect(appSource).toContain("./operator/offline-financial-executors-v2.js");
    });

    it('replays queued credit creation without queueing it again', async () => {
        const executor = await loadExecutor();

        const result = await executor({
            payload: {
                kind: 'credit_create',
                stationId: 123,
                operatorId: '456',
                customerName: 'Cliente Test',
                amount: 50,
                product: 'Gasolio',
                notes: 'nota',
                createdAt: '2026-07-05T10:00:00.000Z'
            }
        });

        expect(result).toBe(true);
        expect(mockProcessNewCredit).toHaveBeenCalledWith(123, '456', 'Cliente Test', 50, 'Gasolio', 'nota', {
            skipOfflineQueue: true,
            createdAt: '2026-07-05T10:00:00.000Z'
        });
    });

    it('replays queued credit payment without queueing it again', async () => {
        const executor = await loadExecutor();

        const result = await executor({
            payload: {
                kind: 'credit_payment',
                stationId: '123',
                operatorId: '456',
                customer: { id: 7, cliente: 'Cliente Test', saldo: 90 },
                amount: 25,
                method: 'contanti',
                createdAt: '2026-07-05T10:00:00.000Z'
            }
        });

        expect(result).toBe(true);
        expect(mockProcessPayment).toHaveBeenCalledWith(
            123,
            '456',
            { id: 7, cliente: 'Cliente Test', saldo: 90 },
            25,
            'contanti',
            { skipOfflineQueue: true, createdAt: '2026-07-05T10:00:00.000Z' }
        );
    });

    it('replays queued outflows without queueing them again', async () => {
        const executor = await loadExecutor();

        const result = await executor({
            payload: {
                kind: 'outflow_create',
                stationId: 123,
                operatorId: '456',
                amount: 15,
                type: 'prelievo',
                description: 'Prelievo titolare',
                createdAt: '2026-07-05T10:00:00.000Z'
            }
        });

        expect(result).toBe(true);
        expect(mockProcessOutflow).toHaveBeenCalledWith(123, '456', 15, 'prelievo', 'Prelievo titolare', {
            skipOfflineQueue: true,
            createdAt: '2026-07-05T10:00:00.000Z'
        });
    });

    it('replays queued extra income without queueing it again', async () => {
        const executor = await loadExecutor();

        const result = await executor({
            payload: {
                kind: 'extra_income_create',
                stationId: 123,
                operatorId: '456',
                amount: 12,
                type: 'olio',
                description: 'Olio motore',
                createdAt: '2026-07-05T10:00:00.000Z'
            }
        });

        expect(result).toBe(true);
        expect(mockProcessExtraIncome).toHaveBeenCalledWith(123, '456', 12, 'olio', 'Olio motore', {
            skipOfflineQueue: true,
            createdAt: '2026-07-05T10:00:00.000Z'
        });
    });

    it('replays queued invoice requests without queueing them again', async () => {
        const executor = await loadExecutor();

        const result = await executor({
            payload: {
                kind: 'invoice_request',
                stationId: 123,
                operatorId: '456',
                clienteId: null,
                customerName: 'Cliente Fattura',
                amount: 80,
                paymentMethod: 'pos',
                productCategory: 'gasolio',
                description: 'Rifornimento',
                createdAt: '2026-07-05T10:00:00.000Z',
                invoiceNumber: 'REQ-1',
                invoiceDate: '2026-07-05'
            }
        });

        expect(result).toBe(true);
        expect(mockProcessInvoiceRequest).toHaveBeenCalledWith(
            123,
            '456',
            null,
            'Cliente Fattura',
            80,
            'pos',
            'gasolio',
            'Rifornimento',
            {
                skipOfflineQueue: true,
                createdAt: '2026-07-05T10:00:00.000Z',
                invoiceNumber: 'REQ-1',
                invoiceDate: '2026-07-05'
            }
        );
    });

    it('keeps unsupported payloads queued by returning false', async () => {
        const executor = await loadExecutor();

        await expect(executor({ payload: { kind: 'unknown' } })).resolves.toBe(false);
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});
