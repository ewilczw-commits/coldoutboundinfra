---
name: scaledmail-domain-setup-public
description: "Public guide: Generate or suggest domain names, check availability, buy domains, and provision Google/Microsoft 365/SMTP inboxes end-to-end on ScaledMail — DNS (SPF/DKIM/DMARC) is configured for you. Requires your own ScaledMail API key. Use when someone wants to set up cold email domains + inboxes end-to-end."
---

# Cold Email Domain Setup: ScaledMail (Public Edition)

Complete workflow to generate or suggest short domain names, buy them through ScaledMail, and provision inboxes (Google, Microsoft 365, or SMTP) ready for cold email sending. ScaledMail is a "done-for-you" infrastructure provider: unlike a pure self-serve API (buy domain → manually switch nameservers → manually connect), ScaledMail's order flow handles domain DNS configuration (SPF/DKIM/DMARC) and mailbox provisioning for you once you submit an order.

**A note on the docs:** ScaledMail's API reference (`https://api.scaledmail.com/`) is an interactive, JS-rendered reference — it names every endpoint but doesn't expose literal method+path strings to a static fetch. Everything below is confirmed against what the docs literally state (base URL, auth, rate limit, endpoint names + purpose). Where the exact path is inferred rather than confirmed, it's marked **[confirm path]** — pull the live curl snippet from the interactive reference for that endpoint before wiring a script, or ask ScaledMail support (support@scaledmail.com).

---

## First-Time Setup (Onboarding)

