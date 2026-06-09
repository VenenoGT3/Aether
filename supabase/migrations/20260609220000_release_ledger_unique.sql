-- Aether Migration: one succeeded escrow release per participation.
--
-- releaseEscrowAction checks "already released?" before inserting the release
-- transaction, but two concurrent calls can both pass that read before either
-- writes (TOCTOU). The Stripe transfer itself is already idempotent
-- (escrow_release_<participationId> key), so the only damage is duplicate
-- ledger rows — which this constraint makes impossible at the source of truth.

-- Dedupe any rows that already slipped through: keep the earliest succeeded
-- release per participation, drop the rest.
DELETE FROM public.transactions t
USING public.transactions keep
WHERE t.type = 'release'
  AND t.status = 'succeeded'
  AND keep.type = 'release'
  AND keep.status = 'succeeded'
  AND keep.participation_id = t.participation_id
  AND t.participation_id IS NOT NULL
  AND (keep.created_at < t.created_at
       OR (keep.created_at = t.created_at AND keep.id < t.id));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_release_succeeded
    ON public.transactions (participation_id)
    WHERE type = 'release' AND status = 'succeeded';

COMMENT ON INDEX public.uniq_transactions_release_succeeded IS
    'A participation''s escrow can only ever be released once; concurrent release attempts fail here instead of double-writing the ledger.';
