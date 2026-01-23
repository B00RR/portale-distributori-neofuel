// ==========================================
// CONFIGURATION
// ==========================================

// Security: Credentials are loaded from environment variables.
// In development, create a .env file (see .env.example).
// In production, configure environment variables in your hosting platform.

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validation: Fail fast if credentials are missing
console.log('[CONFIG] Loading Supabase configuration...');
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
        '[CONFIG] Missing Supabase credentials. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env'
    );
}

