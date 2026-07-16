/**
 * Zod Schemas for API Validation
 * Centralizes all data validation logic for security and type safety.
 */

import { z } from 'zod';

import { USER_ROLES } from '../shared/roles.js';

// ========== AUTH SCHEMAS ==========

export const LoginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username troppo corto')
    .max(32, 'Username troppo lungo')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username non valido: usa solo lettere, numeri, . _ -')
    .toLowerCase()
    .trim(),
  password: z.string().min(6, 'Password deve avere almeno 6 caratteri')
});

export const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username troppo corto')
    .max(32, 'Username troppo lungo')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username non valido: usa solo lettere, numeri, . _ -')
    .toLowerCase()
    .trim(),
  password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
  full_name: z.string().min(2, 'Nome troppo corto').max(100, 'Nome troppo lungo'),
  role: z.enum(USER_ROLES)
});

export const UpdateUserSchema = z.object({
  full_name: z.string().min(2, 'Nome troppo corto').max(100, 'Nome troppo lungo'),
  role: z.enum(USER_ROLES)
});

// ========== PRICE SCHEMAS ==========

const NumericIdSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  z.number().int('ID non valido').positive('ID non valido').finite('ID non valido')
);

const PriceValueSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  z.number().min(0, 'Prezzo non valido').max(10, 'Prezzo troppo alto').finite('Prezzo non valido')
);

export const PriceUpdateSchema = z.object({
  station_id: NumericIdSchema,
  prezzo_benzina: PriceValueSchema,
  prezzo_gasolio: PriceValueSchema,
  prezzo_gpl: PriceValueSchema.nullable().optional(),
  prezzo_metano: PriceValueSchema.nullable().optional(),
  data_validita: z.string().datetime().or(z.date())
});

// ========== SHIFT SCHEMAS ==========

export const ShiftIdSchema = z.object({
  id: NumericIdSchema
});

export const BulkExportSchema = z
  .object({
    stationId: z.string().nullable(),
    type: z.enum(['last_n', 'date_range']),
    limit: z.number().int().min(1).max(100).default(10),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional()
  })
  .refine(data => data.type !== 'date_range' || (data.dateFrom && data.dateTo), {
    message: 'Date range requires both dateFrom and dateTo'
  });

// ========== STATION ASSIGNMENT SCHEMAS ==========

export const AssignStationSchema = z.object({
  user_id: z.string().uuid('ID utente non valido'),
  station_id: z.number().int().positive('ID stazione non valido')
});

// ========== HELPER FUNCTIONS ==========

/**
 * Safely parse and validate data with a Zod schema.
 * Returns { success: true, data } or { success: false, error }
 */
export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Format error messages
  const errorMessages = result.error.issues.map(e => e.message).join(', ');
  return { success: false, error: errorMessages };
}

/**
 * Parse and validate, throwing on failure (for use in try/catch blocks)
 */
export function parse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Re-export Zod for convenience
export { z };
