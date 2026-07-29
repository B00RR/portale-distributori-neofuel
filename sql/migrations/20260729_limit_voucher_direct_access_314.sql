-- Migration: Issue #314 — Limitare l’accesso diretto ai codici voucher
--
-- What it does:
-- 1. Revokes all direct table access privileges on `public.vouchers` and `public.voucher_batches` from `PUBLIC`, `anon`, and `authenticated`.
-- 2. Grants explicit `SELECT, INSERT, UPDATE, DELETE` to `authenticated` on both tables.
-- 3. Idempotently drops obsolete/permissive RLS policies on `public.vouchers` and `public.voucher_batches`.
-- 4. Recreates strict RLS policies on `public.vouchers` and `public.voucher_batches` restricting direct table management to administrators (`is_admin()`), with `WITH CHECK` on `FOR ALL`.
-- 5. Preserves the restrictive policy `enforce_active_user` on both tables.
-- 6. Idempotently drops obsolete 4-parameter overload `redeem_voucher_validated(text, integer, uuid, text)`.
-- 7. Introduces private helper `_resolve_voucher_candidate(text, integer, boolean)` for station-scoped, safe literal voucher candidate lookup.
-- 8. Introduces read-only `SECURITY DEFINER` RPC `validate_voucher_for_preview(text, integer)` for safe client voucher preview without direct SELECT.
-- 9. Introduces read-only `SECURITY DEFINER` RPC `get_shift_vouchers(integer, bigint)` for operator summary without direct SELECT.
-- 10. Hardens `redeem_voucher_validated(text, integer, uuid, text, bigint)` with `SECURITY DEFINER`, `SET search_path = ''`, auth checks, station-scoping, shift FOR UPDATE lock, voucher FOR UPDATE lock, and strict replay-before-state idempotency.
--
-- Requires downtime: No.
-- Requires data backfill: No.

BEGIN;

-- ============================================================================
-- 1. Table RLS enablement and privilege revocation/grant
-- ============================================================================

ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.voucher_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vouchers FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;

-- ============================================================================
-- 2. Drop obsolete / overly permissive policies on voucher_batches and vouchers
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage batches" ON public.voucher_batches;
DROP POLICY IF EXISTS "Authenticated users can read batches" ON public.voucher_batches;
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.voucher_batches;
DROP POLICY IF EXISTS "voucher_batches_admin_all" ON public.voucher_batches;
DROP POLICY IF EXISTS "voucher_batches_select_admin" ON public.voucher_batches;

DROP POLICY IF EXISTS "Admins can manage vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Authenticated users can view vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_admin_all" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers_select_admin" ON public.vouchers;

-- ============================================================================
-- 3. Recreate admin-only RLS policies
-- ============================================================================

CREATE POLICY "Admins can manage batches"
  ON public.voucher_batches
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage vouchers"
  ON public.vouchers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 4. Remove obsolete 4-parameter RPC overload
-- ============================================================================

DROP FUNCTION IF EXISTS public.redeem_voucher_validated(text, integer, uuid, text);

-- ============================================================================
-- 5. Private Safe Voucher Candidate Resolution Helper: _resolve_voucher_candidate
-- ============================================================================