### 1. Get Your ScaledMail API Key
1. Log into [app.scaledmail.com](https://app.scaledmail.com)
2. Go to **Settings**
3. Copy your API key. It's account-wide — it has access to all organizations/workspaces on your account, so treat it like a master credential.

### 2. Store Your Key
```bash
# .env — NEVER commit this file
SCALEDMAIL_API_KEY=your_scaledmail_key_here
```

```python
import os
from dotenv import load_dotenv
load_dotenv()

SCALEDMAIL_API_KEY = os.environ["SCALEDMAIL_API_KEY"]
```

### 3. Verify Access
```
GET https://server.scaledmail.com/api/v1/organizations
Header: Authorization: Bearer <SCALEDMAIL_API_KEY>
```
A 200 with your organization(s) listed means you're ready. Every other call needs an `organization_id` — each organization is a separate environment for domains, mailboxes, and campaigns within your account.

---

## Full Workflow Overview

```
Step 1: Generate/suggest domain name candidates      ~instant
Step 2: Check availability (max 30/call)              ~1 min per 300 domains
Step 3: Buy domains (requires payment method on file) ~instant–1 min
   | ScaledMail configures DNS (SPF/DKIM/DMARC) automatically — no manual nameserver switch
Step 4: Size + place your mailbox order (package or custom)
   | ScaledMail provisions mailboxes against the order
Step 5: Poll for ACTIVE domains + mailboxes           varies — see Gotchas
Step 6: Pull mailbox credentials                      ~instant
Step 7: Connect to your sending platform              via dashboard or export
```

Compare to `/prospeo-full-export`-style DIY flows: ScaledMail trades some API granularity for less manual DNS babysitting. If you want programmatic control at Zapmail's level of detail, this is the trade-off to know going in.

---

## Step 1: Generate Domain Name Candidates

You have two options:

**Option A — Let ScaledMail suggest them.** The **Suggest Domains** endpoint takes a keyword and returns availability-checked candidates in one call. This is the fast path — try it first.

**Option B — Generate your own, then check availability separately.** Use this if you want more control over the naming pattern than a keyword-based suggester gives you. Same domain-name strategy as any provider:

**Tier 1 — Prefix + Brand** (shortest, try first): `go{brand}.com`, `try{brand}.com`, `get{brand}.com`, `my{brand}.com`, `the{brand}.com`, `hey{brand}.com`, `use{brand}.com`, `run{brand}.com`, `one{brand}.com`

**Tier 2 — Brand + Suffix**: `{brand}hq.com`, `{brand}hub.com`, `{brand}now.com`, `{brand}app.com`, `{brand}pro.com`, `{brand}lab.com`, `{brand}ai.com`, `{brand}co.com`, `{brand}go.com`

**Tier 3 — Prefix + Brand + Suffix** (only if tiers 1-2 don't yield enough): `go{brand}hq.com`, `try{brand}hub.com`, `get{brand}pro.com`

**Filtering rules:** max SLD length ~20-40 chars (shorter is better), no banned substrings (mega, ultra, grp — look spammy), screen for unintended embedded words, dedupe globally across clients.

**Recommended TLD:** `.com` primary, `.co` secondary. Avoid `.info`, `.xyz`, `.click`, `.top`, `.buzz`, `.loan` — recipients pattern-match on TLD and these hurt deliverability.

---

## Step 2: Check Domain Availability

### Suggest Domains **[confirm path]**
Keyword-based suggestion + availability in one call — the fast path from Step 1 Option A.

### Search Domains **[confirm path]**
Query availability for domains you generated yourself.
- **Max 30 domains per call** (much lower ceiling than Dynadot's 100 — batch accordingly)
- Filter to available-only before proceeding to purchase

---

## Step 3: Buy Domains

### Buy Domains **[confirm path]**
Purchase available domains directly.

### Create Order / Create Custom Order **[confirm path]**
For volume purchases tied to a mailbox package (see Step 4), buy domains as part of an order rather than one at a time.

**Both require a payment method on file** in your ScaledMail account — add one in the dashboard before scripting purchases, or calls will fail.

Once purchased, **ScaledMail configures SPF/DKIM/DMARC automatically** — there's no separate "switch nameservers, wait 20 minutes" step like a registrar+DNS-provider split flow. Poll **Get Domains** (lists active domains with mailbox setup, tag, status, provider) until status shows the domain is ready.

---

## Step 4: Size + Place Your Mailbox Order

You have two paths depending on whether you need inboxes today or can wait through warmup:

### Path A — Standard order (new domains, needs ~2-week warmup after provisioning)
1. **Calculate Package** — give it a target sending volume; it returns the domains/mailboxes/pricing needed to hit it.
2. **Get Packages** — browse pre-built packages, find the `price_id` that matches (or use the custom volume from step 1).
3. **Create Order** (or **Create Custom Order** for a bespoke package) — requires payment method.
4. **Get Pending Forms** — after ordering, ScaledMail may require you to submit domain/mailbox specs against the order.
5. **Submit Form** — submit your domain names + mailbox naming details (first/last name per mailbox, matching the "2 inboxes per domain" convention below) against the pending order.
6. **Update Order Tag** — optionally tag the order for your own tracking (e.g., client slug).

### Path B — Pre-warmed inboxes (need to send today)
1. **Pre Warm Inboxes** — lists all available pre-warmed Google/Outlook inboxes with pricing.
2. **Buy Pre Warm Inboxes** — purchase pre-warmed accounts directly. Skips the 2-week warmup wait, at a premium price. Use this only when you have zero lead time — the economics favor Path A for anything planned more than 2 weeks out.

### Inbox Naming Convention
Same pattern regardless of path — 2 inboxes per domain for sending variety:
- `{firstname}@domain` (e.g., `sarah@goacme.com`)
- `{firstnamelastname}@domain` (e.g., `sarahchen@goacme.com`)

---

## Step 5: Poll Until Ready

- **Get Domains** — check status/mailbox setup per domain
- **Get Order Details** — check order fulfillment progress
- **Get Purchased Domains** — list every domain you own on the account

There's no publicly documented fixed SLA for provisioning time in the same way Zapmail publishes "4-6 hours" — ScaledMail's homepage states **setup completion in 2-4 business days** for the white-glove flow. Poll rather than assume; don't attempt export until domains + mailboxes both show active.

---

## Step 6: Pull Mailbox Credentials

### Get Mailboxes by Domain ID **[confirm path]**
Lists every mailbox on a domain — alias, email address, and password.

---

## Step 7: Connect to Your Sending Platform

ScaledMail's homepage advertises integrations with Smartlead, Instantly, EmailBison, Apollo, Lemlist and others. The public docs extracted here don't enumerate a documented bulk-export endpoint (unlike Zapmail's `POST /exports/mailboxes`) — connect via the dashboard's platform-connector UI, or confirm with ScaledMail support whether a scriptable export endpoint exists on your plan before building automation around it.

Once connected: run `/smartlead-inbox-manager` (or the Instantly equivalent, `/instantly-campaign-upload-public`) to configure warmup, signatures, and tags.

---

## Common Gotchas

1. **Rate limit: 5 requests/second.** Exceeding it risks a temporary block — pace batch calls accordingly (lower ceiling than Zapmail's, so don't port Zapmail-era concurrency settings over unchanged).
2. **`organization_id` is required on every call.** Missing it is the most common source of unexplained 4xx errors.
3. **Search Domains caps at 30 domains per call** — noticeably lower than Dynadot's 100. Batch your candidate list accordingly.
4. **A payment method must already be on file** for Buy Domains, Buy Pre Warm Inboxes, and Create Order — add it in the dashboard first, scripted purchases will otherwise fail.
5. **Order-based provisioning, not atomic calls.** Standard-path mailbox creation goes through Create Order → Pending Forms → Submit Form, not a single "create mailbox" call. Don't assume Zapmail's one-shot `POST /mailboxes` pattern carries over.
6. **No published fixed provisioning SLA** — poll `Get Domains` / `Get Order Details` rather than hardcoding a sleep window; 2-4 business days is the stated ballpark for the white-glove flow.
7. **Docs are JS-rendered.** Several endpoints above are marked **[confirm path]** because the exact HTTP method + path string isn't extractable from a static fetch of the public reference — pull the live snippet from `https://api.scaledmail.com/` (it has per-endpoint "Try it" code samples) before scripting against them.

---

## Quick Reference: Endpoint Groups

| Group | Endpoints | Notes |
|---|---|---|
| Organizations | Get Organizations | Every other call needs `organization_id` from here |
| Domains | Get Domains · Buy Domains · Search Domains (max 30) · Suggest Domains · Update Domain Name · Update Domain Redirect · Get Purchased Domains | DNS auto-configured on purchase |
| Packages & Orders | Calculate Package · Get Packages · Create Order · Create Custom Order · Get Orders · Get Order Details · Cancel Order · Get Pending Forms · Submit Form · Update Order Tag | Standard-path mailbox provisioning goes through here |
| Pre-Warm Inboxes | Pre Warm Inboxes · Buy Pre Warm Inboxes | Instant-send path, premium priced |
| Mailboxes & Stats | Get Mailboxes by Domain ID · Get Reporting Stats | Reporting Stats = inbox placement test results |

---

## What to do next

**Run `/smartlead-inbox-manager`** (or `/instantly-campaign-upload-public` if sending via Instantly) to configure warmup + signatures + tags on your newly-created inboxes.

**Then wait through warmup before sending real emails** — 2 weeks is the standard rule of thumb, unless you bought pre-warmed inboxes. Under-warmed inboxes land in spam and damage your domain reputation permanently.

**During the wait:** build your list (`/ai-ark-list-builder`, `/quickenrich-list-builder`, `/prospeo-full-export`, `/disco-like`, etc.), write copy (`/campaign-copywriting`). You'll be ready to launch the moment warmup finishes.

## Related skills

- `/smartlead-inbox-manager` — configure the inboxes you just provisioned
- `/instantly-campaign-upload-public` — alternative sending platform upload
- `/email-deliverability-audit` — check auth records (SPF/DKIM/DMARC) after setup
- `/mxtoolbox-deliverability-check` — independent third-party blacklist/DNS check on the same domains
- `/cold-email-kickoff` — the orchestrator that usually invokes this skill
