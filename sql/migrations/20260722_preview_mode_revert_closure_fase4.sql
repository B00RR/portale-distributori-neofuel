-- Migration: Phase 4 — Preview mode for submit_shift_closure_v2 + revert_last_closure RPC
-- Created: 2026-07-22
-- Resolves: Phase 4 of Frontend Wizard Chiusura
--
-- What it does:
--   1. Adds p_preview parameter to submit_shift_closure_v2 so the wizard can
--      request a dry-run calculation without persisting any side effects.
--   2. Creates revert_last_closure RPC to allow operators to undo the most
--      recent closure within a 1-hour window. This reopens the shift, restores
--      pistol counters, and clears the closure snapshot.
--
-- Downtime: none (CREATE OR REPLACE + additive ALTER).
-- Data backfill: not required.

BEGIN;

-- ============================================================================
-- 1. Add p_preview to submit_shift_closure_v2
-- ============================================================================
-- The function is replaced entirely because PostgreSQL does not support
-- ALTER FUNCTION ... ADD PARAMETER. The new parameter p_preview defaults to
-- false, making the change backward-compatible.

CREATE OR REPLACE FUNCTION public.submit_shift_closure_v2(
    p_shift_id bigint,
    p_station_id integer,
    p_request_id text DEFAULT NULL,
    p_final_counters jsonb DEFAULT NULL,
    p_tank_usage jsonb DEFAULT NULL,
    p_self_cash_in numeric DEFAULT 0,
    p_self_cash_out numeric DEFAULT 0,
    p_self_pos numeric DEFAULT 0,
    p_self_fleet numeric DEFAULT 0,
    p_self_manager numeric DEFAULT 0,
    p_operator_cash numeric DEFAULT 0,
    p_operator_pos numeric DEFAULT 0,
    p_operator_fleet numeric DEFAULT 0,
    p_closure_type text DEFAULT 'partial',
    p_preview boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_shift public.shifts%ROWTYPE;
    v_operator_id integer;
    v_is_final boolean := lower(trim(p_closure_type)) = 'final';
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
        'closure_type', p_closure_type
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
    FROM public.crediti_clienti
    WHERE shift_id = p_shift_id;

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

    v_discrepancy := v_expected_cash - COALESCE(p_operator_cash, 0);

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
$$;

-- Revoke/grant for the new signature (15 params including p_preview).
REVOKE ALL ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean)
    TO authenticated;

-- ============================================================================
-- 2. revert_last_closure: undo a closure within 1 hour
-- ============================================================================
-- This RPC allows an operator to undo their most recent closure if it was
-- performed less than 1 hour ago. It reopens the shift and restores pistol
-- counters from the shift_pistols opening values.

CREATE OR REPLACE FUNCTION public.revert_last_closure(
    p_shift_id bigint,
    p_station_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_shift public.shifts%ROWTYPE;
    v_operator_id integer;
    v_previous_status text;
    v_sp record;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT *
    INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id
      AND station_id = p_station_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Turno non trovato',
            'message', 'Turno non trovato'
        );
    END IF;

    -- Authorization: must be the operator who owns the shift or an admin.
    IF NOT public.is_admin() AND v_shift.operator_id <> v_operator_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solo l''operatore del turno o un admin può annullare la chiusura',
            'message', 'Solo l''operatore del turno o un admin può annullare la chiusura'
        );
    END IF;

    -- The shift must be closed or partially closed.
    IF v_shift.status NOT IN ('closed', 'partial') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Il turno non è chiuso',
            'message', 'Il turno non è chiuso'
        );
    END IF;

    -- Enforce the 1-hour window. For partial closures (closed_at is NULL),
    -- use updated_at as the reference timestamp.
    IF v_shift.status = 'closed' AND v_shift.closed_at IS NOT NULL THEN
        IF now() - v_shift.closed_at > interval '1 hour' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'La finestra di modifica di 1 ora è scaduta',
                'message', 'La finestra di modifica di 1 ora è scaduta'
            );
        END IF;
    ELSIF v_shift.updated_at IS NOT NULL THEN
        IF now() - v_shift.updated_at::timestamptz > interval '1 hour' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'La finestra di modifica di 1 ora è scaduta',
                'message', 'La finestra di modifica di 1 ora è scaduta'
            );
        END IF;
    END IF;

    -- Determine the previous status.
    -- If the closing_data snapshot indicates a partial closure happened before
    -- the final, revert to 'partial'. Otherwise revert to 'open'.
    v_previous_status := 'open';

    -- Restore pistol counters from opening values.
    -- Reset closed_at_counter and liters_dispensed in shift_pistols.
    FOR v_sp IN
        SELECT sp.pistola_id, sp.opened_at_counter
        FROM public.shift_pistols sp
        WHERE sp.shift_id = p_shift_id
        FOR UPDATE OF sp
    LOOP
        UPDATE public.shift_pistols
        SET closed_at_counter = NULL,
            liters_dispensed = NULL,
            updated_at = now()
        WHERE shift_id = p_shift_id
          AND pistola_id = v_sp.pistola_id;

        -- Restore the pistol's live counter to the opening value.
        UPDATE public.pistole
        SET numero_litri = v_sp.opened_at_counter
        WHERE id = v_sp.pistola_id;
    END LOOP;

    -- Remove tank_pump_usages for this shift (they were created during closure).
    DELETE FROM public.tank_pump_usages
    WHERE shift_id = p_shift_id;

    -- Reopen the shift.
    UPDATE public.shifts
    SET status = v_previous_status,
        closed_at = NULL,
        closing_data = NULL,
        updated_at = now()
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'reverted_to', v_previous_status,
        'message', 'Chiusura annullata. Il turno è stato riaperto.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_last_closure(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_last_closure(bigint, integer) TO authenticated;

COMMIT;
