-- Aether Migration: add the 'exhausted' campaign status.
--
-- A performance campaign whose budget pool is fully consumed is auto-closed to
-- 'exhausted' (see 20260602090001). Kept in its own migration so the new enum
-- value is committed before any later migration/function references it
-- (matches the existing transaction_type 'payout' pattern).

ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'exhausted';
