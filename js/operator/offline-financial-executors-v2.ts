import { logger } from '../core/logger.js';
import { registerExecutor } from '../core/offline-queue.js';
import type { QueuedAction } from '../core/offline-queue.js';

import { processNewCredit, processPayment } from './credits.js';
import { processExtraIncome } from './extra-income.js';
import { processInvoiceRequest } from './invoices.js';
import { processOutflow } from './outflows.js';

type FinancialActionPayload = Record<string, unknown> & { kind?: unknown };

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]; // eslint-disable-line security/detect-object-injection -- key is limited to known offline payload fields by callers.
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new Error(`Payload offline non valido: ${key}`);
}

function readNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]; // eslint-disable-line security/detect-object-injection -- key is limited to known offline payload fields by callers.
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Payload offline non valido: ${key}`);
}

async function executeFinancialAction(action: QueuedAction): Promise<boolean> {
  const payload = action.payload as FinancialActionPayload;

  try {
    switch (payload.kind) {
      case 'credit_create':
        await processNewCredit(
          readNumber(payload, 'stationId'),
          readString(payload, 'customerName'),
          readNumber(payload, 'amount'),
          readString(payload, 'product'),
          readString(payload, 'notes'),
          {
            skipOfflineQueue: true,
            requestId: action.id
          }
        );
        return true;
      case 'credit_payment':
        await processPayment(
          readNumber(payload, 'stationId'),
          readNumber(payload, 'customerId'),
          readNumber(payload, 'amount'),
          readString(payload, 'method'),
          {
            skipOfflineQueue: true,
            requestId: action.id
          }
        );
        return true;
      case 'outflow_create':
        await processOutflow(
          readNumber(payload, 'stationId'),
          readString(payload, 'operatorId'),
          readNumber(payload, 'amount'),
          readString(payload, 'type'),
          readString(payload, 'description'),
          { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
        );
        return true;
      case 'extra_income_create':
        await processExtraIncome(
          readNumber(payload, 'stationId'),
          readString(payload, 'operatorId'),
          readNumber(payload, 'amount'),
          readString(payload, 'type'),
          readString(payload, 'description'),
          { skipOfflineQueue: true, createdAt: readString(payload, 'createdAt') }
        );
        return true;
      case 'invoice_request':
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
      default:
        logger.warn(
          'OfflineFinancialExecutors',
          'Unsupported financial action kind:',
          payload.kind
        );
        return false;
    }
  } catch (err) {
    logger.error('OfflineFinancialExecutors', 'Financial replay failed:', err);
    return false;
  }
}

registerExecutor('movement_create', executeFinancialAction);
