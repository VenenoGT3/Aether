-- Aether Migration: participation_status values for open-join clipping
--
-- Adds the 'active' and 'banned' participation_status values used by the
-- performance-clipping model (open join + creator bans).
--
-- IMPORTANT: this lives in its OWN migration (its own transaction) on purpose.
-- Postgres does not allow a newly added enum value to be *used* in the same
-- transaction that adds it. Subsequent migrations (clip-submit RLS, open-join
-- policy/trigger) reference 'active', so the value must be committed first.
-- The timestamp orders this before 20260602000000 (Phase 1) so the chain
-- applies cleanly on a fresh database.

ALTER TYPE public.participation_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.participation_status ADD VALUE IF NOT EXISTS 'banned';
