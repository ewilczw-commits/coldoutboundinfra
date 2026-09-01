---
name: millionverifier-email-verification
description: Verify email addresses before sending — single ad-hoc checks or bulk CSV verification via the MillionVerifier API. Filters catch-all, disposable, and invalid addresses out of a lead list to keep bounce rate low. Use before any upload to Smartlead/Instantly, especially on lists sourced from scraping or lower-confidence enrichment.
---

# MillionVerifier Email Verification

Bounce rate over 3-5% damages domain reputation permanently. Any lead list built from scraping, guessed email patterns, or a lower-confidence enrichment source should be verified before it touches a sending platform. MillionVerifier is a straightforward, cheap verification API — this skill covers both the single-email ad-hoc check and the bulk CSV flow.

## When to use this

- **Always**, before uploading a freshly-built list to `/smartlead-campaign-upload-public` or `/instantly-campaign-upload-public`, unless the list already came pre-verified (e.g. AI Ark and QuickEnrich both verify emails as part of their own export).
- Spot-checking a single address (a reply-to, a manually-added VIP lead) before a small send.

## Prerequisites

- MillionVerifier API key (env: `MILLIONVERIFIER_API_KEY`) — sign up at [millionverifier.com](https://www.millionverifier.com/), dashboard → API Key
- Node.js 18+ / `npx tsx`

## Usage

### Bulk verify a CSV

```bash
export MILLIONVERIFIER_API_KEY=xxx
npx tsx scripts/bulk-verify.ts --in=leads.csv --email-col=email --out=leads-verified.csv
```

Uploads the file, polls until MillionVerifier finishes processing, downloads the annotated result. Filter the output to keep only rows where `result=ok` (or `quality=good`) before uploading to your sending platform.

### Verify a single email

```bash
npx tsx scripts/single-verify.ts someone@example.com
```

## API reference (confirmed against MillionVerifier's live docs)

**Single API base:** `https://api.millionverifier.com`
**Bulk API base:** `https://bulkapi.millionverifier.com`
**Auth:** API key passed as the `api`/`key` query parameter (no header auth) — a test key `API_KEY_FOR_TEST` is available for dry-running the integration without spending credits.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v3?api=<key>&email=<email>&timeout=<2-60>` | Single-email verify |
| `POST` | `/bulkapi/v2/upload?key=<key>` | Upload a CSV, returns `file_id` |
| `GET` | `/bulkapi/v2/fileinfo?key=<key>&file_id=<id>` | Poll processing status + progress % |
| `GET` | `/bulkapi/v2/filelist?key=<key>` | List files, filterable by status/date/progress |
| `GET` | `/bulkapi/v2/download?key=<key>&file_id=<id>` | Download the annotated result CSV — this path wasn't in the fetched doc excerpt but is MillionVerifier's standard bulk-download path; confirm against your account if it 404s |

### Single-verify response fields

| Field | Meaning |
|---|---|
| `result` | `ok`, `invalid`, `catch_all`, `disposable`, `unknown`, `unverified` |
| `quality` | `good` or `bad` — the simplified pass/fail signal |
| `subresult` | Additional detail on the classification |
| `free` | Boolean — free email provider (gmail.com, etc.) |
| `role` | Boolean — role-based address (info@, sales@) |
| `didyoumean` | Suggested correction if the address looks like a typo |
| `credits` | Remaining account credits |

## Interpreting results for a send decision

- **`ok` / quality `good`** — send.
- **`catch_all`** — domain accepts all mail, can't confirm the specific mailbox exists. Include cautiously; expect a somewhat higher bounce rate on this segment specifically.
- **`invalid` / `disposable`** — drop these rows. They will bounce.
- **`unknown` / `unverified`** — the mail server didn't respond definitively (often greylisting or a slow server). Re-verify later, or include at low volume and watch bounce rate on that segment.

## Gotchas

- **Query-param auth, not a header.** Easy mistake coming from Bearer-token APIs like Instantly or QuickEnrich.
- **Bulk jobs are async.** Don't assume `upload` returns final results — poll `fileinfo` until `file_status` is `FINISHED` before downloading.
- **Use the test key first.** `API_KEY_FOR_TEST` lets you validate your script's request shape without spending real credits.
- **Timeout parameter matters on flaky mail servers.** Default 20s is usually fine; raise to 60s if you're seeing a lot of `unknown` results on domains with slow SMTP servers.

## What to do next

**If verification pass rate is low (<80% `ok`):** the list itself is the problem, not this skill. Go back to whichever list-building skill produced it and re-check the source quality, or run `/list-quality-scorecard`.

**If clean:** proceed to `/smartlead-campaign-upload-public` or `/instantly-campaign-upload-public`.

## Related skills

- `/list-quality-scorecard` — broader pre-send grading (this skill covers only the email-validity dimension)
- `/ai-ark-list-builder`, `/quickenrich-list-builder`, `/blitz-list-builder`, `/prospeo-full-export` — list-building skills whose output should generally pass through here first
- `/smartlead-campaign-upload-public`, `/instantly-campaign-upload-public` — the upload steps this verification should precede

## Files

- `scripts/bulk-verify.ts` — CSV upload → poll → download
- `scripts/single-verify.ts` — ad-hoc single-email check
