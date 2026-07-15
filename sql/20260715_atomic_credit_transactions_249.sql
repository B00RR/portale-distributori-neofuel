-- Migration: atomic and idempotent credit transactions
-- Resolves: #249
--
-- This migration implements:
-- 1. An idempotent partial unique index on public.crediti_clienti to enforce unique customer names per station.
-- 2. Two SECURITY DEFINER functions with SET search_path = '': public.create_credit_transaction and public.register_credit_payment.
--    Both functions validate inputs, enforce auth/permissions, use request_id for idempotency via processed_requests,
--    and perform all database modifications atomically in a single transaction.
--
-- Downtime: none.
-- Data backfill: none.

BEGIN;

-- 1. Create expression-based unique partial index on crediti_clienti
CREATE UNIQUE INDEX IF NOT EXISTS crediti_clienti_station_cliente_uidx
ON public.crediti_clienti (station_id, pg_catalog.lower(pg_catalog.btrim(cliente)))
WHERE station_id IS NOT NULL;

-- 2. Create RPC public.create_credit_transaction
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

-- 3. Create RPC public.register_credit_payment
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

-- 4. Revoke EXECUTE on functions from PUBLIC/anon and grant to authenticated
REVOKE EXECUTE ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_transaction(text, integer, text, numeric, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_credit_payment(text, integer, integer, numeric, text) TO authenticated;

COMMIT;

-- ============================================================================
-- MANUAL VERIFICATION CASES (ROLLBACK-SAFE)
-- ============================================================================
--
-- 1. Exact Replay Verification
--    -- Prepare a mock processed request marker.
--    -- Note: operator_id in payload must correspond to public.current_user_id() for the authenticated user.
--    BEGIN;
--    INSERT INTO public.processed_requests (request_id, action_type, payload, response, created_at)
--    VALUES (
--        'test_req_replay_1',
--        'register_credit_payment',
--        '{"amount": 10.0, "method": "contanti", "customer_id": 99, "operator_id": 1, "action_type": "register_credit_payment", "station_id": 1}'::jsonb,
--        '{"success": true, "new_balance": 5.0}'::jsonb,
--        now()
--    );
--    -- Run payment with identical payload/request_id
--    -- Expected: Returns stored response '{"success": true, "new_balance": 5.0}' immediately, no side-effects.
--    SELECT public.register_credit_payment('test_req_replay_1', 1, 99, 10.0, 'contanti');
--    ROLLBACK;
--
-- 2. Payload Collision / Cross-Action Collision Verification
--    -- Note: operator_id in payload must correspond to public.current_user_id() for the authenticated user.
--    BEGIN;
--    INSERT INTO public.processed_requests (request_id, action_type, payload, response, created_at)
--    VALUES (
--        'test_req_collision_1',
--        'create_credit_transaction',
--        '{"amount": 100.0, "notes": "", "product": "Gasolio", "operator_id": 1, "action_type": "create_credit_transaction", "station_id": 1, "customer_name": "Mario Rossi"}'::jsonb,
--        '{"success": true, "customer_id": 2, "new_balance": 100.0}'::jsonb,
--        now()
--    );
--    -- Run payment with same request ID but different action/payload
--    -- Expected: Returns {"success": false, "error": "request_id_collision", "message": "..."}
--    SELECT public.register_credit_payment('test_req_collision_1', 1, 99, 50.0, 'pos');
--    -- Run create credit with different payload parameters
--    -- Expected: Returns {"success": false, "error": "request_id_collision", "message": "..."}
--    SELECT public.create_credit_transaction('test_req_collision_1', 1, 'Luigi Verdi', 100.0, 'Gasolio', '');
--    ROLLBACK;
--
-- 3. Concurrent Requests - Same Customer (No Lost Update / Overpayment Rollback)
--    BEGIN;
--    -- Insert a customer with initial balance 10.0
--    INSERT INTO public.crediti_clienti (id, station_id, cliente, saldo, importo)
--    VALUES (999, 1, 'Test Client Concurrent', 10.0, 0);
--    -- Perform payment of 6.0
--    -- Expected: Returns success: true, new_balance: 4.0
--    SELECT public.register_credit_payment('test_req_concurrent_a', 1, 999, 6.0, 'contanti');
--    -- Perform another payment of 5.0 on same client in same txn
--    -- Expected: Returns success: false, error: insufficient_balance, and updates processed_requests response.
--    SELECT public.register_credit_payment('test_req_concurrent_b', 1, 999, 5.0, 'contanti');
--    ROLLBACK;
--
-- 4. Concurrent First-Create (No Duplicate Customers)
--    BEGIN;
--    -- Attempt first creation
--    -- Expected: Success, customer ID returned, balance = 50.0
--    SELECT public.create_credit_transaction('test_req_create_a', 1, 'New Client X', 50.0, 'Gasolio', '');
--    -- Attempt second creation of same client with different request ID (e.g. race condition/parallel click)
--    -- Expected: Success, same customer ID returned, balance = 120.0 (50.0 + 70.0), no duplicates.
--    SELECT public.create_credit_transaction('test_req_create_b', 1, 'New Client X', 70.0, 'Gasolio', '');
--    ROLLBACK;
--
-- 5. Child Table Error Forced Rollback
--    -- Verify that if a downstream child table operation fails (e.g. crediti_movimenti),
--    -- the entire transaction is aborted, request_id is NOT saved, and updates are rolled back.
--    -- We simulate this with a temporary trigger that raises an exception.
--    -- Prerequisiti: fuel_stations esistente con station_id valido, user_stations con operatore abilitato per la stazione.
--    BEGIN;
--
--    -- 5.1 Create a temporary trigger function to force failure
--    CREATE OR REPLACE FUNCTION public.test_force_failure()
--    RETURNS trigger AS $$
--    BEGIN
--        RAISE EXCEPTION 'Simulated failure in child table';
--    END;
--    $$ LANGUAGE plpgsql;
--
--    -- 5.2 Attach trigger to public.crediti_movimenti
--    CREATE TRIGGER trg_test_force_failure
--    BEFORE INSERT ON public.crediti_movimenti
--    FOR EACH ROW EXECUTE FUNCTION public.test_force_failure();
--
--    -- 5.3 Attempt transaction. Note: Replace 1 with an existing station_id.
--    -- SELECT public.create_credit_transaction('test_rollback_req_1', 1, 'Cliente Rollback Test', 50.00, 'Gasolio', 'Test notes');
--    -- Expected result: The call fails with 'Simulated failure in child table'
--
--    -- 5.4 Rollback to revert all changes, automatically cleaning up temporary trigger and function.
--    ROLLBACK;
--
--
