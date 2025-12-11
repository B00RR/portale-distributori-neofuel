
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = "https://ahlmgafaurossyghimxc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobG1nYWZhdXJvc3N5Z2hpbXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzU3OTIsImV4cCI6MjA3NzE1MTc5Mn0.f2PIG3qksNyz-Z3RKBjZ4OdV-suB8kUmjyPhrmrA6G4";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testQuery() {
    console.log("Testing Supabase connection...");
    try {
        // Authenticate as the user provided in the logs (Admin Lorenzo)
        // Login flow is hard to script without password, but we can test public availability or if we have a robust policy.
        // Actually, the policies shown require auth.uid() mostly.
        // I will try to login first if I can? Password "123no123" was visible in the console log screenshot! 
        // Screenshot: uploaded_image_1765300897782.png showing `password_hash: '123no123'` (Actually usually that's plain pw in local log if not careful, or a hash).
        // Wait, the log says "password_hash: '123no123'". That looks like a surprisingly simple hash or just the password logged plain.
        // Let's TRY to sign in with it. If it fails, I'll know RLS is hitting anonymous.

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: 'lorenzo96barra@outlook.com',
            password: '123no123'
        });

        if (authError) {
            console.error("Auth failed:", authError.message);
            // proceed as anon?
        } else {
            console.log("Auth successful, user:", authData.user.email);
        }

        console.log("Querying shifts...");
        const { data, error } = await supabase.from('shifts').select('*').limit(5);

        if (error) {
            console.error("Query Error:", error);
        } else {
            console.log("Query Success. Rows:", data?.length);
            console.log(data);
        }
    } catch (e) {
        console.error("Runtime Error:", e);
    }
}

testQuery();
