-- Migration: fix credit RPC functions coalesce qualification
-- Resolves: #249
--
-- This migration updates the previously created credit transaction and payment RPC functions:
-- 1. public.create_credit_transaction
-- 2. public.register_credit_payment
-- It removes pg_catalog qualification from COALESCE as it is an SQL syntactic construct, not a function.
--
-- Downtime: none.
-- Data backfill: none.

BEGIN;

-- 1. Create OR Replace RPC public.create_credit_transaction
CREATE OR REPLACE FUNCTION public.create_credit_transaction(
    p_request_id text,
    p_station_id integer,
    p_customer_name text,
    p_amount numeric,
    p_product text,
    p_notes text
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
    v_created_at timestamp with time zone;
    v_amount numeric;
BEGIN
    -- Authenticate user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate request ID
    IF p_request_id IS NULL OR pg_catalog.btrim(p_request_id) = '' OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_request_id',
            'message', 'ID richiesta non valido o troppo lungo'
        );
    END IF;

    -- Validate station ID
    IF p_station_id IS NULL OR p_station_id <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_station_id',
            'message', 'ID stazione non valido o non positivo'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.fuel_stations
        WHERE station_id = p_station_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'station_not_found',
            'message', 'Stazione non trovata'
        );
    END IF;

    -- Authorize user (operator or admin)
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate business inputs
    IF p_customer_name IS NULL OR pg_catalog.btrim(p_customer_name) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_customer_name',
            'message', 'Nome cliente obbligatorio'
        );
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', 'Importo deve essere un numero reale positivo finito'
        );
    END IF;

    -- Normalize amount to two decimals and validate
    v_amount := pg_catalog.round(p_amount, 2);
    IF v_amount <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', 'Importo deve essere un numero reale positivo finito'
        );
    END IF;

    -- Normalize parameters
    v_product := COALESCE(pg_catalog.btrim(p_product), 'Gasolio');
    v_notes := COALESCE(pg_catalog.btrim(p_notes), '');
    v_created_at := pg_catalog.now();

    v_payload := pg_catalog.jsonb_build_object(
        'action_type', 'create_credit_transaction',
        'operator_id', v_operator_id,
        'station_id', p_station_id,
        'customer_name', pg_catalog.btrim(p_customer_name),
        'amount', v_amount,
        'product', v_product,
        'notes', v_notes
    );

    -- Insert marker / idempotency check before side effects
    INSERT INTO public.processed_requests (
        request_id,
        action_type,
        payload,
        response,
        created_at
    )
    VALUES (
        pg_catalog.btrim(p_request_id),
        'create_credit_transaction',
        v_payload,
        NULL,
        pg_catalog.now()
    )
    ON CONFLICT (request_id) DO NOTHING
    RETURNING true INTO v_request_inserted;

    IF NOT COALESCE(v_request_inserted, false) THEN
        SELECT action_type, payload, response
        INTO v_existing_action_type, v_existing_payload, v_result
        FROM public.processed_requests
        WHERE request_id = pg_catalog.btrim(p_request_id);

        IF FOUND THEN
            IF v_existing_action_type = 'create_credit_transaction' AND v_existing_payload = v_payload THEN
                IF v_result IS NULL THEN
                    RETURN pg_catalog.jsonb_build_object(
                        'success', false,
                        'error', 'request_in_progress',
                        'message', 'La richiesta è in elaborazione.'
                    );
                ELSE
                    RETURN v_result;
                END IF;
            ELSE
                RETURN pg_catalog.jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
                );
            END IF;
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'request_id_collision',
            'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
        );
    END IF;

    -- Atomically insert/update customer balance
    INSERT INTO public.crediti_clienti (
        station_id,
        cliente,
        saldo,
        importo,
        created_at,
        updated_at
    )
    VALUES (
        p_station_id,
        pg_catalog.btrim(p_customer_name),
        v_amount,
        0,
        v_created_at,
        v_created_at
    )
    ON CONFLICT (station_id, pg_catalog.lower(pg_catalog.btrim(cliente))) WHERE station_id IS NOT NULL
    DO UPDATE SET
        saldo = public.crediti_clienti.saldo + v_amount,
        updated_at = v_created_at
    RETURNING id, saldo INTO v_customer_id, v_new_balance;

    -- Record credit movement
    INSERT INTO public.crediti_movimenti (
        cliente_id,
        station_id,
        operator_id,
        tipo,
        importo,
        metodo,
        note,
        created_at
    )
    VALUES (
        v_customer_id,
        p_station_id,
        v_operator_id,
        'credito',
        v_amount,
        'credito',
        v_product || ' - ' || v_notes,
        v_created_at
    );

    -- Record cash register movement
    INSERT INTO public.movimenti_cassa (
        station_id,
        operator_id,
        tipo,
        importo,
        descrizione,
        created_at
    )
    VALUES (
        p_station_id,
        v_operator_id,
        'credito',
        v_amount,
        'Credito: ' || pg_catalog.btrim(p_customer_name) || ' (' || v_product || ')' || CASE WHEN v_notes <> '' THEN ' - ' || v_notes ELSE '' END,
        v_created_at
    );

    -- Persist success response in processed_requests and return
    v_result := pg_catalog.jsonb_build_object(
        'success', true,
        'customer_id', v_customer_id,
        'new_balance', v_new_balance
    );

    UPDATE public.processed_requests
    SET response = v_result
    WHERE request_id = pg_catalog.btrim(p_request_id)
      AND action_type = 'create_credit_transaction';

    RETURN v_result;
