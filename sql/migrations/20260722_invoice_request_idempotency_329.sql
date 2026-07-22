-- Migration: Issue #329 — Idempotency for invoice requests
--
-- What it does:
-- 1. Creates an idempotent RPC function `create_invoice_request` to register invoice requests securely.
-- 2. Checks authorization (user must be admin or station operator).
-- 3. Implements request idempotency using the `processed_requests` table and payload fingerprinting.
--
-- Requires downtime: No.
-- Requires data backfill: No.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_invoice_request(
    p_request_id text,
    p_station_id integer,
    p_operator_id integer,
    p_cliente_id integer DEFAULT NULL,
    p_customer_name text DEFAULT NULL,
    p_amount numeric DEFAULT NULL,
    p_payment_method text DEFAULT NULL,
    p_product_category text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_invoice_number text DEFAULT NULL,
    p_invoice_date text DEFAULT NULL,
    p_created_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_request_inserted boolean;
    v_payload jsonb;
    v_fingerprint text;
    v_existing jsonb;
    v_fingerprint_mismatch boolean;
    v_result jsonb;
    v_invoice_id integer;
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

    v_payload := jsonb_build_object(
        'station_id', p_station_id,
        'operator_id', p_operator_id,
        'cliente_id', p_cliente_id,
        'customer_name', p_customer_name,
        'amount', p_amount,
        'payment_method', p_payment_method,
        'product_category', p_product_category,
        'description', p_description,
        'invoice_number', p_invoice_number,
        'invoice_date', p_invoice_date,
        'created_at', p_created_at
    );
    v_fingerprint := md5(v_payload::text);

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        SELECT existing_response, fingerprint_mismatch
        INTO v_existing, v_fingerprint_mismatch
        FROM public.check_request_idempotency(
            trim(p_request_id),
            'create_invoice_request',
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
            'create_invoice_request',
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

    INSERT INTO public.invoices (
        station_id,
        operator_id,
        cliente_id,
        customer_name,
        amount,
        payment_method,
        product_category,
        description,
        status,
        created_at,
        invoice_number,
        invoice_date
    )
    VALUES (
        p_station_id,
        p_operator_id,
        p_cliente_id,
        p_customer_name,
        p_amount,
        p_payment_method,
        p_product_category,
        p_description,
        'pending',
        COALESCE(p_created_at, now()),
        p_invoice_number,
        p_invoice_date
    )
    RETURNING id INTO v_invoice_id;

    v_result := jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = trim(p_request_id)
          AND action_type = 'create_invoice_request';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_request(text, integer, integer, integer, text, numeric, text, text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_request(text, integer, integer, integer, text, numeric, text, text, text, text, text, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
