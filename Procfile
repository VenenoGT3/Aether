# Process definition for Railway / Render / Fly.io / Heroku-style platforms.
# The Aether worker is a long-running background process (no HTTP port). The
# Next.js app deploys separately (e.g. Vercel) — do NOT run it from here.
#
# Requires: REDIS_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# STRIPE_SECRET_KEY (live payouts), AYRSHARE_API_KEY (real views). See SETUP.md.
worker: npm run worker:prod
