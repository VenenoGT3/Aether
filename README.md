# Aether

Aether is an influencer marketing platform that connects **businesses** with **micro-influencers** for sponsored campaigns. Brands create briefs, creators apply, both parties negotiate in-app, funds sit in Stripe escrow, and payouts release when deliverables are approved.

## Scope: Campaign Lifecycle First

We are deliberately making the central campaign lifecycle **boringly reliable** before adding more features:

**Create → Apply → Approve → Fund → Pay → Measure**

| Stage | Status |
|-------|--------|
| Campaign creation & management | Production-ready |
| Creator discovery & applications | Production-ready |
| Pitch review & approval | Production-ready |
| Stripe escrow funding & payout release | Production-ready |
| Post submission & brand approval | Production-ready |
| AI brief/pitch generation | Demo / polish |
| Live metrics scraping (SociaVault) | Demo / polish |
| Automated cron metrics refresh | Production-ready (with `CRON_SECRET`) |

## Mock Mode

Run the full UI locally without Supabase or Stripe credentials:

```bash
AETHER_MOCK_MODE=true npm run dev
```

When `AETHER_MOCK_MODE=true`:

- Auth uses browser cookies (`aether-session`, `aether-role`, `aether-onboarded`)
- Campaigns, participations, and transactions persist in `localStorage`
- Stripe actions return simulated success
- Webhooks and cron endpoints accept requests without secrets

When `AETHER_MOCK_MODE=false` (production), the app **hard-fails at startup** if any required environment variable is missing.

## Environment Variables

| Variable | Required (production) | Description |
|----------|----------------------|-------------|
| `AETHER_MOCK_MODE` | — | `true` for local demo; `false` or unset with real credentials for production |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (webhooks, system updates) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (cron callbacks) |
| `CRON_SECRET` | Yes | Bearer token for `/api/cron/metrics` |
| `GEMINI_API_KEY` | No | AI brief/pitch generation |
| `RESEND_API_KEY` | No | Transactional email |
| `SOCIAVAULT_API_KEY` | No | Social metrics scraping |

Copy `.env.example` to `.env.local` and fill in values.

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run migrations in order from `supabase/migrations/`:
   ```bash
   supabase db push
   # or apply each SQL file in the Supabase SQL editor
   ```
3. Optional: run `supabase/seed.sql` for demo data.
4. Copy **Project URL**, **anon key**, and **service_role key** into `.env.local`.
5. Enable email auth and configure redirect URLs for your app domain.

### Schema note

The `profiles` table uses `user_id` as its primary key (FK to `auth.users.id`). **Do not query `profiles.id`** — it does not exist.

## Stripe Setup

1. Create a [Stripe](https://stripe.com) account and enable **Connect**.
2. Add keys to `.env.local` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
3. Configure a webhook endpoint pointing to `/api/webhooks/stripe` for:
   - `payment_intent.succeeded`
   - `account.updated`
   - `transfer.created`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
5. Local testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

## Development

```bash
npm install
cp .env.example .env.local   # set AETHER_MOCK_MODE=true for quick start
npm run dev                  # http://localhost:3000
npm test                     # unit tests (campaign lifecycle, RLS, auth)
npm run build                # production build (enforces TypeScript + ESLint)
```

## Production vs Demo Features

| Feature | Production | Demo-only |
|---------|------------|-----------|
| Auth (Supabase) | Yes | Mock cookies |
| Campaign CRUD | Yes | localStorage in mock |
| Participations & applications | Yes | localStorage in mock |
| Escrow fund / release | Yes (Stripe) | Simulated |
| Stripe Connect onboarding | Yes | Simulated |
| Post approval workflow | Yes | Yes |
| AI pitch/brief (`/api/ai/*`) | Needs `GEMINI_API_KEY` | Mock responses without key |
| Metrics cron | Yes + `CRON_SECRET` | Skipped in mock |
| Email notifications | Needs `RESEND_API_KEY` | Logged only |

## Tech Stack

- **Next.js 16** (App Router, React Server Components)
- **Supabase** (Auth, Postgres, RLS, Realtime)
- **Stripe Connect** (escrow, payouts)
- **Tailwind CSS v4** + shadcn/ui
- **Vitest** (unit tests)

## License

Private — see repository owner for terms.