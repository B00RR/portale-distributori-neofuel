import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo non consentito' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Autenticazione richiesta' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // AUTHORIZATION: verify caller is an admin BEFORE doing any privileged work.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: isAdmin, error: authzError } = await callerClient.rpc('is_admin');
    if (authzError) {
      console.error(`[AdminResetPassword] Errore verifica permessi: ${authzError.message}`);
      return jsonResponse({ error: 'Impossibile verificare i permessi' }, 500);
    }
    if (isAdmin !== true) {
      console.warn('[AdminResetPassword] Accesso negato: chiamante non amministratore');
      return jsonResponse({ error: 'Permessi insufficienti' }, 403);
    }

    const { user_id, password } = await req.json();

    if (typeof user_id !== 'number' || user_id <= 0) {
      return jsonResponse({ error: 'ID utente non valido' }, 400);
    }
    if (typeof password !== 'string' || password.length < 6) {
      return jsonResponse({ error: 'La password deve avere almeno 6 caratteri' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Resolve the auth UUID from public.users.created_by_auth.
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('created_by_auth')
      .eq('user_id', user_id)
      .single();

    if (dbError || !dbUser?.created_by_auth) {
      console.error(`[AdminResetPassword] Utente non trovato: ${dbError?.message || 'no uuid'}`);
      return jsonResponse({ error: 'Utente non trovato' }, 404);
    }

    const authId = dbUser.created_by_auth;

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      password
    });

    if (updateError) {
      console.error(`[AdminResetPassword] Errore aggiornamento: ${updateError.message}`);
      return jsonResponse(
        { error: "Errore durante l'aggiornamento della password.", details: updateError.message },
        500
      );
    }

    console.log(`[AdminResetPassword] Password reimpostata per user_id ${user_id}`);
    return jsonResponse({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AdminResetPassword] Errore Critico: ${message}`);
    return jsonResponse(
      {
        error: 'Errore interno durante il reset della password.',
        details: message
      },
      500
    );
  }
});
