---
name: quickenrich-list-builder
description: Domain-first contact discovery via the QuickEnrich API — given a list of company domains, find employees (optionally filtered by title) with email/phone when available. Claims 40% more coverage than resold databases by sourcing from company sites, Google Maps, Common Crawl, and public social profiles. Alternative or supplement to Blitz. Use when your targeting is domain-first, not title-first.
---

# QuickEnrich List Builder

QuickEnrich is domain-first, like Blitz: you already know the target companies, and it finds people at them. Its pitch is broader web coverage than resold contact databases (company sites, Google Maps listings, Common Crawl, public social profiles) — worth trying as a second source when Blitz's hit rate is thin on a given vertical.

## When to use QuickEnrich vs Blitz vs Prospeo

| Your situation | Use |
|---|---|
| "I have domains, find the people" (first pass) | Either Blitz or QuickEnrich — try both, compare hit rate on your vertical |
| "Blitz came back thin on this list" | QuickEnrich as a second pass |
| "Find all VPs of X across an industry" (no domain list yet) | Prospeo |
| "I need a reverse lookup — who owns this email address" | QuickEnrich's `email-search` endpoint |

## Prerequisites

- QuickEnrich API key (env: `QUICKENRICH_API_KEY`) — sign up at [quickenrich.io](https://quickenrich.io/); free tier gives 300 monthly lookups
- List of target company domains (CSV with a `company_domain` column, or one domain per line)

## Usage

```bash
export QUICKENRICH_API_KEY=xxx

npx tsx scripts/domain-search.ts \
  --domains-file=companies.csv \
  --titles=owner,founder,ceo,general-manager \
  --has-email=true \
  --out=contacts.csv
```

Output CSV: `company_domain, first_name, last_name, title, email, phone`

## Required step: Qualify with /icp-prompt-builder

If your `companies.csv` came from a broad scrape (Google Maps, a lookalike search) rather than a hand-picked account list, run `/icp-prompt-builder` on a ~50-row sample first. Same cost logic as every list-building skill here: filtering upfront is cheaper than paying per-contact for a bad-fit list.

## API reference (confirmed against QuickEnrich's live docs)

**Base URL:** `https://app.quickenrich.io/api`
**Auth:** `Authorization: Bearer <QUICKENRICH_API_KEY>`

| Method | Path | Purpose | Params |
|---|---|---|---|
| `GET` | `/employees/dataset-search` | Domain-first contact search (used by `domain-search.ts`) | `company_url` (required), `title`, `page`, `has_email` — up to 20 contacts/page |
| `GET` | `/employees/search` | Email search by name + company/LinkedIn | `linkedin_url`, `company_url`, `first_name`, `last_name` |
| `GET` | `/employees/phone-search` | Phone lookup | `linkedin_url` OR (`company_url`+`first_name`+`last_name`) |
| `GET` | `/employees/email-search` | Reverse email lookup — identify the person behind an email | `email` (required) |
| `POST` | `/employees/contact-finder` | Broad discovery across company/employee filters, no email/phone returned (free — use to size a market before paying for enrichment); supports deep pagination via `cursor` |
| `POST` | `/companies/company-finder` | Company search by `home_page_text`, `services`, `industry`, `country_code`, `number_of_employees`, `revenue`, `city`, `company_name`, `company_url` — 1 credit per company returned |

**Rate limits:** 1,000 req/min standard endpoints, 300 req/min domain search, 120 req/min contact/company finder, 6,000 req/min on the GTM Unlimited tier.

**Pagination:** `page` + `per_page` for shallow results; switch to `cursor` (from `meta.next_cursor`) past 10,000 results.

## Credit model

Credits are only deducted when a lookup returns a match — a domain search that finds no contacts, or an email search with no result, costs nothing. `contact-finder` and `company-finder` discovery searches are similarly free until you request the enriched fields. This means it's cheap to test coverage on a sample before committing.

## Gotchas

- **`dataset-search` returns at most 20 contacts per page.** The script paginates until a short page signals the end — don't assume all contacts arrive in page 1.
- **Domain search is capped at 300 req/min** — noticeably tighter than the 1,000/min standard limit. The script paces at ~4 req/s by default; lower `--min-interval-ms` only if you're on the GTM Unlimited tier.
- **`contact-finder` doesn't return email/phone** — it's a free discovery/sizing tool. Follow up matched contacts with `dataset-search` or `search` to actually enrich them.
- **Free tier is 300 lookups/month** — enough to validate hit rate on a sample, not for production volume.

## What to do next

**Feed `contacts.csv` into your quality gate:** `/list-quality-scorecard` before uploading.

**If email coverage is thin:** run `/millionverifier-email-verification` on any emails you're unsure about, or supplement with `/blitz-list-builder` on the same domain list.

**Then upload:** `/smartlead-campaign-upload-public` or `/instantly-campaign-upload-public`.

## Related skills

- `/blitz-list-builder` — the other domain-first contact finder, compare hit rates
- `/ai-ark-list-builder` — a title/seniority-first alternative with its own lookalike search
- `/icp-prompt-builder` — required qualification step before scaling
- `/list-quality-scorecard` — grade the output CSV before uploading
- `/millionverifier-email-verification` — validate emails before sending

## Files

- `scripts/domain-search.ts` — domain-first contact search
