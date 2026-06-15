// @ts-ignore
import { z } from './zod-client';

/**
 * Business Rules Schema
 * Defines parameters for business logic, validation, and alerts.
 */
export const BusinessRulesSchema = z.object({
  // CASH & ACCOUNTING
  cash_error_threshold: z.number().min(0).max(1000).default(10), // Tolerance in € for cash discrepancies

  // PRICING
  max_price_limit: z.number().min(0).max(5).default(2.5), // Safety ceiling for fuel prices (€/L)

  // INVENTORY
  fuel_reserve_alert_liters: z.number().min(0).max(50000).default(2000), // Alert threshold for tank stock

  // OPERATIONS
  force_close_hours_threshold: z.number().min(1).max(168).default(24), // Hours before a shift is flagged as "stale"

  // NOTIFICATIONS
  notifications_enabled: z.boolean().default(true),
  critical_discrepancy_alert: z.number().min(0).max(5000).default(50), // Send alert if error > X

  // SYSTEM METADATA
  last_updated_by: z.string().optional(),
  updated_at: z.string().datetime().optional()
});

export type BusinessRules = z.infer<typeof BusinessRulesSchema>;

export const DEFAULT_BUSINESS_RULES: BusinessRules = BusinessRulesSchema.parse({});
