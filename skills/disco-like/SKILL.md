---
name: disco-like
description: Find lookalike companies via DiscoLike's 70M+ business domain database. Search by natural-language ICP prompt — e.g. "ecom companies specializing in lighting fixtures in US", "medical device manufacturing startups in EU", "EdTech SaaS companies". Add 2-3 reference domains in the prompt for better targeting (e.g. "Industrial automation distributors like heilind.com, bpx.co.uk, automation24.de"). Supports country/region filtering and negation. Use when you have an ICP description and want hundreds of companies that match. Outputs CSV ready for /blitz-list-builder or the email waterfall.
---

# Disco-Like

Lookalike company discovery via natural-language ICP prompt. Describe your ICP in plain English; DiscoLike's `icp_prompt` wizard extracts filters (country, employee range, category, tech stack), synthesizes a seed-domain set, and runs discovery in one call. Returns hundreds of similar companies by domain, industry, and business characteristics — useful for expanding into a full TAM without manual research.

## When to use

- You have an ICP description and want "more companies like this"
- You want to expand a small client list into a full TAM
- You want hundreds of matched companies without hand-building Prospeo filters
- Competitive / adjacent-market expansion

## When NOT to use

- You need PEOPLE, not companies (use Prospeo or Blitz after this)
- Your ICP is genuinely one-of-one (you sell to a single named account or two) — there's nothing to look-alike against
- Budget is tight — DiscoLike charges credits per net-new domain (90-day dedupe); check the dashboard for current rate

## Usage

Start with a natural-language ICP prompt:

```bash
npx tsx scripts/discover.ts --text "ecom companies specializing in lighting fixtures in US" --out lookalikes.csv
npx tsx scripts/discover.ts --text "medical device manufacturing startups in EU" --country EU --out lookalikes.csv
npx tsx scripts/discover.ts --text "EdTech SaaS companies" --country US --out lookalikes.csv
```

If you have 2-3 reference domains, fold them into the prompt — the wizard uses them to bias the seed set:

```bash
npx tsx scripts/discover.ts --text "Industrial automation distributors like heilind.com, bpx.co.uk, automation24.de" --out lookalikes.csv
```

You can also pass reference domains via `--domains` alongside `--text` — same effect:

```bash
npx tsx scripts/discover.ts --text "outbound sales automation" --domains "clay.com,apollo.io" --country US --out lookalikes.csv
```

The script logs the `X-Applied-Filters` response header so you can see what the wizard extracted and iterate.

## Negation (exclude existing customers / competitors)

```bash
npx tsx scripts/discover.ts \
  --text "B2B RevOps SaaS" \
  --negation-domains "yourcompany.com,yourbigcustomer.com" \
  --country US \
  --out lookalikes.csv
```

Always include your own domain + existing customers + known-unfit competitors. Saves enrichment cost downstream.

## Inputs

