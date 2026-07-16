-- Migration: support username-based authentication
-- Resolves: ad-hoc username+password login for beta
-- Author: Hermes Agent
-- Created: 2026-07-16
--
-- Description:
--   Updates the handle_new_user trigger to populate public.users.username
--   from the username field in auth.users user_metadata, falling back to
--   the local part of the auth email or a generated prefix.
--
-- Downtime: none.
-- Data backfill: existing rows are not changed; only new sign-ups use the new logic.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_username text;
BEGIN
  -- Preferisci username dai metadata; fallback alla parte locale dell'email Auth.
  v_username := COALESCE(
    NULLIF(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );

  -- Se per qualche motivo lo username è vuoto, genera uno dal UUID.
  IF v_username IS NULL OR v_username = '' THEN
    v_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;

  INSERT INTO public.users (username, email, full_name, role, password_hash, created_by_auth)
  VALUES (
    v_username,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Nuovo Utente'),
    COALESCE(new.raw_user_meta_data->>'role', 'operator'),
    'auth_controlled',
    new.id
  );
  RETURN new;
END;
$$;

COMMIT;
