
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // Use Service Role Key if possible for admin actions, but Anon might work for signUp if open

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupUsers() {
    console.log('Setting up E2E users...');

    // 1. Operator
    const operatorEmail = 'test_operator@neofuel.it';
    const password = '123na123';

    console.log(`Checking/Creating ${operatorEmail}...`);

    // Attempt login first
    let { data, error } = await supabase.auth.signInWithPassword({
        email: operatorEmail,
        password: password
    });

    let userId;

    if (error) {
        console.log('Login failed, creating user...');
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: operatorEmail,
            password: password,
            options: {
                data: {
                    full_name: 'Test Operator',
                    role: 'operator'
                }
            }
        });

        if (signUpError) {
            console.error('SignUp failed:', signUpError);
        } else {
            console.log('User created:', signUpData.user?.id);
            userId = signUpData.user?.id;
        }
    } else {
        console.log('User already exists:', data.user.id);
        userId = data.user.id;
    }

    if (userId) {
        console.log(`Verifying public.users for ${userId}...`);
        // We can't insert into public.users using Client IF RLS blocks it.
        // But we can output the SQL needed?
        // Or if we have a robust backend setup, it triggers automatically?
        // Let's print the needed SQL command for me to run via MCP.

        console.log(`\n\nREQUIRED SQL ACTION:`);
        console.log(`INSERT INTO public.users (user_id, email, role, full_name, created_by_auth, is_active, username)
        VALUES (
            (SELECT COALESCE(MAX(user_id), 0) + 1 FROM public.users),
            '${operatorEmail}',
            'operator',
            'Test Operator',
            '${userId}',
            true,
            'test_operator'
        ) ON CONFLICT (email) DO UPDATE SET created_by_auth = '${userId}';`);
    }

}

setupUsers();
