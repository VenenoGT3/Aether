-- Aether Migration: Performance-Based Clipping — Pool Funding
--
-- Performance campaigns must be paid for before they go live. A campaign is
-- created as 'draft' (not joinable/discoverable), a Stripe PaymentIntent is
-- created for its budget_pool, and the campaign is only flipped to 'open' once
-- payment succeeds (via the Stripe webhook). Additive; fixed campaigns unchanged.

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS funding_payment_intent_id TEXT,
    ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.campaigns.funding_payment_intent_id IS
    'Stripe PaymentIntent that funds a performance campaign''s budget_pool.';
COMMENT ON COLUMN public.campaigns.funded_at IS
    'When the budget_pool was funded. NULL = unfunded (performance campaign stays draft).';

-- Webhook looks campaigns up by their funding PaymentIntent.
CREATE INDEX IF NOT EXISTS idx_campaigns_funding_pi
    ON public.campaigns(funding_payment_intent_id);
