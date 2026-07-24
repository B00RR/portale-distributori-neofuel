-- Migration: Issue #313 — Isolamento e integrità fatture
--
-- Rafforza il flusso fatture attivo senza station-scope su clienti/targhe:
-- - collega le nuove fatture al turno risolto server-side;
-- - limita le mutazioni alle RPC e ai turni realmente open;
-- - abilita i ruoli backoffice fatture previsti dalla UI;
-- - preserva l'idempotenza con collision/in-progress fail-closed;
-- - consente replay offline nuovi entro 24 ore, con tolleranza futura di 5 minuti;
-- - dismette l'accesso client alla tabella legacy invoice_requests.
--
-- Requires downtime: No.
-- Requires data backfill: No.

BEGIN;

-- ============================================================================
-- 1. invoices.shift_id: nullable bigint, FK e indice con drift detection
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shift_id bigint;

DO $$
DECLARE
    v_type oid;
    v_not_null boolean;
    v_generated "char";
    v_identity "char";
    v_has_default boolean;
    v_shift_attnum smallint;
    v_shift_id_attnum smallint;
    v_constraint_def text;
    v_fk_valid boolean;
    v_index_def text;
    v_index_valid boolean;
BEGIN
    SELECT a.atttypid, a.attnotnull, a.attgenerated, a.attidentity, a.atthasdef
    INTO v_type, v_not_null, v_generated, v_identity, v_has_default
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.invoices'::regclass
      AND a.attname = 'shift_id'
      AND NOT a.attisdropped;

    IF v_type IS DISTINCT FROM 'pg_catalog.int8'::regtype
       OR v_not_null
       OR v_generated IS DISTINCT FROM ''
       OR v_identity IS DISTINCT FROM ''
       OR v_has_default THEN
        RAISE EXCEPTION 'Schema drift: public.invoices.shift_id must be nullable plain bigint without identity, generation, or default';
    END IF;

    SELECT a.attnum
    INTO v_shift_attnum
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.invoices'::regclass
      AND a.attname = 'shift_id'
      AND NOT a.attisdropped;

    SELECT a.attnum
    INTO v_shift_id_attnum
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.shifts'::regclass
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    SELECT
        pg_catalog.pg_get_constraintdef(c.oid, true),
        c.contype = 'f'
        AND c.confrelid = 'public.shifts'::regclass
        AND c.conkey = ARRAY[v_shift_attnum]::smallint[]
        AND c.confkey = ARRAY[v_shift_id_attnum]::smallint[]
        AND c.confmatchtype = 's'
        AND c.confupdtype = 'a'
        AND c.confdeltype = 'n'
        AND NOT c.condeferrable
        AND NOT c.condeferred
        AND c.convalidated
    INTO v_constraint_def, v_fk_valid
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.invoices'::regclass
      AND c.conname = 'fk_invoices_shift_id';

    IF v_constraint_def IS NULL THEN
        ALTER TABLE public.invoices
        ADD CONSTRAINT fk_invoices_shift_id
        FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;
    ELSIF NOT COALESCE(v_fk_valid, false) THEN
        RAISE EXCEPTION 'Schema drift: fk_invoices_shift_id has unexpected definition: %', v_constraint_def;
    END IF;

    SELECT
        CASE
            WHEN idx.relkind = 'i' THEN pg_catalog.pg_get_indexdef(idx.oid)
            ELSE format('%s %I.%I', idx.relkind, ns.nspname, idx.relname)
        END,
        idx.relkind = 'i'
        AND i.indrelid = 'public.invoices'::regclass
        AND am.amname = 'btree'
        AND NOT i.indisunique
        AND NOT i.indisprimary
        AND NOT i.indisexclusion
        AND i.indisvalid
        AND i.indisready
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND i.indkey::text = v_shift_attnum::text
        AND i.indcollation::text = '0'
        AND i.indoption::text = '0'
        AND i.indclass::text = (
            SELECT opc.oid::text
            FROM pg_catalog.pg_opclass opc
            JOIN pg_catalog.pg_am expected_am ON expected_am.oid = opc.opcmethod
            JOIN pg_catalog.pg_namespace opc_ns ON opc_ns.oid = opc.opcnamespace
            WHERE expected_am.amname = 'btree'
              AND opc_ns.nspname = 'pg_catalog'
              AND opc.opcname = 'int8_ops'
        )
    INTO v_index_def, v_index_valid
    FROM pg_catalog.pg_class idx
    JOIN pg_catalog.pg_namespace ns ON ns.oid = idx.relnamespace
    LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = idx.oid
    LEFT JOIN pg_catalog.pg_am am ON am.oid = idx.relam
    WHERE ns.nspname = 'public'
      AND idx.relname = 'idx_invoices_shift_id';

    IF v_index_def IS NULL THEN
        CREATE INDEX idx_invoices_shift_id ON public.invoices(shift_id);
    ELSIF NOT COALESCE(v_index_valid, false) THEN
        RAISE EXCEPTION 'Schema drift: idx_invoices_shift_id has unexpected definition: %', v_index_def;
    END IF;
