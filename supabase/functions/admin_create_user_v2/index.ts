import 'jsr:@supabase/functions-js@2.110.7/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.110.7';
import {
  createSupabaseDependencies,
  type CallerClient,
  type ServiceClient
} from './dependencies.ts';
import { createAdminUserHandler } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonError(status: number): Response {
  return withCors(
    new Response(JSON.stringify({ error: 'Errore interno durante la creazione utente' }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  );
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !publishableKey || !serviceKey) {
  throw new Error('Missing required Supabase environment variables');
}

const callerClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const serviceClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const dependencies = createSupabaseDependencies(
  callerClient as unknown as CallerClient,
  serviceClient as unknown as ServiceClient
);
const handleRequest = createAdminUserHandler(dependencies, {
  maintenanceMode: Deno.env.get('ADMIN_CREATE_USER_MAINTENANCE') === 'true'
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return withCors(
      new Response(JSON.stringify({ error: 'Metodo non consentito' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }

  try {
    return withCors(await handleRequest(request));
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'admin_create_user_request_failed',
        error_type: error instanceof Error ? error.name : 'UnknownError'
      })
    );
    return jsonError(500);
  }
});
