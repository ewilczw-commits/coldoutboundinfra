---
name: instantly-campaign-upload-public
description: Upload a CSV of leads + a variants YAML (produced by /campaign-copywriting) to Instantly as a new campaign. Handles account attachment, sequence assembly, and batch lead upload (up to 1,000/call). Does NOT activate the campaign — you review in the Instantly UI and launch manually. Alternative to /smartlead-campaign-upload-public for teams sending via Instantly.
---

# Instantly Campaign Upload

Takes a `variants.yaml` (written by `/campaign-copywriting`) and a `leads.csv` (from your list-building skills) and creates a campaign in Instantly — same input schema as `/smartlead-campaign-upload-public`, so copy written for one works for the other unchanged.

**This skill does NOT ship any email copy.** Copy comes from `/campaign-copywriting`. This skill is the mechanical upload layer — API calls only.

## Why this doesn't auto-launch

Same reasoning as the Smartlead version: cold email launches shouldn't happen from a script. Review in the Instantly UI before hitting Launch — subject/body previews, account assignments, lead count, and schedule.

## Inputs

Same `leads.csv` and `variants.yaml` schema as `/smartlead-campaign-upload-public` — see that skill's `references/leads-csv-schema.md` and `references/variants-schema.yaml` for the full spec. Required leads.csv columns: `email`, `first_name`, `last_name`, `company_name`.

## Usage

```bash
export INSTANTLY_API_KEY=xxx

# Get your sending account IDs first
curl -s https://api.instantly.ai/api/v2/accounts \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" | jq '.[] | {id, email}'

npx tsx scripts/upload.ts \
  --leads=profiles/<slug>/campaigns/<campaign-slug>/leads.csv \
  --variants=profiles/<slug>/campaigns/<campaign-slug>/variants.yaml \
  --account-ids=abc123,def456
```

Output:
```
✓ Campaign 8f3a1c92-... created (NOT activated)

Review + launch in the Instantly dashboard: https://app.instantly.ai/

This script does NOT call /api/v2/campaigns/{id}/activate. Review, then activate manually.
```

## Script flow

1. Load env (`INSTANTLY_API_KEY` required)
2. Parse `leads.csv` — validate required columns
3. Parse `variants.yaml` — same minimal parser as the Smartlead upload script
4. `POST /api/v2/campaigns` with `email_list` (your `--account-ids`) and `sequences`
5. `POST /api/v2/leads/bulk-create` in batches of up to 1,000 leads
6. Print the campaign ID. **Does not call activate.**

## API reference (confirmed against Instantly's public OpenAPI spec)

**Base URL:** `https://api.instantly.ai`
**Auth:** `Authorization: Bearer <INSTANTLY_API_KEY>` — a header, not a query param (common mistake coming from Smartlead)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v2/accounts` | List sending accounts — find the IDs to pass as `--account-ids` |
| `POST` | `/api/v2/campaigns` | Create campaign |
| `POST` | `/api/v2/campaigns/{id}/activate` | Launch (NOT called by this script) |
| `POST` | `/api/v2/leads/bulk-create` | Add leads, **up to 1,000 per call** (vs. Smartlead's 100) |

Full endpoint reference: `skills/cold-email-starter-kit/references/09-instantly-api.md` in this repo.

## Gotchas

- **No confirmed tag-based account filter.** Smartlead's upload script auto-selects inboxes by tag + LRU sort. Instantly's public reference doesn't document an equivalent "list accounts by tag" endpoint — pull account IDs manually with `GET /api/v2/accounts` and pass them via `--account-ids`. If you find Instantly does support this, flag it so this skill can be updated.
- **No confirmed multi-variant-per-step field.** The public schema example shows one `subject`/`body` per step, not an A/B/C array. This script picks one variant (`--variant-label`, default `A`) from your `variants.yaml` per step; set up true split-testing in the Instantly dashboard if you need it.
- **`bulk-create` caps at 1,000 leads per request** — the script batches automatically, no action needed, just don't assume a single call handles more.
- **Bearer token, not query param.** If you get 401s, check the header is exactly `Authorization: Bearer {key}`.
- **Rate limits are mostly undocumented** except a few tight ones (`GET /api/v2/emails` at 20/min). This script doesn't hit those endpoints, but if you extend it, check `09-instantly-api.md`'s rate-limiting section first.
- **Leads CSV size.** Same practical ceiling as the Smartlead script — dedupe with `/list-quality-scorecard` first regardless of size.

## What to do next

**Open the Instantly dashboard, find the campaign, review it, and launch when satisfied.** The script deliberately does not auto-activate.

After launch:
- Wait 21 days, then run `/positive-reply-scoring` (works against either sending platform).
- Every Monday: `/email-deliverability-audit --days=7` (see `/cold-email-weekly-rhythm`).
- Consider Instantly's built-in **inbox placement testing** (`/api/v2/inbox-placement-tests`) before scaling volume — no Smartlead equivalent.

## Related skills

- `/campaign-copywriting` — produces `variants.yaml`
- `/smartlead-campaign-upload-public` — the Smartlead equivalent, same input schema
- `/list-quality-scorecard` — dedupe + verify leads.csv before upload
- `/millionverifier-email-verification` — validate emails before upload
- `/positive-reply-scoring` — run 21 days post-launch to measure
- `/scaledmail-domain-setup-public` — provisions the inboxes you'd attach here

## Files

- `scripts/upload.ts` — the upload script
