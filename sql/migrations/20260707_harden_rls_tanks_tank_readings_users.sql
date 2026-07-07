-- Migration: harden RLS on tanks and tank_readings after FK/type fixes
-- Issue references: schema audit 2026-07-07
-- Depends on: 20260707_fix_fk_type_mismatches_tank_readings_pistole.sql
-- Author: Hermes Agent
-- Created: 2026-07-07

BEGIN;

-- ============================================================
-- tanks: remove overly permissive authenticated ALL policy.
-- Admins can manage tanks; operators can only read.
-- Existing SELECT policy "tanks_select" already covers public/anonymous read.
-- ============================================================

DROP POLICY IF EXISTS "tanks_authenticated_all" ON public.tanks;

CREATE POLICY "tanks_admins_manage"
    ON public.tanks
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "tanks_operators_select"
    ON public.tanks
    FOR SELECT
    TO authenticated
    USING (is_operator());

-- ============================================================
-- tank_readings: restrict to admins (manage) and operators (read)
-- scoped to stations assigned to the operator. We use the helper
-- current_user_station_ids() if available; otherwise fall back
-- to is_operator() for read.
-- ============================================================

DROP POLICY IF EXISTS "tank_readings_authenticated_all" ON public.tank_readings;

CREATE POLICY "tank_readings_admins_manage"
    ON public.tank_readings
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'current_user_station_ids'
    ) THEN
        CREATE POLICY "tank_readings_operators_select"
            ON public.tank_readings
            FOR SELECT
            TO authenticated
            USING (station_id = ANY (current_user_station_ids()));
    ELSE
        CREATE POLICY "tank_readings_operators_select"
            ON public.tank_readings
            FOR SELECT
            TO authenticated
            USING (is_operator());
    END IF;
END $$;

-- ============================================================
-- tank_pump_usages: replace email-based insert policy with
-- deterministic station-operator check.
-- ============================================================

DROP POLICY IF EXISTS "Operators can insert tank_usages" ON public.tank_pump_usages;

CREATE POLICY "tank_pump_usages_operators_insert"
    ON public.tank_pump_usages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_operator()
        AND station_id = ANY (
            COALESCE(
                NULLIF(current_user_station_ids(), ARRAY[]::integer[]),
                ARRAY[station_id]
            )
        )
    );

-- ============================================================
-- users: replace JWT email-based SELECT policy with auth.uid() check.
-- Users can read only their own row.
-- ============================================================

DROP POLICY IF EXISTS "consolidated_users_select" ON public.users;

CREATE POLICY "users_select_own"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (created_by_auth = auth.uid());

NOTIFY pgrst, 'reload schema';

COMMIT;
