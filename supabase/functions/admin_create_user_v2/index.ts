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
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
// Internal domain used to keep a unique email in Supabase Auth without exposing it to users.
const INTERNAL_EMAIL_DOMAIN = 'neofuel.local';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function deriveEmail(username: string): string {
  return `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
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
      console.error(`[AdminCreateUser] Errore verifica permessi: ${authzError.message}`);
      return jsonResponse({ error: 'Impossibile verificare i permessi' }, 500);
    }
    if (isAdmin !== true) {
      console.warn('[AdminCreateUser] Accesso negato: chiamante non amministratore');
      return jsonResponse({ error: 'Permessi insufficienti' }, 403);
    }

    // INPUT VALIDATION (server-side, independent of the client Zod checks).
    const { username, password, full_name, role } = await req.json();

    if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
      return jsonResponse(
        { error: 'Username non valido. Usa 3-32 caratteri: lettere, numeri, . _ -' },
        400
      );
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

    const normalizedUsername = username.trim().toLowerCase();
    const internalEmail = deriveEmail(normalizedUsername);

    console.log(
      `[AdminCreateUser] Creazione utente autorizzata: ${normalizedUsername}, Ruolo: ${role}`
    );

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check whether the username (or its derived email) is already in use in Auth.
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error(`[AdminCreateUser] Errore list utenti: ${listError.message}`);
      return jsonResponse({ error: 'Errore interno durante la verifica username' }, 500);
    }

    const duplicate = existingUsers.users.find(
      u =>
        u.email?.toLowerCase() === internalEmail ||
        u.user_metadata?.username?.toLowerCase() === normalizedUsername
    );
    if (duplicate) {
      console.warn(`[AdminCreateUser] Username già in uso: ${normalizedUsername}`);
      return jsonResponse({ error: 'Username già in uso' }, 409);
    }

    const {
      data: { user },
      error: createError
    } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name: full_name || normalizedUsername,
        role
      }
    });

    if (createError) {
      console.error(
        `[AdminCreateUser] Errore Auth: ${createError.message} (Code: ${createError.code || 'n/a'})`
      );
      if (createError.message.includes('already registered') || createError.status === 422) {
        return jsonResponse(
          {
            error:
              "L'utente risulta già registrato. Scegli un altro username o contatta l'assistenza.",
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
