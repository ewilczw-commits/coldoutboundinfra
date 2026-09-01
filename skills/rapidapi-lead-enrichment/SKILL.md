---
name: rapidapi-lead-enrichment
description: Enrich a list of company domains with firmographic/contact data using a RapidAPI Hub listing (Company Enrichment, Local Business Data, Regulus Data Enrichment, etc). Generic harness plus a curated shortlist of listings to subscribe to — RapidAPI is a marketplace, not one fixed API, so this skill documents the universal auth pattern and lets you plug in whichever listing fits your budget/coverage.
---

# RapidAPI Lead Enrichment

RapidAPI Hub (rapidapi.com) is a marketplace — dozens of vendors publish overlapping company/domain enrichment APIs there under one unified auth scheme. This repo already uses two specific listings elsewhere (Maps Data API for `/google-maps-list-builder`, LinkedIn Bulk Data for `/competitor-engagers`); this skill is for the broader "enrich a domain into company/contact data" use case, and documents the pattern rather than locking you into one vendor.

**Why generic instead of one fixed listing:** RapidAPI listing pages are rendered client-side, so exact endpoint schemas can't be reliably pinned from outside a live subscription, and vendors on the Hub change/get replaced over time. The reusable part — auth headers, batching, retry — doesn't change; the endpoint path and field names do, per listing. Confirm those from the listing's own **Code Snippets** tab after subscribing (RapidAPI generates a live, correct curl/Node/Python snippet per endpoint — more reliable than a schema transcribed here that could go stale).

## Universal RapidAPI auth pattern

Every listing on the Hub uses the same two headers:
```
X-RapidAPI-Key: <RAPIDAPI_KEY>
X-RapidAPI-Host: <listing-specific-host>.p.rapidapi.com
```
One `RAPIDAPI_KEY` env var works across every listing you subscribe to — only the host and endpoint path change.

## Shortlist: enrichment listings worth trying

Subscribe (RapidAPI has free tiers on most of these) and compare hit rate/coverage on a sample before committing budget to one:

| Listing | What it returns | Notes |
|---|---|---|
| [Company Enrichment](https://rapidapi.com/standingapi-standingapi-default/api/company-enrichment) | Size, industry, office locations, 175+ countries | Broad coverage claim |
| [Regulus Data Enrichment](https://rapidapi.com/WRegulus/api/regulus-data-enrichment) | Company name, industry, employee count, revenue, founding year, full address, from an email or domain | Good field breadth from a single lookup |
| [Local Business Data](https://rapidapi.com/letscrape-6bRBa3QguO5/api/local-business-data) | Domain/business-name/location → company data, emails, phone, social profiles | Overlaps with `/google-maps-list-builder`'s use case but framed for CRM enrichment |
| [Domain to Email & Company Data Enrichment](https://rapidapi.com/search?query=domain%20email%20company%20enrichment) | Headcount, location, industry from a domain or email | Search the Hub for current listings under this description — vendor turnover here is common |

This list is a starting point, not exhaustive — search [rapidapi.com/hub](https://rapidapi.com/hub) for "company enrichment" or "firmographic" to see current options and pricing.

## Prerequisites

- RapidAPI account + `RAPIDAPI_KEY` (env var) — sign up at [rapidapi.com](https://rapidapi.com/)
- A subscription to whichever listing you pick from the shortlist above (or your own find)
- The exact endpoint path + the query-param name it expects for a domain — copy these from that listing's **Code Snippets** tab

## Usage

```bash
export RAPIDAPI_KEY=xxx

npx tsx scripts/enrich-domains.ts \
  --domains-file=companies.csv \
  --host=regulus-data-enrichment.p.rapidapi.com \
  --path=/enrich \
  --domain-param=domain \
  --out=enriched.csv
```

`--host` and `--path` above are illustrative — pull the real values from your subscribed listing's Code Snippets tab, since we can't confirm one fixed schema for a marketplace. The script writes each response's raw JSON into `enriched.csv`'s `raw_json` column; once you've seen a live response shape, add a small follow-up script (or a one-off `jq`/Node pass) to flatten the specific fields your chosen listing returns.

## Gotchas

- **This is a harness, not a wired-up client for one vendor.** Budget 10 minutes to grab the real path/params from RapidAPI's Code Snippets tab before running at scale — don't assume the illustrative example above is a working request.
- **Listings vary wildly in whether they're GET+query-params or POST+JSON-body.** The script assumes GET+query-params (the more common pattern for simple lookups); if your listing needs a POST body, adjust the fetch call in `scripts/enrich-domains.ts` accordingly.
- **Free tiers are typically request-capped, not credit-capped** — check the specific listing's pricing tab, RapidAPI-wide quotas don't exist, each vendor sets their own.
- **Don't double-pay for the same data.** If you're already using `/apify-lead-enrichment` for firmographics, use this skill for a genuinely different angle (e.g. tech stack, social links) rather than the same domain→firmographics lookup twice.

## What to do next

**Feed `enriched.csv` into `/icp-prompt-builder`** to qualify against your ICP once you've flattened the fields you care about.

## Related skills

- `/apify-lead-enrichment` — a firmographics-specific alternative with a confirmed, concrete call pattern
- `/google-maps-list-builder`, `/competitor-engagers` — this repo's other RapidAPI-listing consumers, same auth pattern
- `/icp-prompt-builder` — required qualification step once enrichment fields are attached

## Files

- `scripts/enrich-domains.ts` — generic batched GET-with-query-param harness against any RapidAPI listing