END $$;

-- ============================================================================
-- 2. Dismissione accesso client alla tabella legacy invoice_requests
-- ============================================================================

REVOKE ALL ON public.invoice_requests FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'invoice_requests'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.invoice_requests', r.policyname);
    END LOOP;
END $$;

-- ============================================================================
-- 3. Privilegi tabella e ruolo backoffice fatture
-- ============================================================================

REVOKE ALL ON public.clienti_fatturazione FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.targhe_cliente FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoices FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.clienti_fatturazione TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.targhe_cliente TO authenticated;
GRANT SELECT ON public.invoices TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_invoices()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.created_by_auth = auth.uid()
          AND u.role IN ('admin', 'super_admin', 'full_admin', 'billing', 'accounting')
          AND u.is_active IS DISTINCT FROM FALSE
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_invoices() TO authenticated, service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_select_admin_or_station ON public.invoices;
DROP POLICY IF EXISTS invoices_select_backoffice_or_station ON public.invoices;
CREATE POLICY invoices_select_backoffice_or_station
ON public.invoices
FOR SELECT
TO authenticated
USING (
    public.can_manage_invoices()
    OR EXISTS (
        SELECT 1
        FROM public.user_stations us
        WHERE us.user_id = public.current_user_id()
          AND us.station_id = invoices.station_id
    )
);

ALTER TABLE public.clienti_fatturazione ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clienti_fatturazione_select_invoice_backoffice ON public.clienti_fatturazione;
CREATE POLICY clienti_fatturazione_select_invoice_backoffice
ON public.clienti_fatturazione
FOR SELECT
TO authenticated
USING (public.can_manage_invoices());

