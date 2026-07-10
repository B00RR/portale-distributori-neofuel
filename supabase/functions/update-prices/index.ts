// Edge Function: update-prices
// Securely updates fuel prices
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { station_id, benzina, gasolio, validita } = await req.json();

    // 1. Validation
    if (!station_id || benzina < 0 || gasolio < 0) {
      throw new Error("Invalid input data");
    }

    // 2. Check Permissions (Already handled by RLS if we insert directly, but here we do server-side check)
    // The Edge Function runs with Service Role usually? No, we init with Auth Header, so it acts as User.
    // So RLS will apply. But using EF allows us to add extra logic (e.g. logging, notifications) later.
    // For now, we perform the insertion.

    // Calculate valid_from date
    let data_validita = new Date().toISOString();
    if (validita === 'prossima') {
      // Logic: valid from next shift?
      // For now, simpler: set to now + 1 hour or just tag it.
      // We'll stick to 'now' for immediate updates or specific timestamp passed from client.
      // If client passed a timestamp, use it.
    }

    const payload = {
      station_id: station_id,
      prezzo_benzina: Number(benzina),
      prezzo_gasolio: Number(gasolio),
      data_validita: data_validita
    };

    const { data, error } = await supabase
      .from('prezzi_distributore')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
