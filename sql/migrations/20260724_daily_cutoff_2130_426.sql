BEGIN;

-- Migration: Daily Cutoff at 21:30 Europe/Rome and Operator Opening via Chiusura (#426)
--
-- Issue: #426
--
-- Description:
-- 1. Introduces public.finalize_daily_partial_shifts() to promote active partial shift closures
--    to final closed shifts at 21:30 Europe/Rome. Financial amounts, counters, and transactions
--    are left untouched; only metadata is promoted.
-- 2. Introduces public.finalize_daily_partial_shifts_cron_guard() to handle CET/CEST time zones
--    gracefully and idempotently.
-- 3. Enables pg_cron extension explicitly and configures cron jobs at 19:30 UTC and 20:30 UTC calling the guard function.
-- 4. Ensures public.shifts is included in supabase_realtime publication.
-- 5. Updates submit_shift_closure_v2 so non-admin users cannot bypass partial closure policy while preserving full live RPC definition.

-- ============================================================================
-- 1. Atomic Finalization Function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_daily_partial_shifts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_ids bigint[];
    v_now_utc timestamptz := now();
    v_now_iso text := to_char(v_now_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
    WITH target_shifts AS (
        SELECT id
        FROM public.shifts
        WHERE closed_at IS NULL
          AND status = 'partial'
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.shifts s
        SET status = 'closed',
            closed_at = v_now_utc,
            updated_at = v_now_utc,
            closing_data = jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            COALESCE(s.closing_data, '{}'::jsonb),
                            '{closure_stage}',
                            '"final"'
                        ),
                        '{is_final}',
                        'true'
                    ),
                    '{auto_finalized_at}',
                    to_jsonb(v_now_iso)
                ),
                '{auto_finalized_reason}',
                '"daily_cutoff_21_30"'
            )
        FROM target_shifts t
        WHERE s.id = t.id
        RETURNING s.id
    )
    SELECT array_agg(id) FROM updated INTO v_updated_ids;

    RETURN jsonb_build_object(
        'success', true,
        'finalized_count', COALESCE(array_length(v_updated_ids, 1), 0),
        'finalized_shift_ids', COALESCE(v_updated_ids, ARRAY[]::bigint[])
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_daily_partial_shifts() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Cron Guard Function (Handles CET / CEST 21:30 local time)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_daily_partial_shifts_cron_guard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_local_time text;
BEGIN
    v_local_time := to_char(timezone('Europe/Rome', now()), 'HH24:MI');

    IF v_local_time = '21:30' THEN
        RETURN public.finalize_daily_partial_shifts();
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'finalized_count', 0,
            'skipped', true,
            'reason', 'not_21_30_local_time',
            'current_local_time', v_local_time
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_daily_partial_shifts_cron_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Explicit pg_cron Extension & Idempotent Scheduling
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_cutoff_2130_cest') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily_cutoff_2130_cest';
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_cutoff_2130_cet') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily_cutoff_2130_cet';
    END IF;

    PERFORM cron.schedule(
        'daily_cutoff_2130_cest',
        '30 19 * * *',
        'SELECT public.finalize_daily_partial_shifts_cron_guard()'
    );

    PERFORM cron.schedule(
        'daily_cutoff_2130_cet',
        '30 20 * * *',
        'SELECT public.finalize_daily_partial_shifts_cron_guard()'
    );
END $$;

-- ============================================================================
-- 4. Idempotent Realtime Publication Addition for public.shifts
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'shifts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
    END IF;
END $$;

-- ============================================================================
-- 5. Complete submit_shift_closure_v2 RPC with Non-Admin Partial Forcing
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_shift_closure_v2(
    p_shift_id bigint,
    p_station_id integer,
    p_request_id text DEFAULT NULL::text,
    p_final_counters jsonb DEFAULT NULL::jsonb,
    p_tank_usage jsonb DEFAULT NULL::jsonb,
    p_self_cash_in numeric DEFAULT 0,
    p_self_cash_out numeric DEFAULT 0,
    p_self_pos numeric DEFAULT 0,
    p_self_fleet numeric DEFAULT 0,
    p_self_manager numeric DEFAULT 0,
    p_operator_cash numeric DEFAULT 0,
    p_operator_pos numeric DEFAULT 0,
    p_operator_fleet numeric DEFAULT 0,
    p_closure_type text DEFAULT 'partial'::text,
    p_preview boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_shift public.shifts%ROWTYPE;
    v_operator_id integer;
    v_effective_closure_type text;
    v_is_final boolean;
    v_payload jsonb;
    v_fingerprint text;
    v_existing jsonb;
    v_fingerprint_mismatch boolean;
    v_request_inserted boolean;
    v_result jsonb;

    -- counters
    v_counter_key text;
    v_counter_value text;
    v_pistol_id bigint;
    v_final numeric;
    v_opened numeric;
    v_previous_closing numeric;
    v_current_pistol numeric;
    v_minimum_counter numeric;

    -- tank usage
    v_usage jsonb;
    v_usage_pump_id bigint;
    v_usage_tank_id bigint;
    v_usage_liters numeric;
    v_usage_ratio numeric;
    v_usage_mode text;

    -- financial calculation
    v_sp record;
    v_product text;
    v_price numeric;
    v_liters numeric;
    v_total_liters numeric := 0;
    v_fuel_revenue numeric := 0;
    v_extra_revenue numeric := 0;
    v_total_sold numeric;
    v_electronic numeric := 0;
    v_vouchers numeric := 0;
    v_points numeric := 0;
    v_new_credits numeric := 0;
    v_outflows numeric := 0;
    v_credit_payments_cash numeric := 0;
    v_credit_payments_pos numeric := 0;
    v_credit_payments_uta numeric := 0;
    v_expected_cash numeric;
    v_discrepancy numeric;
    v_non_erogato numeric;
    v_extra_cash numeric := 0;
    v_extra_pos numeric := 0;
    v_extra_uta numeric := 0;

    -- audit snapshot
    v_snapshot jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- In preview mode we use a shared lock (FOR SHARE) to avoid blocking
    -- concurrent writes. In commit mode we need FOR UPDATE.
    IF p_preview THEN
        SELECT *
        INTO v_shift
        FROM public.shifts
        WHERE id = p_shift_id
          AND station_id = p_station_id
        FOR SHARE;
    ELSE
        SELECT *
        INTO v_shift
        FROM public.shifts
        WHERE id = p_shift_id
          AND station_id = p_station_id
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Turno non trovato',
            'message', 'Turno non trovato'
        );
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Determine effective closure type: non-admins are forced to 'partial', admins can select 'partial' or 'final'
    IF public.is_admin() THEN
        v_effective_closure_type := CASE WHEN lower(trim(COALESCE(p_closure_type, 'partial'))) = 'final' THEN 'final' ELSE 'partial' END;
    ELSE
        v_effective_closure_type := 'partial';
    END IF;
    v_is_final := (v_effective_closure_type = 'final');

    -- Build the canonical idempotency payload: every input that affects state.
    v_payload := jsonb_build_object(
        'shift_id', p_shift_id,
        'station_id', p_station_id,
        'final_counters', COALESCE(p_final_counters, '{}'::jsonb),
        'tank_usage', COALESCE(p_tank_usage, '[]'::jsonb),
        'self_cash_in', p_self_cash_in,
        'self_cash_out', p_self_cash_out,
        'self_pos', p_self_pos,
        'self_fleet', p_self_fleet,
        'self_manager', p_self_manager,
        'operator_cash', p_operator_cash,
        'operator_pos', p_operator_pos,
        'operator_fleet', p_operator_fleet,
        'closure_type', v_effective_closure_type
    );

    -- Fingerprint: JSONB text normalization.
    v_fingerprint := md5(v_payload::text);

    -- Skip idempotency check in preview mode.
    IF NOT p_preview AND NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT existing_response, fingerprint_mismatch
        INTO v_existing, v_fingerprint_mismatch
        FROM public.check_request_idempotency(
            trim(p_request_id),
            'submit_shift_closure_v2',
            v_payload,
            v_fingerprint
        );

        IF FOUND THEN
            IF v_fingerprint_mismatch THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Request ID gia usato con parametri diversi'
                );
            END IF;
            RETURN COALESCE(
                v_existing,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
            );
        END IF;
    END IF;

    IF v_shift.closed_at IS NOT NULL OR v_shift.status NOT IN ('open', 'partial') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Turno gia chiuso o non finalizzabile',
            'message', 'Turno gia chiuso o non finalizzabile'
        );
    END IF;

    IF p_final_counters IS NOT NULL AND jsonb_typeof(p_final_counters) <> 'object' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'I contatori devono essere un oggetto JSON',
            'message', 'I contatori devono essere un oggetto JSON'
        );
    END IF;

    -- Final closure requires all shift pistols.
    IF v_is_final AND EXISTS (
        SELECT 1
        FROM public.shift_pistols sp
        WHERE sp.shift_id = p_shift_id
          AND NOT (COALESCE(p_final_counters, '{}'::jsonb) ? sp.pistola_id::text)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La chiusura finale richiede tutti i contatori del turno',
            'message', 'La chiusura finale richiede tutti i contatori del turno'
        );
    END IF;

    -- Compute revenue across ALL shift pistols.
    -- In preview mode use FOR SHARE to avoid blocking.
    FOR v_sp IN
        SELECT
            sp.pistola_id,
            sp.opened_at_counter,
            COALESCE(sp.closed_at_counter, sp.opened_at_counter) AS previous_closing,
            p.tipo_carburante,
            p.numero_litri AS current_pistol
        FROM public.shift_pistols sp
        JOIN public.pistole p ON p.id = sp.pistola_id
        WHERE sp.shift_id = p_shift_id
        FOR SHARE OF sp, p
    LOOP
        IF p_final_counters IS NOT NULL
           AND jsonb_typeof(p_final_counters) = 'object'
           AND p_final_counters ? v_sp.pistola_id::text
           AND NULLIF(trim(p_final_counters ->> v_sp.pistola_id::text), '') IS NOT NULL
        THEN
            BEGIN
                v_final := (p_final_counters ->> v_sp.pistola_id::text)::numeric;
            EXCEPTION
                WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', format('Valore contatore non valido per pistola %s', v_sp.pistola_id),
                        'message', format('Valore contatore non valido per pistola %s', v_sp.pistola_id)
                    );
            END;
        ELSE
            v_final := GREATEST(
                v_sp.opened_at_counter,
                v_sp.previous_closing,
                COALESCE(v_sp.current_pistol, v_sp.opened_at_counter)
            );
        END IF;

        IF v_final::text IN ('NaN', 'Infinity', '-Infinity') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Valore contatore non finito per pistola %s', v_sp.pistola_id),
                'message', format('Valore contatore non finito per pistola %s', v_sp.pistola_id)
            );
        END IF;

        v_minimum_counter := GREATEST(
            v_sp.opened_at_counter,
            v_sp.previous_closing,
            COALESCE(v_sp.current_pistol, v_sp.opened_at_counter)
        );

        IF v_final < v_minimum_counter THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format(
                    'Contatore finale %s inferiore all ultimo valore registrato (%s < %s)',
                    v_sp.pistola_id,
                    v_final,
                    v_minimum_counter
                ),
                'message', format(
                    'Contatore finale %s inferiore all ultimo valore registrato (%s < %s)',
                    v_sp.pistola_id,
                    v_final,
                    v_minimum_counter
                )
            );
        END IF;

        v_price := public.get_price_at(p_station_id, v_sp.tipo_carburante, now());
        IF v_price IS NULL OR v_price <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Prezzo mancante per il prodotto %s', v_sp.tipo_carburante),
                'message', format('Prezzo mancante per il prodotto %s', v_sp.tipo_carburante)
            );
        END IF;

        v_liters := v_final - v_minimum_counter;
        IF v_liters < 0 THEN
            v_liters := 0;
        END IF;
        v_total_liters := v_total_liters + v_liters;
        v_fuel_revenue := v_fuel_revenue + (v_liters * v_price);
    END LOOP;

    -- Tank usage validation (kept for backward compatibility).
    IF p_tank_usage IS NOT NULL AND jsonb_typeof(p_tank_usage) <> 'array' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Gli utilizzi serbatoio devono essere un array JSON',
            'message', 'Gli utilizzi serbatoio devono essere un array JSON'
        );
    END IF;

    IF p_tank_usage IS NOT NULL THEN
        FOR v_usage IN
            SELECT value
            FROM jsonb_array_elements(p_tank_usage)
        LOOP
            IF jsonb_typeof(v_usage) <> 'object' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Utilizzo serbatoio non valido',
                    'message', 'Utilizzo serbatoio non valido'
                );
            END IF;

            BEGIN
                v_usage_pump_id := (v_usage ->> 'pump_id')::bigint;
                v_usage_tank_id := (v_usage ->> 'tank_id')::bigint;
                v_usage_liters := (v_usage ->> 'liters')::numeric;
                v_usage_ratio := NULLIF(v_usage ->> 'ratio', '')::numeric;
                v_usage_mode := NULLIF(trim(v_usage ->> 'mode'), '');
            EXCEPTION
                WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Valori utilizzo serbatoio non validi',
                        'message', 'Valori utilizzo serbatoio non validi'
                    );
            END;

            IF v_usage_liters::text IN ('NaN', 'Infinity', '-Infinity')
               OR v_usage_ratio::text IN ('NaN', 'Infinity', '-Infinity')
               OR v_usage_pump_id IS NULL
               OR v_usage_tank_id IS NULL
               OR v_usage_liters IS NULL
               OR v_usage_mode IS NULL
               OR v_usage_liters < 0
               OR COALESCE(v_usage_ratio, 0) < 0
               OR NOT EXISTS (
                   SELECT 1
                   FROM public.shift_pistols sp
                   WHERE sp.shift_id = p_shift_id
                     AND sp.pistola_id = v_usage_pump_id
               )
               OR NOT EXISTS (
                   SELECT 1
                   FROM public.tanks t
                   WHERE t.id = v_usage_tank_id
                     AND t.station_id = p_station_id
               ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Utilizzo serbatoio non coerente con turno e stazione',
                    'message', 'Utilizzo serbatoio non coerente con turno e stazione'
                );
            END IF;
        END LOOP;
    END IF;

    -- Recover all shift-bound cash-affecting movements.
    SELECT
        COALESCE(SUM(CASE WHEN m.tipo = 'incasso' THEN m.importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN m.tipo = 'incasso' AND m.payment_method IN ('pos','uta','dkv','fine_mese') THEN m.importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN m.tipo = 'uscita' THEN m.importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN m.tipo = 'voucher' THEN m.importo ELSE 0 END), 0)
    INTO v_extra_revenue, v_extra_pos, v_outflows, v_vouchers
    FROM public.movimenti_cassa m
    WHERE m.shift_id = p_shift_id;

    SELECT
        COALESCE(SUM(CASE WHEN COALESCE(m.payment_method,'cash') = 'cash' THEN m.importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN m.payment_method IN ('pos') THEN m.importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN m.payment_method IN ('uta','dkv','fine_mese') THEN m.importo ELSE 0 END), 0)
    INTO v_extra_cash, v_extra_pos, v_extra_uta
    FROM public.movimenti_cassa m
    WHERE m.shift_id = p_shift_id AND m.tipo = 'incasso';

    v_extra_revenue := v_extra_cash + v_extra_pos + v_extra_uta;

    SELECT COALESCE(SUM(importo), 0)
    INTO v_points
    FROM public.punti_riscatti
    WHERE shift_id = p_shift_id;

    SELECT COALESCE(SUM(importo), 0)
    INTO v_new_credits
    FROM public.crediti_movimenti
    WHERE shift_id = p_shift_id
      AND tipo = 'credito';

    SELECT
        COALESCE(SUM(CASE WHEN metodo = 'cash' OR metodo IS NULL THEN importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN metodo = 'pos' THEN importo ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN metodo IN ('uta','dkv','fine_mese') THEN importo ELSE 0 END), 0)
    INTO v_credit_payments_cash, v_credit_payments_pos, v_credit_payments_uta
    FROM public.crediti_movimenti
    WHERE shift_id = p_shift_id
      AND tipo IN ('pagamento','incasso','incasso_pos','incasso_uta');

    v_total_sold := v_fuel_revenue + v_extra_revenue;
    v_electronic :=
        COALESCE(p_self_pos, 0)
        + COALESCE(p_self_fleet, 0)
        + COALESCE(p_operator_pos, 0)
        + COALESCE(p_operator_fleet, 0)
        + v_extra_pos
        + v_extra_uta
        + v_credit_payments_pos
        + v_credit_payments_uta;

    v_non_erogato := COALESCE(p_self_cash_in, 0) - COALESCE(p_self_cash_out, 0);

    v_expected_cash :=
        v_total_sold
        - v_electronic
        - v_vouchers
        - v_points
        - v_new_credits
        - v_outflows
        + v_non_erogato;

    v_discrepancy := COALESCE(p_operator_cash, 0) - v_expected_cash;

    -- Build the result with totals (used for both preview and commit).
    v_result := jsonb_build_object(
        'success', true,
        'preview', p_preview,
        'shift_id', p_shift_id,
        'closure_stage', CASE WHEN v_is_final THEN 'final' ELSE 'partial' END,
        'totals', jsonb_build_object(
            'total_liters', round(v_total_liters, 2),
            'fuel_revenue', round(v_fuel_revenue, 2),
            'extra_revenue', round(v_extra_revenue, 2),
            'total_sold', round(v_total_sold, 2),
            'electronic_total', round(v_electronic, 2),
            'expected_cash', round(v_expected_cash, 2),
            'real_cash', round(COALESCE(p_operator_cash,0), 2),
            'discrepancy', round(v_discrepancy, 2),
            'self_cash_in', round(COALESCE(p_self_cash_in,0), 2),
            'self_cash_out', round(COALESCE(p_self_cash_out,0), 2),
            'self_pos', round(COALESCE(p_self_pos,0), 2),
            'self_fleet', round(COALESCE(p_self_fleet,0), 2),
            'self_manager', round(COALESCE(p_self_manager,0), 2),
            'operator_cash', round(COALESCE(p_operator_cash,0), 2),
            'operator_pos', round(COALESCE(p_operator_pos,0), 2),
            'operator_fleet', round(COALESCE(p_operator_fleet,0), 2),
            'vouchers', round(v_vouchers, 2),
            'points', round(v_points, 2),
            'new_credits', round(v_new_credits, 2),
            'outflows', round(v_outflows, 2)
        )
    );

    -- In preview mode, return results without persisting anything.
    IF p_preview THEN
        RETURN v_result;
    END IF;

    -- Build the audit snapshot (only for commit mode).
    v_snapshot := jsonb_build_object(
        'version', '1.0',
        'actor', v_operator_id,
        'closure_stage', v_effective_closure_type,
        'is_final', v_is_final,
        'input', v_payload,
        'computed', jsonb_build_object(
            'total_liters', round(v_total_liters, 2),
            'liters_by_pump', (
                SELECT jsonb_object_agg(sp.pistola_id::text, round(COALESCE(
                    (p_final_counters ->> sp.pistola_id::text)::numeric,
                    sp.opened_at_counter
                ) - GREATEST(
                    sp.opened_at_counter,
                    COALESCE(sp.closed_at_counter, sp.opened_at_counter),
                    COALESCE(p.numero_litri, sp.opened_at_counter)
                ), 2))
                FROM public.shift_pistols sp
                JOIN public.pistole p ON p.id = sp.pistola_id
                WHERE sp.shift_id = p_shift_id
            ),
            'fuel_revenue', round(v_fuel_revenue, 2),
            'extra_revenue', round(v_extra_revenue, 2),
            'extra_by_method', jsonb_build_object(
                'cash', round(v_extra_cash, 2),
                'pos', round(v_extra_pos, 2),
                'uta_dkv_fine_mese', round(v_extra_uta, 2)
            ),
            'total_sold', round(v_total_sold, 2),
            'electronic_total', round(v_electronic, 2),
            'self', jsonb_build_object(
                'cash_in', round(COALESCE(p_self_cash_in,0), 2),
                'cash_out', round(COALESCE(p_self_cash_out,0), 2),
                'pos', round(COALESCE(p_self_pos,0), 2),
                'fleet', round(COALESCE(p_self_fleet,0), 2),
                'manager', round(COALESCE(p_self_manager,0), 2)
            ),
            'operator', jsonb_build_object(
                'cash', round(COALESCE(p_operator_cash,0), 2),
                'pos', round(COALESCE(p_operator_pos,0), 2),
                'fleet', round(COALESCE(p_operator_fleet,0), 2)
            ),
            'vouchers', round(v_vouchers, 2),
            'points', round(v_points, 2),
            'new_credits', round(v_new_credits, 2),
            'outflows', round(v_outflows, 2),
            'credit_payments', jsonb_build_object(
                'cash', round(v_credit_payments_cash, 2),
                'pos', round(v_credit_payments_pos, 2),
                'uta_dkv_fine_mese', round(v_credit_payments_uta, 2)
            ),
            'non_erogato', round(v_non_erogato, 2),
            'expected_cash', round(v_expected_cash, 2),
            'real_cash', round(COALESCE(p_operator_cash,0), 2),
            'discrepancy', round(v_discrepancy, 2)
        ),
        'prices_used', (
            SELECT jsonb_object_agg(p.tipo_carburante, public.get_price_at(p_station_id, p.tipo_carburante, now()))
            FROM public.pistole p
            JOIN public.shift_pistols sp ON sp.pistola_id = p.id
            WHERE sp.shift_id = p_shift_id
        )
    );

    -- Insert idempotency marker before writing side effects.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        INSERT INTO public.processed_requests (
            request_id,
            action_type,
            payload,
            payload_fingerprint,
            response,
            created_at
        )
        VALUES (
            trim(p_request_id),
            'submit_shift_closure_v2',
            v_payload,
            v_fingerprint,
            NULL,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            -- Concurrent call won; replay the stored result.
            SELECT response
            INTO v_existing
            FROM public.processed_requests
            WHERE request_id = trim(p_request_id)
              AND action_type = 'submit_shift_closure_v2';

            RETURN COALESCE(
                v_existing,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
            );
        END IF;
    END IF;

    -- Apply counter side effects.
    IF p_final_counters IS NOT NULL THEN
        FOR v_counter_key, v_counter_value IN
            SELECT key, value
            FROM jsonb_each_text(p_final_counters)
        LOOP
            v_pistol_id := v_counter_key::bigint;
            v_final := v_counter_value::numeric;

            UPDATE public.shift_pistols
            SET closed_at_counter = v_final,
                liters_dispensed = v_final - opened_at_counter,
                updated_at = now()
            WHERE shift_id = p_shift_id
              AND pistola_id = v_pistol_id;

            UPDATE public.pistole
            SET numero_litri = v_final
            WHERE id = v_pistol_id;
        END LOOP;
    END IF;

    -- Apply tank usage side effects.
    IF p_tank_usage IS NOT NULL AND jsonb_array_length(p_tank_usage) > 0 THEN
        INSERT INTO public.tank_pump_usages (
            shift_id,
            station_id,
            pump_id,
            tank_id,
            liters,
            mode,
            ratio
        )
        SELECT
            p_shift_id,
            p_station_id,
            (item ->> 'pump_id')::bigint,
            (item ->> 'tank_id')::bigint,
            (item ->> 'liters')::numeric,
            item ->> 'mode',
            NULLIF(item ->> 'ratio', '')::numeric
        FROM jsonb_array_elements(p_tank_usage) AS item;
    END IF;

    -- Persist closure snapshot.
    UPDATE public.shifts
    SET closing_data = v_snapshot,
        status = CASE WHEN v_is_final THEN 'closed' ELSE 'partial' END,
        closed_at = CASE WHEN v_is_final THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_shift_id;

    -- Backfill response on the idempotency marker.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'submit_shift_closure_v2';
    END IF;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean) TO authenticated;

COMMIT;