- `DISCOLIKE_API_KEY` (env) — from DiscoLike dashboard (https://app.discolike.com/account/management/keys)
- `--text` (required) — natural-language ICP prompt; alias `--icp-prompt`
- Optional: `--domains` (reference domains to bias the seed set), `--negation-domains`, `--country`, `--limit`, `--max-companies`
- `--country` accepts ISO-3166-1 alpha-2 codes (US, GB, DE, ...) AND region aliases (`EU`, `EMEA`, `APAC`, `DACH`, `NORDICS`, `LATAM`, `MENA`, `BENELUX`, `CEE`, `ANZ`, `ASEAN`, `GCC`) which auto-expand server-side.

## Outputs

CSV with columns: `domain, company_name, industry, headcount_range, headcount, location_country, location_state, location_city, linkedin_url, similarity, score, description, source`

All rows have `source=discolike` so you can mix with other list-builder outputs without collisions.

## Cost

DiscoLike bills credits **only for net-new domains** — anything your account discovered in the last 90 days re-pulls for free. That makes iteration cheap: re-running the same `--text` or seed list with tweaked filters mostly hits the dedupe cache. The per-credit rate and your monthly allotment depend on plan; see https://app.discolike.com for current pricing. To forecast a fresh pull, run a small `--limit 20` sample and read the `X-Total-Count` header (the script logs it).

## Required step: Qualify with /icp-prompt-builder

**This is a required step. Do not skip it.**

Before pulling 5,000 companies, run DiscoLike on a small sample (50-100), then invoke `/icp-prompt-builder`:
1. Evaluate which of the 50 are actually good ICP fits
2. Refine your ICP prompt / negation list based on what DiscoLike returned
3. Only then scale to 5,000+

(DiscoLike also has a built-in `/v1/validate/icp` endpoint that does this server-side with structured fit / confidence / reasoning per domain — handy if you want to skip eyeballing.)

**Why required:** DiscoLike lookalike results are only as good as your ICP prompt. If 80% of the first 50 are wrong, you need to refine the prompt, not pay to pull more. A poorly-prompted 10K pull burns credits AND cascades into wasted email-finder fees downstream. Qualifying the first 50 catches a weak prompt before it becomes expensive.

**Cheap to iterate.** Because of the 90-day net-new dedupe, re-running the same query with tweaked `--text`, filters, or negations mostly re-hits domains you already paid for — so refining your inputs after the sample costs roughly nothing in credits.

## Recommended flow

1. `/icp-onboarding` → nail down your ICP description and (optionally) 2-3 reference customers
2. `/disco-like --text="<ICP prompt>" --limit=100 --out=sample.csv` → sample run
3. `/icp-prompt-builder` → score the sample, tune ICP prompt
4. If sample quality is high, scale: `/disco-like --text="<ICP prompt>" --max-companies=5000 --out=full.csv`
5. `/blitz-list-builder --domains-file=full.csv` → find decision-makers at each
6. `/email-waterfall` → fill in emails
7. Upload to Smartlead

## API details (reference)

**Base URL:** `https://api.discolike.com/v1`

**Auth:** `x-discolike-key` header

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/discover` | Lookalike + filtered discovery (paginated via `max_records` + `offset`) |
| GET | `/count` | Pre-count for **structured filters only** (no vector inputs — no `domain`, no `icp_prompt`) |
| GET | `/bizdata?domain=X` | Detailed data for a single domain |

**Data returned per company:**
- `domain`, `name`, `description`, `similarity` (0-100), `score` (digital footprint 0-800)
- `industry_groups` (weighted dict — script takes top industry)
- `employees` (range string like "51-200")
- `address` (country, state, city)
- `social_urls` (script extracts LinkedIn company URL)

**Rate limit:** Conservative — script throttles at 5 concurrent, 10 req/sec. No 429s observed on normal runs.

## Common gotchas

- **`--text` is required.** The script always routes to the `icp_prompt` wizard — it auto-extracts filters and synthesizes seed domains from your prompt. Use `--domains` only as augmentation alongside `--text`.
- **Reference domains must be clean bare domains.** `clay.com` works, `https://clay.com/` doesn't.
- **No people data.** DiscoLike is company-level. Always chain with Blitz or Prospeo for contacts.
- **Regional coverage is good.** EU / EMEA / APAC / DACH / NORDICS / LATAM are first-class region codes that auto-expand. Don't manually OR member countries; pass the region.
- **`/count` cannot pre-count a vector query.** It only accepts structured filters (country, category, employee_range, tech_stack, phrase_match, etc.) — passing `domain` or `icp_prompt` returns 422. To gauge a lookalike's universe, run `/discover` with `--limit 20` and read `X-Total-Count` instead.
- **Default results can be 50 near-clones of one archetype.** If your ICP is broad and your top result dominates the vector space, the default `variance=UNRESTRICTED` will return many similar companies. Pass `--variance MEDIUM` (or `MID_HIGH`) to spread results across the ICP — useful for TAM building where you want range, not 100 versions of the same company.

## Scripts

- `scripts/discover.ts` — main search + CSV output (requires `--text`)
- `scripts/count.ts` — structured-filter precount (no vector inputs)
- `scripts/bizdata.ts` — single-domain lookup

## What to do next

**Run `/icp-prompt-builder`** on your 50-company sample (required step above). Then either:
- `/blitz-list-builder` to find owner contacts at each filtered domain, OR
- `/list-quality-scorecard` directly if this is companies-only and you'll enrich another way

**Or wait:** if the 50-sample ICP fit was poor (<40% matches), don't scale. Refine the ICP prompt and re-run.

## Related skills

- `/icp-onboarding` — defines the ICP prompt (and optional reference domains) you'll use
- `/icp-prompt-builder` — quality-check the first 50 results before scaling
- `/blitz-list-builder` — chain to find contacts at each discovered company
- `/email-waterfall` — fill missing emails after Blitz
- `/cold-email-starter-kit` → `06-list-building-prospeo.md` for broader list-building patterns