-- L'helper interno non deve esporre risposte idempotenti agli utenti finali.
REVOKE ALL ON FUNCTION public.check_request_idempotency(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_request_idempotency(text, text, jsonb, text) TO service_role;

-- ============================================================================
-- 4. create_invoice_request: identità, idempotenza, finestra offline e lock
-- ============================================================================

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
    -- NULL mantiene stabile il fingerprint quando il client omette il timestamp;
    -- il tempo effettivo viene assegnato server-side solo alle richieste nuove.
    p_created_at timestamptz DEFAULT NULL
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
    v_target_created_at timestamptz;
    v_shift_id bigint;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT public.is_admin() THEN
        IF p_operator_id IS NULL OR p_operator_id <> public.current_user_id() THEN
            RAISE EXCEPTION 'Unauthorized: operator_id mismatch';
        END IF;

        IF p_station_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = p_station_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized for station';
        END IF;
    END IF;

    IF p_station_id IS NULL THEN
        RAISE EXCEPTION 'Station ID is required';
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

    -- I replay completati vengono risolti prima dei limiti temporali.
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
            IF v_fingerprint_mismatch THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Request ID gia usato con parametri diversi'
                );
            END IF;

            IF v_existing IS NOT NULL THEN
                RETURN v_existing;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'request_in_progress',
                'request_id', trim(p_request_id)
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
            v_existing := NULL;
            v_fingerprint_mismatch := false;

            SELECT existing_response, fingerprint_mismatch
            INTO v_existing, v_fingerprint_mismatch
            FROM public.check_request_idempotency(
                trim(p_request_id),
                'create_invoice_request',
                v_payload,
                v_fingerprint
            );

            IF v_fingerprint_mismatch THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'request_id_collision',
                    'message', 'Request ID gia usato con parametri diversi'
                );
            END IF;

            IF v_existing IS NOT NULL THEN
                RETURN v_existing;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'request_in_progress',
                'request_id', trim(p_request_id)
            );
        END IF;
    END IF;

    IF p_amount IS NULL
       OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    IF NULLIF(trim(p_payment_method), '') IS NULL THEN
        RAISE EXCEPTION 'Payment method is required';
    END IF;

    v_target_created_at := COALESCE(p_created_at, now());

    IF v_target_created_at > now() + interval '5 minutes' THEN
        RAISE EXCEPTION 'Invoice timestamp is too far in the future';
    END IF;

    IF v_target_created_at < now() - interval '24 hours' THEN
        RAISE EXCEPTION 'Invoice timestamp exceeds the 24 hour offline replay window';
    END IF;

    SELECT s.id
    INTO v_shift_id
    FROM public.shifts s
    WHERE s.station_id = p_station_id
      AND s.opened_at <= v_target_created_at
      AND (
          -- Un turno partial resta valido per registrazioni/replay nel suo intervallo,
          -- ma le RPC di mutazione sotto lo trattano intenzionalmente come read-only.
          (
              s.status IN ('open', 'partial')
              AND (s.closed_at IS NULL OR v_target_created_at <= s.closed_at)
          )
          OR (
              s.status = 'closed'
              AND s.closed_at IS NOT NULL
              AND v_target_created_at <= s.closed_at
          )
      )
    ORDER BY s.opened_at DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'No matching shift found for station % at %', p_station_id, v_target_created_at;
    END IF;

    INSERT INTO public.invoices (
        station_id,
        operator_id,
        shift_id,
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
        v_shift_id,
        p_cliente_id,
        p_customer_name,
        p_amount,
        trim(p_payment_method),
        p_product_category,
        p_description,
        'pending',
        v_target_created_at,
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
GRANT EXECUTE ON FUNCTION public.create_invoice_request(text, integer, integer, integer, text, numeric, text, text, text, text, text, timestamptz) TO authenticated, service_role;

-- ============================================================================
-- 5. Mutazioni: lock fattura -> lock turno, autorizzazione e lifecycle open
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_shift_invoice(
    p_invoice_id bigint,
    p_amount numeric,
    p_payment_method text,
    p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv record;
    v_shift_status text;
    v_shift_closed_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT i.id, i.station_id, i.operator_id, i.shift_id
    INTO v_inv
    FROM public.invoices i
    WHERE i.id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_inv.shift_id IS NULL THEN
        RAISE EXCEPTION 'Cannot edit invoice of an unlinked shift';
    END IF;

    SELECT s.status, s.closed_at
    INTO v_shift_status, v_shift_closed_at
    FROM public.shifts s
    WHERE s.id = v_inv.shift_id
    FOR UPDATE;

    IF NOT FOUND OR v_shift_status <> 'open' OR v_shift_closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot edit invoice unless its shift is open';
    END IF;

    IF NOT public.can_manage_invoices() THEN
        IF v_inv.operator_id IS NULL OR v_inv.operator_id <> public.current_user_id() THEN
            RAISE EXCEPTION 'Unauthorized: cannot edit invoice created by another operator';
        END IF;

        IF v_inv.station_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = v_inv.station_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized for station';
        END IF;
    END IF;

    IF p_amount IS NULL
       OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    IF NULLIF(trim(p_payment_method), '') IS NULL THEN
        RAISE EXCEPTION 'Payment method is required';
    END IF;

    UPDATE public.invoices
    SET amount = p_amount,
        payment_method = trim(p_payment_method),
        description = p_description,
        updated_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_shift_invoice(bigint, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shift_invoice(bigint, numeric, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_shift_invoice(
    p_invoice_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv record;
    v_shift_status text;
    v_shift_closed_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT i.id, i.station_id, i.operator_id, i.shift_id
    INTO v_inv
    FROM public.invoices i
    WHERE i.id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_inv.shift_id IS NULL THEN
        RAISE EXCEPTION 'Cannot delete invoice of an unlinked shift';
    END IF;

    SELECT s.status, s.closed_at
    INTO v_shift_status, v_shift_closed_at
    FROM public.shifts s
    WHERE s.id = v_inv.shift_id
    FOR UPDATE;

    IF NOT FOUND OR v_shift_status <> 'open' OR v_shift_closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot delete invoice unless its shift is open';
    END IF;

    IF NOT public.can_manage_invoices() THEN
        IF v_inv.operator_id IS NULL OR v_inv.operator_id <> public.current_user_id() THEN
            RAISE EXCEPTION 'Unauthorized: cannot delete invoice created by another operator';
        END IF;

        IF v_inv.station_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.user_stations us
            WHERE us.user_id = public.current_user_id()
              AND us.station_id = v_inv.station_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized for station';
        END IF;
    END IF;

    DELETE FROM public.invoices WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_shift_invoice(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shift_invoice(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_invoice_status(
    p_invoice_id bigint,
    p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_invoices() THEN
        RAISE EXCEPTION 'Unauthorized: invoice backoffice role required';
    END IF;

    IF p_new_status IS NULL OR p_new_status NOT IN ('pending', 'completed') THEN
        RAISE EXCEPTION 'Invalid status';
    END IF;

    UPDATE public.invoices
    SET status = p_new_status,
        updated_at = now()
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_invoice_status(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_status(bigint, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
