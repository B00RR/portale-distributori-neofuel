import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Roles a new user may be assigned. Must stay in sync with CreateUserSchema
// in js/core/schemas.ts (the client-side Zod enum).
const ALLOWED_ROLES = ['admin', 'super_admin', 'full_admin', 'operator', 'accounting', 'billing'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // AUTHORIZATION: verify the caller is an admin BEFORE doing any privileged
    // work. A user-scoped client carries the caller's JWT, so is_admin() runs
    // as that user (it resolves auth.uid() -> users.role server-side). Without
    // this check any authenticated user could create an admin account.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: isAdmin, error: authzError } = await callerClient.rpc('is_admin');
    if (authzError) {
      console.error(`[AdminCreateUser] Errore verifica permessi: ${authzError.message}`);
      return jsonResponse({ error: 'Impossibile verificare i permessi' }, 500);
    }
    if (isAdmin !== true) {
      console.warn('[AdminCreateUser] Accesso negato: chiamante non amministratore');
      return jsonResponse({ error: 'Permessi insufficienti' }, 403);
    }

    // INPUT VALIDATION (server-side, independent of the client Zod checks).
    const { email, password, full_name, role } = await req.json();

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return jsonResponse({ error: 'Email non valida' }, 400);
    }
    if (typeof password !== 'string' || password.length < 6) {
      return jsonResponse({ error: 'La password deve avere almeno 6 caratteri' }, 400);
    }
    if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: 'Ruolo non valido' }, 400);
    }
    if (full_name !== undefined && typeof full_name !== 'string') {
      return jsonResponse({ error: 'Nome non valido' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(
      `[AdminCreateUser] Creazione utente autorizzata: ${normalizedEmail}, Ruolo: ${role}`
    );

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const {
      data: { user },
      error: createError
    } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, role }
    });

    if (createError) {
      console.error(
        `[AdminCreateUser] Errore Auth: ${createError.message} (Code: ${createError.code || 'n/a'})`
      );
      if (createError.message.includes('already registered') || createError.status === 422) {
        return jsonResponse(
          {
            error:
              "L'utente risulta già registrato nel sistema di autenticazione. Verifica che l'email sia corretta o contatta l'assistenza.",
            details: createError.message
          },
          400
        );
      }
      throw createError;
    }

    console.log(
      `[AdminCreateUser] Successo! UUID: ${user?.id}. Il trigger handle_new_user popola public.users.`
    );

    return jsonResponse({ success: true, user }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AdminCreateUser] Errore Critico: ${message}`);
    return jsonResponse(
      {
        error: "Errore interno durante la creazione dell'utente.",
        details: message
      },
      500
    );
  }
});
