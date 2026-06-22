/**
 * js/shared/validators.ts
 * Shared validation library.
 */

export type ValidatorFunction = (value: unknown) => true | string;

export const Validators = {
  /**
     * Checks if value is not empty (null, undefined, or empty string).
     */
  required(value: unknown): true | string {
    if (value === null || value === undefined) { return 'Campo obbligatorio'; }
    if (typeof value === 'string' && value.trim() === '') { return 'Campo obbligatorio'; }
    return true;
  },

  /**
     * Checks email format.
     */
  email(value: unknown): true | string {
    if (!value) { return true; } // Optional if not required
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(value)) || 'Email non valida';
  },

  /**
     * Checks minimum string length.
     */
  minLength(min: number): ValidatorFunction {
    return (value: unknown) => {
      if (!value) { return true; }
      return String(value).length >= min || `Minimo ${min} caratteri`;
    };
  },

  /**
     * Checks if it is a valid number.
     */
  number(value: unknown): true | string {
    if (value === '' || value === null || value === undefined) { return true; }
    return (!isNaN(parseFloat(String(value))) && isFinite(Number(value))) || 'Deve essere un numero';
  },

  /**
     * Checks minimum numeric value.
     */
  minValue(min: number): ValidatorFunction {
    return (value: unknown) => {
      if (value === '' || value === null || value === undefined) { return true; }
      const num = parseFloat(String(value));
      return num >= min || `Deve essere almeno ${min}`;
    };
  },

  /**
     * Checks maximum numeric value.
     */
  maxValue(max: number): ValidatorFunction {
    return (value: unknown) => {
      if (value === '' || value === null || value === undefined) { return true; }
      const num = parseFloat(String(value));
      return num <= max || `Non può superare ${max}`;
    };
  }
};

/**
 * Validates a data object against a schema.
 */
export function validateForm(data: Record<string, unknown>, schema: Record<string, ValidatorFunction[]>): Record<string, string> | null {
  const errors: Record<string, string> = {};
  let isValid = true;

  for (const [field, rules] of Object.entries(schema)) {
    // eslint-disable-next-line security/detect-object-injection -- field is an own key from the developer-defined schema, used to read the matching input value
    const value = data[field];
    for (const rule of rules) {
      const result = rule(value);
      if (result !== true) {
        // eslint-disable-next-line security/detect-object-injection -- field is an own key from the developer-defined schema, written to a fresh local errors record
        errors[field] = result;
        isValid = false;
        break; // Stop at first failed rule for this field
      }
    }
  }

  return isValid ? null : errors;
}

/**
 * Formats errors for UI/Toast.
 */
export function formatErrorMessages(errors: Record<string, string> | null): string {
  if (!errors) { return ''; }
  return Object.values(errors).join('\n');
}
