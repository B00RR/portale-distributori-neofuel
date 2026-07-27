-- Issue: #331
-- Description: Create schema_migrations tracking table and seed existing migrations
-- Downtime required: No
-- Backfill required: No

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  file_hash text NOT NULL,
  applied_by text
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_migrations_admin_all ON public.schema_migrations;
CREATE POLICY schema_migrations_admin_all ON public.schema_migrations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.schema_migrations (filename, file_hash, applied_by)
VALUES
  ('20260705_request_id_idempotency.sql', 'pending', 'system'),
  ('20260706_consolidate_rls_indexes_153.sql', 'pending', 'system'),
  ('20260706_revoke_anon_internal_functions_152.sql', 'pending', 'system'),
  ('20260707_align_processed_requests_columns.sql', 'pending', 'system'),
  ('20260707_fix_admin_rpc_type_mismatch_201.sql', 'pending', 'system'),
  ('20260707_fix_fk_type_mismatches_tank_readings_pistole.sql', 'pending', 'system'),
  ('20260707_harden_rls_tanks_tank_readings_users.sql', 'pending', 'system'),
  ('20260707_harden_submit_shift_closure.sql', 'pending', 'system'),
  ('20260708_harden_submit_shift_closure_auth.sql', 'pending', 'system'),
  ('20260710_restore_tank_pump_tank_index.sql', 'pending', 'system'),
  ('20260710_restrict_users_update_to_admin.sql', 'pending', 'system'),
  ('20260714_fix_submit_shift_closure_partial_flow.sql', 'pending', 'system'),
  ('20260714_preserve_pistol_closure_history.sql', 'pending', 'system'),
  ('20260714_restrict_calculation_rules.sql', 'pending', 'system'),
  ('20260715_make_shift_opening_atomic_254.sql', 'pending', 'system'),
  ('20260715_remove_anon_invoice_uploads_286.sql', 'pending', 'system'),
  ('20260715_restrict_internal_fn_execute_authenticated.sql', 'pending', 'system'),
  ('20260715_revoke_anon_public_execute_security_definer.sql', 'pending', 'system'),
  ('20260716_fix_submit_shift_closure_idempotency_293.sql', 'pending', 'system'),
  ('20260718_get_last_pump_counters_346.sql', 'pending', 'system'),
  ('20260721_server_side_closure_financial_calculation_321.sql', 'pending', 'system'),
  ('20260722_daily_reconciliation_rpc_357.sql', 'pending', 'system'),
  ('20260722_fix_admin_update_price_limit_320.sql', 'pending', 'system'),
  ('20260722_fix_crediti_rls_station_scoped_310.sql', 'pending', 'system'),
  ('20260722_fix_is_station_operator_ambiguous_column_359.sql', 'pending', 'system'),
  ('20260722_fix_movimenti_cassa_rls_311.sql', 'pending', 'system'),
  ('20260722_fix_open_shift_idempotency_fingerprint_323.sql', 'pending', 'system'),
  ('20260722_fix_redeem_voucher_station_check_322.sql', 'pending', 'system'),
  ('20260722_invoice_request_idempotency_329.sql', 'pending', 'system'),
  ('20260722_preview_mode_revert_closure_fase4.sql', 'pending', 'system'),
  ('20260722_revoke_excessive_privileges_316.sql', 'pending', 'system'),
  ('20260722_revoke_shifts_direct_update_312.sql', 'pending', 'system'),
  ('20260723_customer_refunds.sql', 'pending', 'system'),
  ('20260723_fix_admin_delete_closure_related_records.sql', 'pending', 'system'),
  ('20260724_daily_cutoff_2130_426.sql', 'pending', 'system'),
  ('20260724_invoice_isolation_313.sql', 'pending', 'system'),
  ('20260724_is_active_authoritative_307.sql', 'pending', 'system'),
  ('20260727_schema_migrations_tracking_331.sql', 'pending', 'system')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';
