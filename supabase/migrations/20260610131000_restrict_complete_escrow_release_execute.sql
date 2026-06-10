-- Restrict fixed-fee escrow release completion to backend service-role calls.
-- The function mutates money state and is only called after a server-side
-- Stripe transfer succeeds, so client roles must never execute it directly.

REVOKE ALL ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) IS
    'Single-transaction completion of a fixed-fee escrow release: ledger row + participation completed + campaign completed. Service-role only; called after the idempotent Stripe transfer succeeds.';
