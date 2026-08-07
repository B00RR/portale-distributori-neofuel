-- =============================================================================
-- Issue #345 — [Liste admin] Paginare e limitare crediti, fatture, voucher e collezioni
--
-- Cosa fa:
--   Aggiunge l'RPC `get_voucher_batch_stats()` che calcola lato server le
--   statistiche per lotto (total/redeemed/active/void count e importi) e le
--   statistiche globali dei voucher. Sostituisce la scansione client-side di
--   TUTTI i voucher (`select('batch_id, status, amount')` senza LIMIT) che
--   causava caricamento lento della dashboard voucher.
--
-- Downtime: nessuno. Backfill: nessuno.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_voucher_batch_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'batches', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          v.batch_id,
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE v.status = 'redeemed') AS redeemed_count,
          COUNT(*) FILTER (WHERE v.status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE v.status = 'void') AS void_count,
          COALESCE(SUM(v.amount), 0) AS total_amount,
          COALESCE(SUM(v.amount) FILTER (WHERE v.status = 'redeemed'), 0) AS redeemed_amount
        FROM public.vouchers v
        WHERE v.batch_id IS NOT NULL
        GROUP BY v.batch_id
      ) t
    ),
    'global', (
      SELECT json_build_object(
        'total_gen', COUNT(*),
        'total_redeemed', COUNT(*) FILTER (WHERE status = 'redeemed'),
        'total_active', COUNT(*) FILTER (WHERE status = 'active'),
        'redeemed_value', COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed'), 0),
        'circulating_value', COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)
      )
      FROM public.vouchers
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_voucher_batch_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_voucher_batch_stats() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
