import { supabase } from './api.js';
import { BusinessRulesSchema, DEFAULT_BUSINESS_RULES, type BusinessRules } from './business-rules-schema.js';
import { Toast } from '../ui/toast.js';

const BUCKET_NAME = 'system';
const FILE_PATH = 'configs/business_rules.json';

let cachedRules: BusinessRules | null = null;

/**
 * Business Logic Manager
 * Syncs JSON config with Supabase Storage
 */
export const BusinessLogicManager = {
    /**
     * Load settings from Storage or return defaults
     */
    async loadRules(): Promise<BusinessRules> {
        if (cachedRules) return cachedRules;

        try {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(FILE_PATH);

            if (error) {
                // If not found, return defaults and try to seed
                if (error.message.includes('Object not found') || error.status === 404) {
                    console.info('[BusinessLogic] Config not found, using defaults.');
                    return DEFAULT_BUSINESS_RULES;
                }
                throw error;
            }

            const jsonText = await data.text();
            const parsed = JSON.parse(jsonText);

            // Validate with Zod
            const validated = BusinessRulesSchema.parse(parsed);
            cachedRules = validated;
            return validated;
        } catch (err) {
            console.error('[BusinessLogic] Load failed:', err);
            return DEFAULT_BUSINESS_RULES;
        }
    },

    /**
     * Save settings to Storage
     */
    async saveRules(rules: Partial<BusinessRules>): Promise<void> {
        try {
            const current = await this.loadRules();
            const updated = {
                ...current,
                ...rules,
                updated_at: new Date().toISOString()
            };

            // Validate before saving
            const validated = BusinessRulesSchema.parse(updated);

            const blob = new Blob([JSON.stringify(validated, null, 2)], { type: 'application/json' });
            const file = new File([blob], 'business_rules.json');

            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(FILE_PATH, file, {
                    upsert: true,
                    contentType: 'application/json'
                });

            if (error) throw error;

            cachedRules = validated;
            Toast.show('Regole di business aggiornate con successo', 'success');
        } catch (err: any) {
            console.error('[BusinessLogic] Save failed:', err);
            Toast.show('Errore nel salvataggio: ' + (err.message || 'Errore sconosciuto'), 'error');
            throw err;
        }
    }
};
