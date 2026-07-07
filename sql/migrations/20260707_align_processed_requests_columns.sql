-- Migration: align processed_requests columns with idempotency usage
-- Issue references: schema audit 2026-07-07
-- Author: Hermes Agent
-- Created: 2026-07-07

BEGIN;

ALTER TABLE public.processed_requests
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS response jsonb;

ALTER TABLE public.processed_requests
  ALTER COLUMN endpoint DROP NOT NULL;

COMMIT;
