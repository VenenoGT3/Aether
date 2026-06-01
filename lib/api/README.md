# API defense layer

All `/app/api/**` routes should use this module for consistent validation, rate limits, and errors.

## Quick start

```typescript
import { guardApiPost, guardApiGet } from "@/lib/api/guard";
import { CampaignApplyBodySchema } from "@/lib/api/schemas";
import { jsonSuccess, jsonError } from "@/lib/api/response";

export async function POST(request: Request) {
  const guarded = await guardApiPost(request, {
    schema: CampaignApplyBodySchema,
    rateLimit: "apply",
    routeKey: "campaigns/apply",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;

  // guarded.ctx.data is typed; guarded.ctx.auth has userId + role
  return jsonSuccess({ ... });
}
```

## Client calls

```typescript
import { apiPost } from "@/lib/api/client";

await apiPost("/api/campaigns/{id}/apply", {
  proposed_payout: 500,
  pitch: "…",
  _hp: "",
});
```

Errors surface as `Error` with a friendly `message` and optional field hints.

## Rate limit presets

| Preset | Limit | Use case |
|--------|-------|----------|
| `apply` | 5/min | Campaign applications |
| `submit` | 8/min | Post / deliverable upload |
| `search` | 60/min | Campaign browse API |
| `discover` | 15/min | AI matchmaking |
| `ai` | 20/min | Pitch, predict, safety |
| `metrics` | 25/min | SociaVault scrape |
| `webhook` | 200/min | Stripe |
| `cron` | 10/min | Metrics cron |

Limits are per **authenticated user** when `auth` is set, otherwise per **IP**.

## Honeypot

Include `"_hp": ""` in JSON bodies (optional). Non-empty values return `400`.