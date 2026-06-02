---
name: validate-company
description: >-
  Qualify a CSV of companies for whether they OFFER SEO / GEO / search-marketing
  services (Yes / No / Not Accessible + the exact services found), using a
  deterministic, near-zero-token pipeline: free stdlib website fetch → Exa
  fallback for blocked sites → multi-page re-check → keyword classify → merge.
  Use this skill WHENEVER the user hands over a CSV/list of companies (with a
  website or domain column) and wants to know which ones do SEO/GEO/SEA/SEM/
  référencement/search marketing, validate a lead list, qualify agencies, tag a
  prospect list by service offering, or "check what these companies do" from
  their websites — even if they don't say the word "skill". This is the cheap,
  no-sub-agent-fan-out, no-LLM, no-API-key-beyond-Exa way to validate company
  lists at scale. Prefer it over spawning Task sub-agents to read sites one by one.
---

# validate-company

Qualify a list of companies for SEO/GEO/search-marketing services **cheaply**.

## Why this exists
The naive way — fan out one Claude Code Task sub-agent per company to WebFetch +
judge — burns ~30k+ tokens per handful of rows and stalls at scale (a 463-row run
cost ~1M+ tokens). This skill instead **separates fetching from judging**: pull
website text deterministically (free HTTP, then Exa only where needed), then
classify by keyword match. Result: validating a 500-row list costs **~0 tokens and
under ~$0.50 of Exa**, versus a million tokens. Never fan out sub-agents for this.

## Inputs
- A CSV with a company-name column and a website/domain column. Bare domains
  (`actenys.fr`) are fine — `https://` is prepended automatically.
- An Exa API key for the fallback steps: set `EXA_API_KEY` in the environment or in
  a `.env` file in the working directory. The free fetch + keyword classify steps
  run **without** any key; only the Exa fallback and multi-page steps need it.

## Output
A new CSV (original untouched) with two appended columns:
`SEO Services Found` (Yes / No / Not Accessible) and `Services Identified`
(comma-separated services, or None / N/A).

## The tools
Two stdlib Python scripts live in `scripts/` next to this file:
- `scripts/seo_qualify.py` — `split` (CSV → batch files) and `merge` (results → CSV).
- `scripts/seo_scrape_exa.py` — `--fetch-free`, Exa scrape (default), `--multipage-no`,
  `--classify-kw`.

All paths resolve against the **current working directory** (`.tmp/`, `.env`, output
CSV land there). Run the scripts from the user's project directory. If you must run
elsewhere, set `VALIDATE_COMPANY_WORKDIR=/path` so `.tmp` and `.env` resolve correctly.

## Pipeline — run these steps in order
Work from the directory holding the input CSV. Use `python3`.

```
SKILL=~/.claude/skills/validate-company/scripts

# 1. SPLIT — assign stable row_id, normalize URLs, write .tmp/seo_batches/.  ($0, 0 tokens)
python3 "$SKILL/seo_qualify.py" split --in "INPUT.csv"

# 2. FREE FETCH — stdlib HTML-to-text, https→http, lenient TLS.  ($0, 0 tokens)
#    Reachable sites get text cached to .tmp/seo_pages/; blocked ones marked.
#    This can take a while (blocked sites time out); run it in the background.
python3 "$SKILL/seo_scrape_exa.py" --fetch-free

# 3. EXA FALLBACK — only rows the free fetch couldn't read. Needs EXA_API_KEY.  (~$0.002/row)
python3 "$SKILL/seo_scrape_exa.py"

# 4. CLASSIFY — keyword scan of cached text. Yes/No, blocked+empty → Not Accessible.  ($0, 0 tokens)
python3 "$SKILL/seo_scrape_exa.py" --classify-kw

# 5. MERGE — join to a results CSV.  ($0, 0 tokens)
python3 "$SKILL/seo_qualify.py" merge --in "INPUT.csv" --out "INPUT - RESULTS.csv"
```

### Optional step 6 — recover "No" false-negatives (recommended for agency lists)
The free fetch only reads the homepage, but services often live on `/services` or
`/prestations`. This pass fetches service subpages via Exa for every current "No"
row, re-scans, and also reclassifies parked/placeholder homepages as Not Accessible.
Run it **before** the final merge (it writes a result file that overrides step 4 for
those rows). Costs roughly `0.002 × 5 × (# No rows)` of Exa, still 0 tokens.

```
python3 "$SKILL/seo_scrape_exa.py" --multipage-no
python3 "$SKILL/seo_qualify.py" merge --in "INPUT.csv" --out "INPUT - RESULTS.csv"
```

## Crash-safety / resume
Every step is incremental. `--fetch-free` skips rows already cached with status `ok`;
Exa skips rows that already have text; `merge` joins whatever results exist (missing
rows stay blank and it prints which batches to rerun). Safe to re-run any step. To
start a genuinely fresh run on a new CSV, archive or clear `.tmp/seo_batches`,
`.tmp/seo_pages`, `.tmp/seo_results` first so old results don't leak into the merge.

## Tuning what counts as a match
The judgement is the keyword list `KW` and the Exa `HIGHLIGHT_QUERY` in
`scripts/seo_scrape_exa.py` (French + English SEO/GEO/SEA/SEM/référencement/Google
Ads/netlinking/etc.). To validate companies for a **different** offering, edit those
two lists — the pipeline is otherwise generic. Keep the literal match in `kw_scan`
lowercased and watch for substrings (`" seo"` vs `"seo "`) to avoid false hits.

## Reporting back to the user
After the merge, report the verdict distribution (Yes / No / Not Accessible counts)
and the output path. Be honest about confidence: `Yes` is high-confidence (keyword
literally on the site); `No` after step 6 is solid; `Not Accessible` means neither
free fetch nor Exa could read the site. Offer to spot-check a few rows against live
sites — read cached pages from `.tmp/seo_pages/` (free) rather than re-fetching.

## Hard rules
- Never fan out Task sub-agents to fetch/judge sites one by one — that is the exact
  token-burn this skill replaces.
- Don't touch the input CSV; always write a new `- RESULTS.csv`.
- Don't spend on Exa for rows the free fetch already read.
