---
name: apify-lead-enrichment
description: Append firmographic data (industry, employee count, revenue, address, founded year) to a list of company domains using an Apify actor (Firmographic Append API). Pay-per-matched-result, no charge for misses. Use to enrich a raw domain list before AI-qualifying it, or to backfill firmographics on an existing lead list.
---

# Apify Lead Enrichment

Apify hosts many enrichment actors; this skill documents the one best suited to "I have a list of domains, give me firmographics" — the **Firmographic Append API** actor (`nabeelbaghoor/firmographic-append-api`), a thin wrapper around Versium's B2B data API. It accepts domains, business emails, IPs, hashed emails, LinkedIn URLs, or full company/person records, and returns business name, address, industry (NAICS/SIC), employee count, revenue, founded year, and — for person-level lookups — job title/seniority/department.

## When to use this vs other enrichment skills

| Situation | Use |
|---|---|
| "I have domains, need industry/headcount/revenue to feed `/icp-prompt-builder`" | This skill |
| "I have domains, need actual people (owners/contacts)" | `/blitz-list-builder` or `/quickenrich-list-builder` |
| "I need company data AND I want to explore other RapidAPI-marketplace options first" | `/rapidapi-lead-enrichment` — different vendor pool, compare pricing/coverage |
| "I need tech-stack/social/DNS intelligence, not classic firmographics" | Browse Apify's store for a tech-stack-specific actor (e.g. `technicaldost/company-intelligence-api`) — same call pattern as below, different actor ID |

## Prerequisites — you need TWO keys, not one

1. **Apify API token** (env: `APIFY_API_TOKEN`) — sign up at [apify.com](https://apify.com/), Settings → Integrations. This is what runs the actor.
2. **Your own Versium API key** (env: `VERSIUM_API_KEY`) — the actor is a wrapper, not a data source itself. You need a Versium account and pass your key as the actor's `apiKey` input. This is the gotcha most people miss on this actor.

## Usage

```bash
export APIFY_API_TOKEN=xxx
export VERSIUM_API_KEY=xxx

npx tsx scripts/firmographic-enrich.ts \
  --domains-file=companies.csv \
  --require=Country=US \
  --max-results=5000 \
  --out=enriched.csv
```

Output CSV: `input_domain, matched, business_name, domain, website, phone, address, city, state, zip, country, industry, naics, sic, employee_count, sales_volume, year_founded`

## Pricing

**$12 per 1,000 matched results** (pay-per-event). Misses, rejected records, and duplicates are free — you're only billed for domains that actually resolve to a business record. Use `--require` (e.g. `Country=US`) to filter server-side and avoid paying for matches you'll immediately discard.

## API reference (confirmed against the actor's Apify listing)

**Actor ID:** `nabeelbaghoor/firmographic-append-api` (as `~`-joined in URLs: `nabeelbaghoor~firmographic-append-api`)

**Call pattern** (same sync-run pattern used elsewhere in this repo's Track 6 playbooks for Apify actors):
```
POST https://api.apify.com/v2/acts/nabeelbaghoor~firmographic-append-api/run-sync-get-dataset-items?token=<APIFY_API_TOKEN>
Body: { "domains": [...], "apiKey": "<VERSIUM_API_KEY>", "skipUnmatched": true, "maxResults": 5000, "requireValues": ["Country=US"] }
```

**Input fields:** `domains` / `businessEmails` / `companyRecords` / `ipAddresses` / `hashedEmails` / `linkedinUrls` / `personRecords` (pick whichever input type matches what you have — the script here uses `domains`), `apiKey` (required), `requireValues` (server-side filter, `"Field=Value"` strings), `skipUnmatched` (default false), `maxResults`, `maxRequestSeconds`.

**Rate limit:** the underlying Versium API is documented at 20 queries/second; the actor paces requests below that automatically.

## Gotchas

- **You need a Versium key, not just an Apify token.** Skipping this is the #1 way this actor fails silently or errors on `apiKey`.
- **`run-sync-get-dataset-items` has a execution time window (~5 min).** For lists large enough to exceed it, switch to the async pattern: `POST /v2/acts/{actorId}/runs`, poll `GET /v2/actor-runs/{runId}` for `status: SUCCEEDED`, then `GET /v2/datasets/{defaultDatasetId}/items`.
- **One request per input record** — a 5,000-domain list is 5,000 lookups against your Versium quota, not one bulk call. Budget your Versium plan accordingly.
- **IP-address lookups can resolve to up to 3 business domains** — expect a 1:many fan-out if you enrich by IP instead of domain.
- **Response field names above are inferred from the actor's documented output description**, not a captured live sample — if a field comes back under a slightly different key, print one raw item and adjust the script's mapping.

## What to do next

**Feed `enriched.csv` into `/icp-prompt-builder`** to qualify against your ICP using the newly-appended industry/headcount/revenue fields — much better signal than domain alone.

**Then find people:** `/blitz-list-builder` or `/quickenrich-list-builder` on the qualified subset.

## Related skills

- `/rapidapi-lead-enrichment` — a different vendor pool for the same kind of domain→company enrichment, worth comparing
- `/icp-prompt-builder` — required qualification step once firmographics are attached
- `/disco-like`, `/ai-ark-list-builder` — lookalike company discovery that feeds domains into this skill
- `/blitz-list-builder`, `/quickenrich-list-builder` — the people-finding step after firmographic qualification

## Files

- `scripts/firmographic-enrich.ts` — domain-to-firmographics enrichment
