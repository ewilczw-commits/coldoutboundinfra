---
name: ai-ark-list-builder
description: Find people and lookalike companies using the AI Ark API (400M+ profiles, 70M+ companies). Search by title/seniority/company domain, or find companies similar to up to 5 seed domains, then export matched people with real-time email verification in one async job. Alternative or supplement to Prospeo. Use when someone wants AI Ark or lookalike-company-driven list building.
---

# AI Ark List Builder

AI Ark is a B2B data platform: 400M+ person profiles and 70M+ company profiles, refreshed monthly, with a credit-based export that verifies emails in real time as it finds them. Its standout feature vs. Prospeo/Blitz is **AI lookalike company search** — give it up to 5 seed domains and it returns companies that look similar, which you can then search for people at.

## When to use AI Ark vs Prospeo/Blitz

| Your situation | Use |
|---|---|
| "Find companies that look like these 5 customers" | AI Ark (lookalike search) |
| "Title-first search across a huge title/industry filter set" | Prospeo (deeper filter set — funding stage, tech stack, etc.) |
| "I have specific domains, find the owner" | Blitz |
| "I want a second data source to cross-check hit rate / email accuracy" | AI Ark |

Often: run `/disco-like` or AI Ark's own lookalike search to find companies, then run either AI Ark's or Prospeo's people search against the resulting domain list.

## Prerequisites

- AI Ark API key (env: `AIARK_API_KEY`) — sign up at [ai-ark.com](https://ai-ark.com/), free tier gives 100 credits/month, no card required
- Node.js 18+ / `npx tsx`

## How credits work

- **People export:** 0.5 credits per exported person + 0.5 credits per found valid email (so ~1 credit per fully-resolved lead, 0.5 if no email found)
- **Company/lookalike search:** 0.1 credits per returned company
- **Check your balance:** `GET /v1/payments/credits` → `{"total": <int>}`

## Usage

### 1. (Optional) Find lookalike companies first

```bash
export AIARK_API_KEY=xxx
npx tsx scripts/lookalike-companies.ts \
  --seeds=acme.com,https://www.linkedin.com/company/other-customer \
  --location="United States" \
  --size=200 \
  --out=lookalike-companies.csv
```

Max 5 seed domains/LinkedIn URLs per call. Output feeds `company_domain` into step 2's `--domains`.

### 2. Export people (search + email-find in one async job)

```bash
npx tsx scripts/export-people.ts \
  --domains=acme.com,other.com \
  --titles="VP Marketing,Head of Growth,CMO" \
  --seniority=director,vp,c_level \
  --size=2000 \
  --out=leads.csv
```

Output CSV: `first_name, last_name, email, email_status, title, linkedin_url, company_name, company_domain`

This calls `POST /v1/people/export`, which returns a `trackId` immediately and processes async. The script polls `POST /v1/people/export/statistics/{trackId}` until done, then paginates `POST /v1/people/export/results/{trackId}` to pull every row.

## Required step: Qualify with /icp-prompt-builder

Run `/icp-prompt-builder` on a ~50-row sample before spending credits on a large export — same rationale as every other list-building skill in this repo: qualifying upfront is far cheaper than paying per-person for a bad-fit list.

## API reference (confirmed against AI Ark's live docs)

**Base URL:** `https://api.ai-ark.com/api/developer-portal`
**Auth header:** `X-TOKEN: <AIARK_API_KEY>` (confirmed on the credits, email-finder, and email-finder-results endpoints; the export endpoint's docs page rendered ambiguously as "Bearer" — if you get a 401 on `/v1/people/export` specifically, try `Authorization: Bearer <key>` as a fallback and let us know which one worked).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/payments/credits` | Remaining credit balance |
| `POST` | `/v1/people` | People search (paginated, returns `trackId` for later email-finding) |
| `POST` | `/v1/companies` | Company search, incl. `lookalikeDomains` (max 5) |
| `POST` | `/v1/people/email-finder` | Trigger email-finding for a prior `/v1/people` search's `trackId` (single-use, expires 6h) |
| `POST` | `/v1/people/email-finder/{trackId}/inquiries` *(GET per docs, POST tested — confirm)* | Paginated email-finder results |
| `POST` | `/v1/people/export` | Combined search + email-find in one async job (what the scripts here use) — max 10,000/call |
| `POST` | `/v1/people/export/statistics/{trackId}` | Poll job progress (free) |
| `POST` | `/v1/people/export/results/{trackId}` | Paginated export results (free) |

**Rate limit:** 500 requests in flight per token before you hit `400 too many pending requests`. Higher custom limits available above 450K credits/month.

## Gotchas

- **`trackId` is single-use and expires 6 hours** after the search that produced it. If your email-finding step is going to run later than that, re-run the search first.
- **`lookalikeDomains` caps at 5 seeds per call.** For a bigger seed set, batch into groups of 5 and dedupe the combined results.
- **Export `size` caps at 10,000 per call.** For more, paginate with successive `page` values.
- **Free tier is 100 credits/month** — enough to test the flow (roughly 100-200 fully-resolved leads depending on email hit rate) but not to run production volume. Budget accordingly.
- **Auth header inconsistency:** most endpoints confirmed as `X-TOKEN`; if `/v1/people/export` 401s with that header, try `Authorization: Bearer <key>` instead (see API reference note above).

## What to do next

**Feed `leads.csv` into your quality gate:** `/list-quality-scorecard` before uploading anywhere.

**Then upload:** `/smartlead-campaign-upload-public` or `/instantly-campaign-upload-public`, depending on which platform you're sending from.

## Related skills

- `/disco-like` — an alternative lookalike-company approach (seed domains or NL ICP text) with a different data source
- `/icp-prompt-builder` — required qualification step before scaling any export
- `/list-quality-scorecard` — grade the output CSV before uploading
- `/quickenrich-list-builder` — another domain-first enrichment alternative
- `/prospeo-full-export` — the deeper-filter title-first alternative

## Files

- `scripts/export-people.ts` — the main search + email-find export
- `scripts/lookalike-companies.ts` — lookalike company discovery
