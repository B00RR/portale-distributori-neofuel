-- Migration: server-authoritative shift closure financial calculation (#321)
-- Created: 2026-07-21
--
-- This migration:
--   1. Adds shift_id to all financial movement tables so the closure RPC can
--      recover every cash-affecting event tied to a shift.
--   2. Adds payment_method to movimenti_cassa to distinguish cash/electronic
--      extra income and to tag voucher/points movements consistently.
--   3. Creates a dedicated punti_riscatti table (points redemptions).
--   4. Extends processed_requests with payload_fingerprint for strict idempotency
--      on the new closure RPC and related financial mutations.
--   5. Introduces submit_shift_closure_v2: the server computes liters, theoretical
--      revenue, expected cash, discrepancy and an auditable snapshot from raw
--      operator/self inputs and all shift-bound movements.
--   6. Introduces get_price_at to read the effective station price for a product
--      at a given instant (used by submit_shift_closure_v2 and by future price
--      logic).
--   7. Hardens redeem_voucher_validated with shift_id / idempotency fingerprint.
--   8. Adds server functions for points redemption, extra-income and outflow
--      creation so the client never inserts movements directly (fixes #311).
--
-- Downtime: none (CREATE OR REPLACE + additive ALTER).
-- Data backfill: shift_id columns are nullable; existing rows stay NULL and are
-- not included in the closure calculation. They can be backfilled later if needed.
--
-- IMPORTANT: apply on a staging project before production. Verify live function
-- bodies with \df+ after applying.

BEGIN;

-- ============================================================================
-- 1. Schema extensions
-- ============================================================================

ALTER TABLE public.movimenti_cassa
    ADD COLUMN IF NOT EXISTS shift_id bigint REFERENCES public.shifts(id),
    ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS shift_id bigint REFERENCES public.shifts(id);

ALTER TABLE public.crediti_clienti
    ADD COLUMN IF NOT EXISTS shift_id bigint REFERENCES public.shifts(id);

ALTER TABLE public.crediti_movimenti
    ADD COLUMN IF NOT EXISTS shift_id bigint REFERENCES public.shifts(id);

CREATE TABLE IF NOT EXISTS public.punti_riscatti (
    id bigserial PRIMARY KEY,
    station_id integer NOT NULL,
    shift_id bigint REFERENCES public.shifts(id),
    operator_id integer NOT NULL,
    importo numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.punti_riscatti ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processed_requests
    ADD COLUMN IF NOT EXISTS payload_fingerprint text;

CREATE INDEX IF NOT EXISTS movimenti_cassa_shift_id_idx
    ON public.movimenti_cassa (shift_id);

CREATE INDEX IF NOT EXISTS vouchers_shift_id_idx
    ON public.vouchers (shift_id);

CREATE INDEX IF NOT EXISTS crediti_clienti_shift_id_idx
    ON public.crediti_clienti (shift_id);

CREATE INDEX IF NOT EXISTS crediti_movimenti_shift_id_idx
    ON public.crediti_movimenti (shift_id);

CREATE INDEX IF NOT EXISTS punti_riscatti_shift_id_idx
    ON public.punti_riscatti (shift_id);

-- ============================================================================
-- 2. Helper: effective price for a product at a station/instant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_price_at(
    p_station_id integer,
    p_product text,
    p_at timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_price numeric;
    v_column text;
BEGIN
    v_column := lower(trim(p_product));
    IF v_column NOT IN ('benzina','gasolio','gpl','metano') THEN
        RETURN NULL;
    END IF;

    EXECUTE format(
        'SELECT %I FROM public.prezzi_distributore WHERE station_id = $1 AND data_validita <= $2 ORDER BY data_validita DESC LIMIT 1',
        'prezzo_' || v_column
    )
    INTO v_price
    USING p_station_id, p_at;

    RETURN v_price;
END;
$$;

REVOKE ALL ON FUNCTION public.get_price_at(integer, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_price_at(integer, text, timestamptz) TO authenticated;

-- ============================================================================
-- 3. Helper: strict idempotency fingerprint comparison
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_request_idempotency(
    p_request_id text,
    p_action_type text,
    p_payload jsonb,
    p_fingerprint text DEFAULT NULL
)
RETURNS TABLE(existing_response jsonb, fingerprint_mismatch boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_existing_fingerprint text;
    v_existing_payload jsonb;
    v_existing_response jsonb;
BEGIN
    SELECT payload_fingerprint, payload, response
    INTO v_existing_fingerprint, v_existing_payload, v_existing_response
    FROM public.processed_requests
    WHERE request_id = p_request_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Prefer fingerprint comparison when available; fall back to full payload.
    IF v_existing_fingerprint IS NOT NULL OR p_fingerprint IS NOT NULL THEN
        RETURN QUERY SELECT v_existing_response, COALESCE(v_existing_fingerprint, '') <> COALESCE(p_fingerprint, '');
    ELSIF v_existing_payload IS NOT NULL AND v_existing_payload <> COALESCE(p_payload, '{}'::jsonb) THEN
        RETURN QUERY SELECT v_existing_response, true;
    ELSE
        RETURN QUERY SELECT v_existing_response, false;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_request_idempotency(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_request_idempotency(text, text, jsonb, text) TO authenticated;

-- ============================================================================
-- 4. Server-authoritative shift closure v2
-- ============================================================================

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
    p_closure_type text DEFAULT 'partial'
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

    -- Fingerprint: JSONB text normalization. Good enough for idempotency
    -- without requiring pgcrypto. NULLs from numeric defaults are preserved.
    v_fingerprint := md5(v_payload::text);

    -- Early idempotency replay.
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
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

    -- Compute revenue across ALL shift pistols, using the provided final
    -- counter when present and the latest recorded counter otherwise.
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
        FOR UPDATE OF sp, p
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

    -- For extra income, split by payment method. Any 'incasso' without explicit
    -- payment_method defaults to cash (historical data before this migration).
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

    -- Build the audit snapshot.
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

    v_result := jsonb_build_object(
        'success', true,
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

REVOKE ALL ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shift_closure_v2(bigint, integer, text, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)
    TO authenticated;

-- ============================================================================
-- 5. Harden voucher redemption with shift_id and idempotency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_voucher_validated(
    p_voucher_code text,
    p_station_id integer,
    p_operator_id uuid,
    p_request_id text DEFAULT NULL,
    p_shift_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_voucher record;
    v_local_operator_id integer;
    v_request_inserted boolean;
    v_existing jsonb;
    v_payload jsonb;
    v_fingerprint text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT u.user_id
    INTO v_local_operator_id
    FROM public.users u
    WHERE u.created_by_auth = auth.uid()
    LIMIT 1;

    IF v_local_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_local_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Station-safe lookup: exact code first, then prefix match only if unique.
    SELECT *
    INTO v_voucher
    FROM public.vouchers
    WHERE code = upper(trim(p_voucher_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT *
        INTO v_voucher
        FROM public.vouchers
        WHERE code LIKE upper(trim(p_voucher_code)) || '%'
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Voucher non trovato');
        END IF;

        -- If the prefix matches more than one row, fail closed (#322).
        IF EXISTS (
            SELECT 1
            FROM public.vouchers
            WHERE code LIKE upper(trim(p_voucher_code)) || '%'
            AND id <> v_voucher.id
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Codice voucher ambiguo'
            );
        END IF;
    END IF;

    IF v_voucher.status = 'redeemed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher gia riscattato',
            'redeemed_at', v_voucher.redeemed_at
        );
    END IF;

    IF v_voucher.status = 'expired'
       OR (v_voucher.expiration_date IS NOT NULL AND v_voucher.expiration_date < current_date) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher scaduto');
    END IF;

    IF v_voucher.status = 'void' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher annullato');
    END IF;

    v_payload := jsonb_build_object(
        'voucher_code', upper(trim(p_voucher_code)),
        'station_id', p_station_id,
        'operator_id', p_operator_id,
        'shift_id', p_shift_id
    );
    v_fingerprint := md5(v_payload::text);

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT existing_response
        INTO v_existing
        FROM public.check_request_idempotency(
            trim(p_request_id),
            'redeem_voucher_validated',
            v_payload,
            v_fingerprint
        );

        IF FOUND THEN
            RETURN COALESCE(
                v_existing,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
            );
        END IF;

        INSERT INTO public.processed_requests (
            request_id, action_type, payload, payload_fingerprint, created_at
        )
        VALUES (
            trim(p_request_id),
            'redeem_voucher_validated',
            v_payload,
            v_fingerprint,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    UPDATE public.vouchers
    SET status = 'redeemed',
        redeemed_at = now(),
        redeemed_by = auth.uid(),
        station_id = COALESCE(station_id, p_station_id),
        shift_id = p_shift_id
    WHERE id = v_voucher.id;

    INSERT INTO public.movimenti_cassa (
        station_id,
        operator_id,
        shift_id,
        tipo,
        payment_method,
        importo,
        descrizione,
        created_at
    )
    VALUES (
        p_station_id,
        v_local_operator_id,
        p_shift_id,
        'voucher',
        'voucher',
        v_voucher.amount,
        'Riscatto Voucher ' || v_voucher.code,
        now()
    );

    v_existing := jsonb_build_object(
        'success', true,
        'amount', v_voucher.amount,
        'code', v_voucher.code
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_existing
        WHERE request_id = trim(p_request_id)
          AND action_type = 'redeem_voucher_validated';
    END IF;

    RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint)
    TO authenticated;

-- ============================================================================
-- 6. Points redemption RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_punti_riscatto(
    p_station_id integer,
    p_shift_id bigint,
    p_operator_id integer,
    p_importo numeric,
    p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_request_inserted boolean;
    v_payload jsonb;
    v_fingerprint text;
    v_existing jsonb;
    v_fingerprint_mismatch boolean;
    v_result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_importo IS NULL OR p_importo <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Importo punti non valido'
        );
    END IF;

    v_payload := jsonb_build_object(
        'station_id', p_station_id,
        'shift_id', p_shift_id,
        'operator_id', p_operator_id,
        'importo', p_importo
    );
    v_fingerprint := md5(v_payload::text);

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT existing_response, fingerprint_mismatch
        INTO v_existing, v_fingerprint_mismatch
        FROM public.check_request_idempotency(
            trim(p_request_id),
            'register_punti_riscatto',
            v_payload,
            v_fingerprint
        );

        IF FOUND THEN
            RETURN COALESCE(
                v_existing,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
            );
        END IF;

        INSERT INTO public.processed_requests (
            request_id, action_type, payload, payload_fingerprint, created_at
        )
        VALUES (
            trim(p_request_id),
            'register_punti_riscatto',
            v_payload,
            v_fingerprint,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    INSERT INTO public.punti_riscatti (
        station_id, shift_id, operator_id, importo, created_at
    )
    VALUES (
        p_station_id,
        p_shift_id,
        p_operator_id,
        p_importo,
        now()
    );

    v_result := jsonb_build_object(
        'success', true,
        'importo', p_importo
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'register_punti_riscatto';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_punti_riscatto(integer, bigint, integer, numeric, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_punti_riscatto(integer, bigint, integer, numeric, text)
    TO authenticated;

-- ============================================================================
-- 7. Server-side movement creation for extra income / outflows (#311, #329)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_movement_v2(
    p_station_id integer,
    p_shift_id bigint,
    p_operator_id integer,
    p_tipo text,
    p_payment_method text,
    p_importo numeric,
    p_descrizione text,
    p_request_id text DEFAULT NULL,
    p_created_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_request_inserted boolean;
    v_payload jsonb;
    v_fingerprint text;
    v_existing jsonb;
    v_fingerprint_mismatch boolean;
    v_result jsonb;
    v_movement_id bigint;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_importo IS NULL OR p_importo < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Importo non valido'
        );
    END IF;

    v_payload := jsonb_build_object(
        'station_id', p_station_id,
        'shift_id', p_shift_id,
        'operator_id', p_operator_id,
        'tipo', p_tipo,
        'payment_method', p_payment_method,
        'importo', p_importo,
        'descrizione', p_descrizione,
        'created_at', p_created_at
    );
    v_fingerprint := md5(v_payload::text);

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT existing_response, fingerprint_mismatch
        INTO v_existing, v_fingerprint_mismatch
        FROM public.check_request_idempotency(
            trim(p_request_id),
            'create_movement_v2',
            v_payload,
            v_fingerprint
        );

        IF FOUND THEN
            RETURN COALESCE(
                v_existing,
                jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'request_id', trim(p_request_id)
                )
            );
        END IF;

        INSERT INTO public.processed_requests (
            request_id, action_type, payload, payload_fingerprint, created_at
        )
        VALUES (
            trim(p_request_id),
            'create_movement_v2',
            v_payload,
            v_fingerprint,
            now()
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING true INTO v_request_inserted;

        IF NOT COALESCE(v_request_inserted, false) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    INSERT INTO public.movimenti_cassa (
        station_id,
        operator_id,
        shift_id,
        tipo,
        payment_method,
        importo,
        descrizione,
        created_at
    )
    VALUES (
        p_station_id,
        p_operator_id,
        p_shift_id,
        lower(trim(p_tipo)),
        lower(trim(p_payment_method)),
        p_importo,
        p_descrizione,
        COALESCE(p_created_at, now())
    )
    RETURNING id INTO v_movement_id;

    v_result := jsonb_build_object(
        'success', true,
        'movement_id', v_movement_id
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'create_movement_v2';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_movement_v2(integer, bigint, integer, text, text, numeric, text, text, timestamptz)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_movement_v2(integer, bigint, integer, text, text, numeric, text, text, timestamptz)
    TO authenticated;

-- ============================================================================
-- 8. RLS policy updates for new columns
-- ============================================================================

-- punti_riscatti: operators can only see their station's rows.
DROP POLICY IF EXISTS punti_riscatti_station_isolation ON public.punti_riscatti;
CREATE POLICY punti_riscatti_station_isolation
    ON public.punti_riscatti
    FOR ALL
    TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = public.punti_riscatti.station_id
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = public.punti_riscatti.station_id
        )
    );

-- movimenti_cassa: keep existing station isolation; no broad read grant.
DROP POLICY IF EXISTS movimenti_cassa_station_isolation ON public.movimenti_cassa;
CREATE POLICY movimenti_cassa_station_isolation
    ON public.movimenti_cassa
    FOR ALL
    TO authenticated
    USING (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR station_id IN (
            SELECT us.station_id
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
        )
    );

-- ============================================================================
-- 9. Extend existing credit RPCs with shift_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_credit_transaction(
    p_request_id text,
    p_station_id integer,
    p_customer_name text,
    p_amount numeric,
    p_product text,
    p_notes text,
    p_shift_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_operator_id integer;
    v_customer_id integer;
    v_new_balance numeric;
    v_request_inserted boolean;
    v_result jsonb;
    v_existing_action_type text;
    v_existing_payload jsonb;
    v_payload jsonb;
    v_product text;
    v_notes text;
    v_created_at timestamptz;
    v_amount numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_request_id IS NULL OR trim(p_request_id) = '' OR char_length(trim(p_request_id)) > 255 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_id', 'message', 'ID richiesta non valido o troppo lungo');
    END IF;

    IF p_station_id IS NULL OR p_station_id <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_station_id', 'message', 'ID stazione non valido o non positivo');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.fuel_stations WHERE station_id = p_station_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'station_not_found', 'message', 'Stazione non trovata');
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_customer_name', 'message', 'Nome cliente obbligatorio');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Importo deve essere un numero reale positivo finito');
    END IF;

    v_amount := round(p_amount, 2);
    IF v_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Importo deve essere un numero reale positivo finito');
    END IF;

    v_product := COALESCE(trim(p_product), 'Gasolio');
    v_notes := COALESCE(trim(p_notes), '');
    v_created_at := now();

    v_payload := jsonb_build_object(
        'action_type', 'create_credit_transaction',
        'operator_id', v_operator_id,
        'station_id', p_station_id,
        'shift_id', p_shift_id,
        'customer_name', trim(p_customer_name),
        'amount', v_amount,
        'product', v_product,
        'notes', v_notes
    );

    INSERT INTO public.processed_requests (
        request_id, action_type, payload, response, created_at
    )
    VALUES (
        trim(p_request_id), 'create_credit_transaction', v_payload, NULL, now()
    )
    ON CONFLICT (request_id) DO NOTHING
    RETURNING true INTO v_request_inserted;

    IF NOT COALESCE(v_request_inserted, false) THEN
        SELECT action_type, payload, response
        INTO v_existing_action_type, v_existing_payload, v_result
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id);

        IF FOUND THEN
            IF v_existing_action_type = 'create_credit_transaction' AND v_existing_payload = v_payload THEN
                IF v_result IS NULL THEN
                    RETURN jsonb_build_object('success', false, 'error', 'request_in_progress', 'message', 'La richiesta è in elaborazione.');
                ELSE
                    RETURN v_result;
                END IF;
            ELSE
                RETURN jsonb_build_object('success', false, 'error', 'request_id_collision', 'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.');
            END IF;
        END IF;

        RETURN jsonb_build_object('success', false, 'error', 'request_id_collision', 'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.');
    END IF;

    INSERT INTO public.crediti_clienti (
        station_id, shift_id, cliente, saldo, importo, created_at, updated_at
    )
    VALUES (
        p_station_id, p_shift_id, trim(p_customer_name), v_amount, 0, v_created_at, v_created_at
    )
    ON CONFLICT (station_id, lower(trim(cliente))) WHERE station_id IS NOT NULL
    DO UPDATE SET
        saldo = public.crediti_clienti.saldo + v_amount,
        updated_at = v_created_at
    RETURNING id, saldo INTO v_customer_id, v_new_balance;

    INSERT INTO public.crediti_movimenti (
        cliente_id, station_id, operator_id, shift_id, tipo, importo, metodo, note, created_at
    )
    VALUES (
        v_customer_id, p_station_id, v_operator_id, p_shift_id,
        'credito', v_amount, 'credito', v_product || ' - ' || v_notes, v_created_at
    );

    INSERT INTO public.movimenti_cassa (
        station_id, operator_id, shift_id, tipo, payment_method, importo, descrizione, created_at
    )
    VALUES (
        p_station_id, v_operator_id, p_shift_id, 'credito', 'credito', v_amount,
        'Credito: ' || trim(p_customer_name) || ' (' || v_product || ')' || CASE WHEN v_notes <> '' THEN ' - ' || v_notes ELSE '' END,
        v_created_at
    );

    v_result := jsonb_build_object('success', true, 'customer_id', v_customer_id, 'new_balance', v_new_balance);

    UPDATE public.processed_requests
    SET response = v_result
    WHERE request_id = trim(p_request_id)
      AND action_type = 'create_credit_transaction';

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_credit_payment(
    p_request_id text,
    p_station_id integer,
    p_customer_id_param integer,
    p_amount numeric,
    p_method text,
    p_shift_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_operator_id integer;
    v_customer_name text;
    v_customer_saldo numeric;
    v_new_balance numeric;
    v_request_inserted boolean;
    v_result jsonb;
    v_existing_action_type text;
    v_existing_payload jsonb;
    v_payload jsonb;
    v_method text;
    v_movement_type text;
    v_created_at timestamptz;
    v_amount numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_request_id IS NULL OR trim(p_request_id) = '' OR char_length(trim(p_request_id)) > 255 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_id', 'message', 'ID richiesta non valido o troppo lungo');
    END IF;

    IF p_station_id IS NULL OR p_station_id <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_station_id', 'message', 'ID stazione non valido o non positivo');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.fuel_stations WHERE station_id = p_station_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'station_not_found', 'message', 'Stazione non trovata');
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_customer_id IS NULL OR p_customer_id <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_customer_id', 'message', 'ID cliente non valido');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Importo deve essere un numero reale positivo finito');
    END IF;

    v_amount := round(p_amount, 2);
    IF v_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Importo deve essere un numero reale positivo finito');
    END IF;

    IF p_method IS NULL OR lower(trim(p_method)) NOT IN ('contanti', 'pos', 'uta') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payment_method', 'message', 'Metodo di pagamento non valido. Valori ammessi: contanti, pos, uta');
    END IF;

    v_method := lower(trim(p_method));
    v_created_at := now();

    v_payload := jsonb_build_object(
        'action_type', 'register_credit_payment',
        'operator_id', v_operator_id,
        'station_id', p_station_id,
        'shift_id', p_shift_id,
        'customer_id', p_customer_id_param,
        'amount', v_amount,
        'method', v_method
    );

    INSERT INTO public.processed_requests (
        request_id, action_type, payload, response, created_at
    )
    VALUES (
        trim(p_request_id), 'register_credit_payment', v_payload, NULL, now()
    )
    ON CONFLICT (request_id) DO NOTHING
    RETURNING true INTO v_request_inserted;

    IF NOT COALESCE(v_request_inserted, false) THEN
        SELECT action_type, payload, response
        INTO v_existing_action_type, v_existing_payload, v_result
        FROM public.processed_requests
        WHERE request_id = trim(p_request_id);

        IF FOUND THEN
            IF v_existing_action_type = 'register_credit_payment' AND v_existing_payload = v_payload THEN
                IF v_result IS NULL THEN
                    RETURN jsonb_build_object('success', false, 'error', 'request_in_progress', 'message', 'La richiesta è in elaborazione.');
                ELSE
                    RETURN v_result;
                END IF;
            ELSE
                RETURN jsonb_build_object('success', false, 'error', 'request_id_collision', 'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.');
            END IF;
        END IF;

        RETURN jsonb_build_object('success', false, 'error', 'request_id_collision', 'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.');
    END IF;

    SELECT id, cliente, saldo
    INTO v_customer_id, v_customer_name, v_customer_saldo
    FROM public.crediti_clienti
    WHERE id = p_customer_id_param
      AND station_id = p_station_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_result := jsonb_build_object('success', false, 'error', 'customer_not_found', 'message', 'Cliente non trovato per la stazione specificata');
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    IF v_customer_saldo < v_amount THEN
        v_result := jsonb_build_object('success', false, 'error', 'insufficient_balance', 'message', 'Saldo insufficiente per registrare il pagamento');
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    UPDATE public.crediti_clienti
    SET saldo = saldo - v_amount,
        updated_at = v_created_at
    WHERE id = p_customer_id_param
      AND station_id = p_station_id
      AND saldo >= v_amount
    RETURNING saldo INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        v_result := jsonb_build_object('success', false, 'error', 'insufficient_balance', 'message', 'Saldo insufficiente per registrare il pagamento');
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    v_movement_type := CASE
        WHEN v_method = 'pos' THEN 'incasso_pos'
        WHEN v_method = 'uta' THEN 'incasso_uta'
        ELSE 'incasso'
    END;

    INSERT INTO public.crediti_movimenti (
        cliente_id, station_id, operator_id, shift_id, tipo, importo, metodo, created_at
    )
    VALUES (
        p_customer_id_param, p_station_id, v_operator_id, p_shift_id,
        v_movement_type, v_amount, v_method, v_created_at
    );

    INSERT INTO public.movimenti_cassa (
        station_id, operator_id, shift_id, tipo, payment_method, importo, descrizione, created_at
    )
    VALUES (
        p_station_id, v_operator_id, p_shift_id, v_movement_type,
        v_method, v_amount, 'Pagamento Credito: ' || v_customer_name || ' (' || v_method || ')',
        v_created_at
    );

    v_result := jsonb_build_object('success', true, 'new_balance', v_new_balance);

    UPDATE public.processed_requests
    SET response = v_result
    WHERE request_id = trim(p_request_id)
      AND action_type = 'register_credit_payment';

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text, bigint)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text, bigint)
    TO authenticated;

REVOKE ALL ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text, bigint)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text, bigint)
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Manual staging verification:
-- 1. \df public.submit_shift_closure_v2 -> SECURITY DEFINER, SET search_path = ''
-- 2. \df public.get_price_at
-- 3. \d public.movimenti_cassa -> shift_id, payment_method present
-- 4. \d public.punti_riscatti -> table exists
-- 5. Call submit_shift_closure_v2 with raw inputs and verify totals in response.
-- 6. Verify create_credit_transaction and register_credit_payment include shift_id.
