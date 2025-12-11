/**
 * js/shared/validators.js
 * Libreria di validazione condivisa.
 */

export const Validators = {
    /**
     * Verifica che il valore non sia vuoto (null, undefined o stringa vuota).
     */
    required(value) {
        if (value === null || value === undefined) return 'Campo obbligatorio';
        if (typeof value === 'string' && value.trim() === '') return 'Campo obbligatorio';
        return true;
    },

    /**
     * Verifica formato email.
     */
    email(value) {
        if (!value) return true; // Se opzionale, passa. Se required, usare anche required()
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(value) || 'Email non valida';
    },

    /**
     * Verifica lunghezza minima stringa.
     */
    minLength(min) {
        return (value) => {
            if (!value) return true;
            return value.length >= min || `Minimo ${min} caratteri`;
        };
    },

    /**
     * Verifica che sia un numero valido.
     */
    number(value) {
        if (value === '' || value === null || value === undefined) return true;
        return !isNaN(parseFloat(value)) && isFinite(value) || 'Deve essere un numero';
    },

    /**
     * Verifica valore minimo (numerico).
     */
    minValue(min) {
        return (value) => {
            if (value === '' || value === null || value === undefined) return true;
            const num = parseFloat(value);
            return num >= min || `Deve essere almeno ${min}`;
        };
    },

    /**
     * Verifica valore massimo (numerico).
     */
    maxValue(max) {
        return (value) => {
            if (value === '' || value === null || value === undefined) return true;
            const num = parseFloat(value);
            return num <= max || `Non può superare ${max}`;
        };
    }
};

/**
 * Valida un oggetto di dati (es. da FormData) contro uno schema di regole.
 * @param {Object} data - Oggetto chiave-valore (es. { email: '...', password: '...' })
 * @param {Object} schema - Oggetto dove le chiavi corrispondono a data e i valori sono array di validatori.
 * @returns {Object|null} - Null se valido, altrimenti oggetto con errori { field: 'message' }.
 * 
 * Esempio schema:
 * {
 *   email: [Validators.required, Validators.email],
 *   password: [Validators.required, Validators.minLength(6)]
 * }
 */
export function validateForm(data, schema) {
    const errors = {};
    let isValid = true;

    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        for (const rule of rules) {
            const result = rule(value);
            if (result !== true) {
                errors[field] = result;
                isValid = false;
                break; // Stop alla prima regola fallita per questo campo
            }
        }
    }

    return isValid ? null : errors;
}

/**
 * Mostra errori nei campi input corrispondenti.
 * Presuppone che ogni input abbia name="field" e ci sia un .error-msg vicino o che vogliamo usare Toast.
 * Per ora, restituisce il primo errore come stringa per Toast, o potremmo estenderlo per UI inline.
 */
export function formatErrorMessages(errors) {
    if (!errors) return '';
    return Object.values(errors).join('\n');
}
