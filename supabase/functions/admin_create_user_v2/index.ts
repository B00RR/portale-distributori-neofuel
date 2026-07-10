import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, full_name, role } = await req.json();
    console.log(`[AdminCreateUser] Tentativo creazione utente: ${email}, Ruolo: ${role}`);

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: "Email, password e ruolo sono obbligatori" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Verifica se esiste già in Auth
    // Nota: Non possiamo listare facilmente, ma proviamo a creare e gestiamo l'errore specifico.

    console.log(`[AdminCreateUser] Chiamata auth.admin.createUser...`);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role }
    });

    if (authError) {
      console.error(`[AdminCreateUser] Errore Auth: ${authError.message} (Code: ${authError.code || 'n/a'})`);

      // Se l'utente esiste già in auth, proviamo a vedere se manca in public.users
      if (authError.message.includes("already registered") || authError.status === 422) {
         return new Response(JSON.stringify({
           error: "L'utente risulta già registrato nel sistema di autenticazione. Verifica che l'email sia corretta o contatta l'assistenza.",
           details: authError.message
         }), {
          status: 400, // Usiamo 400 per errori utente
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      throw authError; // Altri errori vanno al catch (500)
    }

    console.log(`[AdminCreateUser] Successo Auth! UUID: ${user.id}. Il trigger handle_new_user dovrebbe aver popolato public.users.`);

    return new Response(JSON.stringify({ success: true, user: user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`[AdminCreateUser] Errore Critico: ${error.message}`);
    return new Response(JSON.stringify({
      error: "Errore interno durante la creazione dell'utente.",
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
