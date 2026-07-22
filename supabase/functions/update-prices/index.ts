// Edge Function: update-prices
// Securely inserts a new fuel price row. Runs as the calling user (the client
// is initialised with the caller's Authorization header) so Row-Level Security
// on prezzi_distributore governs who may write.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

function isValidPrice(value: unknown, maxPrice: number): value is number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= maxPrice;
}

// Legge il tetto massimo prezzo dalla configurazione della stazione
async function getMaxPrice(supabase: SupabaseClient, stationId: number): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('business_rules')
      .select('max_price_limit')
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) return 2.5;
    return data?.max_price_limit ?? 2.5; // default 2.5 €/L
  } catch {
    return 2.5;
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Metodo non consentito' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Autenticazione richiesta' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { station_id, benzina, gasolio, validita } = await req.json();

    // Strict input validation. The previous `benzina < 0` check silently passed
    // non-numeric values (e.g. "abc" < 0 is false), so validate types explicitly.
    const stationIdNum = Number(station_id);
    if (!Number.isInteger(stationIdNum) || stationIdNum <= 0) {
      return jsonResponse({ success: false, error: 'station_id non valido' }, 400);
    }
    const maxPrice = await getMaxPrice(supabase, stationIdNum);
    if (!isValidPrice(benzina, maxPrice) || !isValidPrice(gasolio, maxPrice)) {
      return jsonResponse({ success: false, error: 'Prezzi non validi' }, 400);
    }

    // Effective date: next midnight when the client asked for the next day,
    // otherwise immediate. (The previous version had dead branches here.)
    let dataValidita = new Date().toISOString();
    if (validita === 'next_day' || validita === 'prossima') {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      dataValidita = next.toISOString();
    }

    const payload = {
      station_id: stationIdNum,
      prezzo_benzina: Number(benzina),
      prezzo_gasolio: Number(gasolio),
      data_validita: dataValidita
    };

    const { data, error } = await supabase
      .from('prezzi_distributore')
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return jsonResponse({ success: true, data }, 200);
  } catch (error: any) {
    const message = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    return jsonResponse({ success: false, error: message }, 500);
  }
});
