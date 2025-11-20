// ==========================================
// CONFIGURATION
// ==========================================

// IMPORTANT: These are PUBLIC keys (anon key) that are safe to expose in client-side code.
// They are used with Row Level Security (RLS) policies on Supabase.
// For production, consider using environment variables.

export const SUPABASE_URL = "https://ahlmgafaurossyghimxc.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobG1nYWZhdXJvc3N5Z2hpbXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzU3OTIsImV4cCI6MjA3NzE1MTc5Mn0.f2PIG3qksNyz-Z3RKBjZ4OdV-suB8kUmjyPhrmrA6G4";

// NOTE: The anon key above is PUBLIC and safe to commit to GitHub.
// It only works with RLS policies enabled on your Supabase tables.
// Never commit service_role keys or private API keys!
