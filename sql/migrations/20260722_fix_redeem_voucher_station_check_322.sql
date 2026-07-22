-- Migration: Issue #322 — Voucher station-safe e idempotente
--
-- What it does:
-- 1. Adds station_id check in `redeem_voucher_validated` to ensure a voucher can only be redeemed at its assigned station.
--
-- Requires downtime: No.
-- Requires data backfill: No.

BEGIN;

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

    -- Station-scoped: voucher must belong to the same station (#322)
    IF v_voucher.station_id IS NOT NULL AND v_voucher.station_id <> p_station_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher non valido per questa stazione'
        );
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

REVOKE ALL ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
