import { registerExecutor, QueuedAction } from '../core/offline-queue.js';
import { logger } from '../core/logger.js';

import { processNewCredit, processPayment } from './credits.js';
import { processExtraIncome } from './extra-income.js';
import { processInvoiceRequest } from './invoices.js';
import { processOutflow } from './outflows.js';

type FinancialActionPayload = Record<string, unknown> & {
  kind?: unknown;
};

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new Error(`Payload offline non valido: ${key}`);
}

function readNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Payload offline non valido: ${key}`);
}

function readObject<T extends Record<string, unknown>>(
  payload: Record<string, unknown>,
  key: string
): T {
  const value = payload[key];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as T;
  }
  throw new Error(`Payload offline non valido: ${key}`);
}

async function executeFinancialAction(action: QueuedAction): Promise<boolean> {
  const payload = action.payload as FinancialActionPayload;
  const kind = payload.kind;

  try {
    if (kind === 'credit_create') {
      await processNewCredit(
        readNumber(payload, 'stationId'),
        readString(payload, 'operatorId'),
        readString(payload, 'customerName'),
        readNumber(payload, 'amount'),
        readString(payload, 'product'),
        readString(payload, 'notes'),
        { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
      );
      return true;
    }

    if (kind === 'credit_payment') {
      await processPayment(
        readNumber(payload, 'stationId'),
        readString(payload, 'operatorId'),
        readObject(payload, 'customer'),
        readNumber(payload, 'amount'),
        readString(payload, 'method'),
        { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
      );
      return true;
    }

    if (kind === 'outflow_create') {
      await processOutflow(
        readNumber(payload, 'stationId'),
        readString(payload, 'operatorId'),
        readNumber(payload, 'amount'),
        readString(payload, 'type'),
        readString(payload, 'description'),
        { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
      );
      return true;
    }

    if (kind === 'extra_income_create') {
      await processExtraIncome(
        readNumber(payload, 'stationId'),
        readString(payload, 'operatorId'),
        readNumber(payload, 'amount'),
        readString(payload, 'type'),
        readString(payload, 'description'),
        { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
      );
      return true;
    }

    if (kind === 'invoice_request') {
      await processInvoiceRequest(
        readNumber(payload, 'stationId'),
        readString(payload, 'operatorId'),
        payload.clienteId === null ? null : readNumber(payload, 'clienteId'),
        readString(payload, 'customerName'),
        readNumber(payload, 'amount'),
        readString(payload, 'paymentMethod'),
        readString(payload, 'productCategory'),
        readString(payload, 'description'),
        {
          skipOfflineQueue: true,
          createdAt: readString(payload, 'createdAt'),
          invoiceNumber: readString(payload, 'invoiceNumber'),
          invoiceDate: readString(payload, 'invoiceDate')
        }
      );
      return true;
    }

    logger.warn('OfflineFinancialExecutors', 'Unsupported financial action kind:', kind);
    return false;
  } catch (err) {
    logger.error('OfflineFinancialExecutors', 'Financial replay failed:', err);
    return false;
  }
}

registerExecutor('movement_create', executeFinancialAction);
