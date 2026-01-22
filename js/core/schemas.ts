/**
 * Zod Schemas for API Validation
 * Centralizes all data validation logic for security and type safety.
 */

import { z } from 'zod';

// ========== AUTH SCHEMAS ==========

export const LoginSchema = z.object({
    email: z.string().email('Email non valida').toLowerCase().trim(),
    password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
});

export const CreateUserSchema = z.object({
    email: z.string().email('Email non valida').toLowerCase().trim(),
    password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
    full_name: z.string().min(2, 'Nome troppo corto').max(100, 'Nome troppo lungo'),
    role: z.enum(['admin', 'super_admin', 'operator', 'accounting', 'billing']),
});

export const UpdateUserSchema = z.object({
    full_name: z.string().min(2, 'Nome troppo corto').max(100, 'Nome troppo lungo'),
    role: z.enum(['admin', 'super_admin', 'operator', 'accounting', 'billing']),
});

// ========== PRICE SCHEMAS ==========

export const PriceUpdateSchema = z.object({
    station_id: z.union([z.number(), z.string().transform(Number)]),
    prezzo_benzina: z.number().min(0, 'Prezzo non valido').max(10, 'Prezzo troppo alto'),
    prezzo_gasolio: z.number().min(0, 'Prezzo non valido').max(10, 'Prezzo troppo alto'),
    prezzo_gpl: z.number().min(0).max(10).nullable().optional(),
    prezzo_metano: z.number().min(0).max(10).nullable().optional(),
    data_validita: z.string().datetime().or(z.date()),
});

// ========== SHIFT SCHEMAS ==========

export const ShiftIdSchema = z.object({
    id: z.union([z.number(), z.string().transform(Number)]),
});

export const BulkExportSchema = z.object({
    stationId: z.string().nullable(),
    type: z.enum(['last_n', 'date_range']),
    limit: z.number().int().min(1).max(100).default(10),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
}).refine(
    (data) => data.type !== 'date_range' || (data.dateFrom && data.dateTo),
    { message: 'Date range requires both dateFrom and dateTo' }
);

// ========== STATION ASSIGNMENT SCHEMAS ==========

export const AssignStationSchema = z.object({
    user_id: z.string().uuid('ID utente non valido'),
    station_id: z.number().int().positive('ID stazione non valido'),
});

// ========== HELPER FUNCTIONS ==========

/**
 * Parse a value against a Zod schema and return either the parsed result or a human-readable error summary.
 *
 * @param schema - Zod schema used for validation
 * @param data - Value to validate
 * @returns `{ success: true, data }` with parsed `data` on success; `{ success: false, error }` with a concatenated error message on failure
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    // Format error messages
    const errorMessages = result.error.issues.map(e => e.message).join(', ');
    return { success: false, error: errorMessages };
}

/**
 * Validate input against a Zod schema and return the parsed value.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The input data to be validated and parsed
 * @returns The value parsed and typed according to `schema`
 * @throws ZodError if validation fails
 */
export function parse<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}

// Re-export Zod for convenience
export { z };