-- Migration: Fix operator_id type mismatch
-- Problem: operator_id is INTEGER, but we are sending UUIDs (text).
-- Solution: Change column type to TEXT to support both legacy integers and new UUIDs.

BEGIN;

-- 1. crediti_movimenti
ALTER TABLE crediti_movimenti 
ALTER COLUMN operator_id TYPE text;

-- 2. movimenti_cassa
ALTER TABLE movimenti_cassa 
ALTER COLUMN operator_id TYPE text;

COMMIT;