CREATE OR REPLACE FUNCTION public._resolve_voucher_candidate(
    p_voucher_code text,
    p_station_id integer,
    p_for_update boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    code text,
    amount numeric,
    status text,
    expiration_date date,
    redeemed_at timestamptz,
    station_id bigint,
    batch_id uuid,
    match_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_clean_code text;
    v_count integer;
    v_rec record;
BEGIN
    v_clean_code := upper(trim(COALESCE(p_voucher_code, '')));

    -- Reject empty input or codes containing wildcards (%), (_), spaces, or invalid chars.
    -- Allowed characters: uppercase A-Z, 0-9, hyphen '-'
    IF v_clean_code = '' OR v_clean_code ~ '[%_\s]' OR v_clean_code !~ '^[A-Z0-9-]+$' THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::text, NULL::date, NULL::timestamptz, NULL::bigint, NULL::uuid, 0;
        RETURN;
    END IF;

    -- 1. Try exact match filtered server-side by station authorization (station_id = p_station_id OR station_id IS NULL)
    IF p_for_update THEN
        SELECT v.id, v.code, v.amount, v.status, v.expiration_date, v.redeemed_at, v.station_id, v.batch_id
        INTO v_rec
        FROM public.vouchers v
        WHERE v.code = v_clean_code
          AND (v.station_id = p_station_id OR v.station_id IS NULL)
        FOR UPDATE OF v;
    ELSE
        SELECT v.id, v.code, v.amount, v.status, v.expiration_date, v.redeemed_at, v.station_id, v.batch_id
        INTO v_rec
        FROM public.vouchers v
        WHERE v.code = v_clean_code
          AND (v.station_id = p_station_id OR v.station_id IS NULL);
    END IF;

    IF FOUND THEN
        RETURN QUERY SELECT v_rec.id, v_rec.code, v_rec.amount, v_rec.status, v_rec.expiration_date, v_rec.redeemed_at, v_rec.station_id, v_rec.batch_id, 1;
        RETURN;
    END IF;

    -- 2. Fallback to short prefix ONLY IF code length is exactly 4 and matches 4-character business short code format (^[A-Z0-9]{4}$)
    IF length(v_clean_code) = 4 AND v_clean_code ~ '^[A-Z0-9]{4}$' THEN
        -- Count candidate matches for authorized station only using safe literal equality left(v.code, 4) = v_clean_code
        SELECT COUNT(*)
        INTO v_count
        FROM public.vouchers v
        WHERE left(v.code, 4) = v_clean_code
          AND (v.station_id = p_station_id OR v.station_id IS NULL);

        IF v_count = 1 THEN
            IF p_for_update THEN
                SELECT v.id, v.code, v.amount, v.status, v.expiration_date, v.redeemed_at, v.station_id, v.batch_id
                INTO v_rec
                FROM public.vouchers v
                WHERE left(v.code, 4) = v_clean_code
                  AND (v.station_id = p_station_id OR v.station_id IS NULL)
                FOR UPDATE OF v;
            ELSE
                SELECT v.id, v.code, v.amount, v.status, v.expiration_date, v.redeemed_at, v.station_id, v.batch_id
                INTO v_rec
                FROM public.vouchers v
                WHERE left(v.code, 4) = v_clean_code
                  AND (v.station_id = p_station_id OR v.station_id IS NULL);
            END IF;

            RETURN QUERY SELECT v_rec.id, v_rec.code, v_rec.amount, v_rec.status, v_rec.expiration_date, v_rec.redeemed_at, v_rec.station_id, v_rec.batch_id, 1;
            RETURN;
        ELSIF v_count > 1 THEN
            RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::text, NULL::date, NULL::timestamptz, NULL::bigint, NULL::uuid, v_count;
            RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::text, NULL::date, NULL::timestamptz, NULL::bigint, NULL::uuid, 0;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_voucher_candidate(text, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. Read-Only Preview RPC: validate_voucher_for_preview
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_voucher_for_preview(
    p_voucher_code text,
    p_station_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_voucher record;
    v_local_operator_id integer;
    v_customer_name text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.current_user_is_active() THEN
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

    -- Safe candidate resolution
    SELECT * INTO v_voucher
    FROM public._resolve_voucher_candidate(p_voucher_code, p_station_id, false);

    IF v_voucher.match_count > 1 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Più voucher corrispondono al codice: inserisci il codice completo.'
        );
    END IF;

    IF v_voucher.id IS NULL OR v_voucher.match_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Codice non trovato.');
    END IF;

    -- Batch customer name
    IF v_voucher.batch_id IS NOT NULL THEN
        SELECT vb.customer_name
        INTO v_customer_name
        FROM public.voucher_batches vb
        WHERE vb.id = v_voucher.batch_id;
    END IF;

    -- Status & Expiration
    IF v_voucher.status = 'redeemed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher già riscattato',
            'reason', 'redeemed',
            'redeemed_at', v_voucher.redeemed_at,
            'code', v_voucher.code,
            'amount', v_voucher.amount,
            'customer_name', v_customer_name
        );
    END IF;

    IF v_voucher.status = 'expired' OR (v_voucher.expiration_date IS NOT NULL AND v_voucher.expiration_date < current_date) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher scaduto',
            'reason', 'expired',
            'expiration_date', v_voucher.expiration_date,
            'code', v_voucher.code,
            'amount', v_voucher.amount,
            'customer_name', v_customer_name
        );
    END IF;

    IF v_voucher.status = 'void' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher annullato',
            'reason', 'void',
            'code', v_voucher.code,
            'amount', v_voucher.amount,
            'customer_name', v_customer_name
        );
    END IF;

    IF v_voucher.status IS NOT NULL AND v_voucher.status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Voucher non riscattabile',
            'reason', 'invalid_status',
            'code', v_voucher.code,
            'amount', v_voucher.amount,
            'customer_name', v_customer_name
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', v_voucher.code,
        'amount', v_voucher.amount,
        'status', v_voucher.status,
        'expiration_date', v_voucher.expiration_date,
        'customer_name', v_customer_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_voucher_for_preview(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_voucher_for_preview(text, integer) TO authenticated;

-- ============================================================================
-- 7. Read-Only Shift Vouchers RPC for Summary: get_shift_vouchers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_shift_vouchers(
    p_station_id integer,
    p_shift_id bigint
)
RETURNS TABLE (
    id uuid,
    code text,
    amount numeric,
    redeemed_at timestamptz,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_local_operator_id integer;
    v_shift_station_id integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.current_user_is_active() THEN
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

    -- Verify shift belongs to station
    SELECT s.station_id
    INTO v_shift_station_id
    FROM public.shifts s
    WHERE s.id = p_shift_id;

    IF v_shift_station_id IS NULL OR v_shift_station_id <> p_station_id THEN
        RAISE EXCEPTION 'Shift does not belong to station';
    END IF;

    RETURN QUERY
    SELECT v.id, v.code, v.amount, v.redeemed_at, v.status
    FROM public.vouchers v
    WHERE v.station_id = p_station_id
      AND v.shift_id = p_shift_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shift_vouchers(integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shift_vouchers(integer, bigint) TO authenticated;

-- ============================================================================
-- 8. Harden server-authoritative redeem_voucher_validated RPC
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
    v_shift record;
    v_local_operator_id integer;
    v_request_inserted boolean;
    v_existing_fingerprint text;
    v_existing_response jsonb;
    v_payload jsonb;
    v_fingerprint text;
    v_res jsonb;
BEGIN
    -- 1. Auth & Active checks
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.current_user_is_active() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_operator_id IS NOT NULL AND p_operator_id <> auth.uid() THEN
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

    -- 2. Mandatory shift check for non-admin operators
    IF p_shift_id IS NULL AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'ID turno obbligatorio');
    END IF;

    -- 3. Construct payload and fingerprint BEFORE any mutable state checks or locks
    v_payload := jsonb_build_object(
        'voucher_code', upper(trim(COALESCE(p_voucher_code, ''))),
        'station_id', p_station_id,
        'operator_id', auth.uid(),
        'shift_id', p_shift_id
    );
    v_fingerprint := md5(v_payload::text);

    -- 4. Idempotency Check & Reservation BEFORE checking mutable state
    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
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
            SELECT pr.payload_fingerprint, pr.response
            INTO v_existing_fingerprint, v_existing_response
            FROM public.processed_requests pr
            WHERE pr.request_id = trim(p_request_id);

            IF FOUND THEN
                IF v_existing_fingerprint <> v_fingerprint THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'request_id_collision',
                        'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
                    );
                END IF;

                IF v_existing_response IS NOT NULL THEN
                    RETURN v_existing_response;
                ELSE
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'request_in_progress',
                        'message', 'La richiesta è in elaborazione o incompleta.'
                    );
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'request_id_collision',
                'message', 'Il codice richiesta è già stato utilizzato per un''altra operazione.'
            );
        END IF;
    END IF;

    -- 5. Lock Shift FOR UPDATE (Lock hierarchy: shift -> voucher)
    IF p_shift_id IS NOT NULL THEN
        SELECT s.id, s.station_id, s.status
        INTO v_shift
        FROM public.shifts s
        WHERE s.id = p_shift_id
        FOR UPDATE;

        IF v_shift.id IS NULL THEN
            v_res := jsonb_build_object('success', false, 'error', 'Turno non trovato');
            IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
                UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
            END IF;
            RETURN v_res;
        END IF;

        IF v_shift.station_id <> p_station_id THEN
            v_res := jsonb_build_object('success', false, 'error', 'Turno non appartenente alla stazione');
            IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
                UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
            END IF;
            RETURN v_res;
        END IF;

        IF v_shift.status <> 'open' THEN
            v_res := jsonb_build_object('success', false, 'error', 'Turno non aperto');
            IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
                UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
            END IF;
            RETURN v_res;
        END IF;
    END IF;

    -- 6. Lock Candidate Voucher FOR UPDATE
    SELECT * INTO v_voucher
    FROM public._resolve_voucher_candidate(p_voucher_code, p_station_id, true);

    IF v_voucher.match_count > 1 THEN
        v_res := jsonb_build_object('success', false, 'error', 'Codice voucher ambiguo');
        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
        END IF;
        RETURN v_res;
    END IF;

    IF v_voucher.id IS NULL OR v_voucher.match_count = 0 THEN
        v_res := jsonb_build_object('success', false, 'error', 'Voucher non trovato');
        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
        END IF;
        RETURN v_res;
    END IF;

    -- 7. Validate voucher status
    IF v_voucher.status = 'redeemed' THEN
        v_res := jsonb_build_object(
            'success', false,
            'error', 'Voucher gia riscattato',
            'redeemed_at', v_voucher.redeemed_at
        );
        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
        END IF;
        RETURN v_res;
    END IF;

    IF v_voucher.status = 'expired'
       OR (v_voucher.expiration_date IS NOT NULL AND v_voucher.expiration_date < current_date) THEN
        v_res := jsonb_build_object('success', false, 'error', 'Voucher scaduto');
        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
        END IF;
        RETURN v_res;
    END IF;

    IF v_voucher.status = 'void' THEN
        v_res := jsonb_build_object('success', false, 'error', 'Voucher annullato');
        IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
            UPDATE public.processed_requests SET response = v_res WHERE request_id = trim(p_request_id);
        END IF;
        RETURN v_res;
    END IF;

    -- 8. Execute state mutations atomically
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

    v_res := jsonb_build_object(
        'success', true,
        'amount', v_voucher.amount,
        'code', v_voucher.code
    );

    IF NULLIF(trim(p_request_id), '') IS NOT NULL THEN
        UPDATE public.processed_requests
        SET response = v_res
        WHERE request_id = trim(p_request_id)
          AND action_type = 'redeem_voucher_validated';
    END IF;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher_validated(text, integer, uuid, text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