END;
$$;

-- 2. Create OR Replace RPC public.register_credit_payment
CREATE OR REPLACE FUNCTION public.register_credit_payment(
    p_request_id text,
    p_station_id integer,
    p_customer_id integer,
    p_amount numeric,
    p_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_operator_id integer;
    v_customer_id integer;
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
    v_created_at timestamp with time zone;
    v_amount numeric;
BEGIN
    -- Authenticate user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_operator_id := public.current_user_id();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate request ID
    IF p_request_id IS NULL OR pg_catalog.btrim(p_request_id) = '' OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_request_id',
            'message', 'ID richiesta non valido o troppo lungo'
        );
    END IF;

    -- Validate station ID
    IF p_station_id IS NULL OR p_station_id <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_station_id',
            'message', 'ID stazione non valido o non positivo'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.fuel_stations
        WHERE station_id = p_station_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'station_not_found',
            'message', 'Stazione non trovata'
        );
    END IF;

    -- Authorize user (operator or admin)
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = v_operator_id
          AND us.station_id = p_station_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Validate customer ID
    IF p_customer_id IS NULL OR p_customer_id <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_customer_id',
            'message', 'ID cliente non valido'
        );
    END IF;

    -- Validate business inputs
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', 'Importo deve essere un numero reale positivo finito'
        );
    END IF;

    -- Normalize amount to two decimals and validate
    v_amount := pg_catalog.round(p_amount, 2);
    IF v_amount <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', 'Importo deve essere un numero reale positivo finito'
        );
    END IF;

    IF p_method IS NULL OR pg_catalog.lower(pg_catalog.btrim(p_method)) NOT IN ('contanti', 'pos', 'uta') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'invalid_payment_method',
            'message', 'Metodo di pagamento non valido. Valori ammessi: contanti, pos, uta'
        );
    END IF;

    -- Normalize parameters
    v_method := pg_catalog.lower(pg_catalog.btrim(p_method));
    v_created_at := pg_catalog.now();

    v_payload := pg_catalog.jsonb_build_object(
        'action_type', 'register_credit_payment',
        'operator_id', v_operator_id,
        'station_id', p_station_id,
        'customer_id', p_customer_id,
        'amount', v_amount,
        'method', v_method
    );

    -- Insert marker / idempotency check before side effects
    INSERT INTO public.processed_requests (
        request_id,
        action_type,
        payload,
        response,
        created_at
    )
    VALUES (
        pg_catalog.btrim(p_request_id),
        'register_credit_payment',
        v_payload,
        NULL,
        pg_catalog.now()
    )
    ON CONFLICT (request_id) DO NOTHING
    RETURNING true INTO v_request_inserted;

    IF NOT COALESCE(v_request_inserted, false) THEN
        SELECT action_type, payload, response
        INTO v_existing_action_type, v_existing_payload, v_result
        FROM public.processed_requests
        WHERE request_id = pg_catalog.btrim(p_request_id);

        IF FOUND THEN
            IF v_existing_action_type = 'register_credit_payment' AND v_existing_payload = v_payload THEN
                IF v_result IS NULL THEN
                    RETURN pg_catalog.jsonb_build_object(
                        'success', false,
                        'error', 'request_in_progress',
                        'message', 'La richiesta è in elaborazione.'
                    );
                ELSE
                    RETURN v_result;
                END IF;
            ELSE
                RETURN pg_catalog.jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
                );
            END IF;
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'request_id_collision',
            'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
        );
    END IF;

    -- Lock customer row and fetch details to ensure isolation and distinguish mismatch from insufficient balance
    SELECT id, cliente, saldo
    INTO v_customer_id, v_customer_name, v_customer_saldo
    FROM public.crediti_clienti
    WHERE id = p_customer_id
      AND station_id = p_station_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_result := pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'customer_not_found',
            'message', 'Cliente non trovato per la stazione specificata'
        );
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = pg_catalog.btrim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    IF v_customer_saldo < v_amount THEN
        v_result := pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'insufficient_balance',
            'message', 'Saldo insufficiente per registrare il pagamento'
        );
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = pg_catalog.btrim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    -- Perform balance update atomic decrement
    UPDATE public.crediti_clienti
    SET saldo = saldo - v_amount,
        updated_at = v_created_at
    WHERE id = p_customer_id
      AND station_id = p_station_id
      AND saldo >= v_amount
    RETURNING saldo INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        v_result := pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'insufficient_balance',
            'message', 'Saldo insufficiente per registrare il pagamento'
        );
        UPDATE public.processed_requests
        SET response = v_result
        WHERE request_id = pg_catalog.btrim(p_request_id)
          AND action_type = 'register_credit_payment';
        RETURN v_result;
    END IF;

    -- Map payment method to movement type
    v_movement_type := CASE
        WHEN v_method = 'pos' THEN 'incasso_pos'
        WHEN v_method = 'uta' THEN 'incasso_uta'
        ELSE 'incasso'
    END;

    -- Record credit payment movement
    INSERT INTO public.crediti_movimenti (
        cliente_id,
        station_id,
        operator_id,
        tipo,
        importo,
        metodo,
        created_at
    )
    VALUES (
        p_customer_id,
        p_station_id,
        v_operator_id,
        v_movement_type,
        v_amount,
        v_method,
        v_created_at
    );

    -- Record cash register movement
    INSERT INTO public.movimenti_cassa (
        station_id,
        operator_id,
        tipo,
        importo,
        descrizione,
        created_at
    )
    VALUES (
        p_station_id,
        v_operator_id,
        v_movement_type,
        v_amount,
        'Pagamento Credito: ' || v_customer_name || ' (' || v_method || ')',
        v_created_at
    );

    -- Persist success response in processed_requests and return
    v_result := pg_catalog.jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance
    );

    UPDATE public.processed_requests
    SET response = v_result
    WHERE request_id = pg_catalog.btrim(p_request_id)
      AND action_type = 'register_credit_payment';

    RETURN v_result;
END;
$$;

-- 3. Revoke/Grant permissions for functions
REVOKE EXECUTE ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text) TO authenticated;

COMMIT;
