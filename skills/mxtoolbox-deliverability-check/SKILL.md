---
name: mxtoolbox-deliverability-check
description: Independent third-party check of SPF/DKIM/DMARC and blacklist status across your sending domains via the MxToolbox API. Use as a cross-check alongside /email-deliverability-audit, or standalone when you just need a quick "are we blacklisted anywhere" answer.
---

# MxToolbox Deliverability Check

`/email-deliverability-audit` already checks DNS auth records via `dig` and pulls Smartlead's own reputation data. This skill adds an **independent, third-party** view — MxToolbox checks the same records plus blacklist status across 100+ blacklists, which matters because a domain can pass your own DNS checks while still being blacklisted somewhere that hurts inbox placement.

## When to use this vs /email-deliverability-audit

| Situation | Use |
|---|---|
| Regular Monday audit (the full workflow: bounce/reply rates, spam tests, DKIM/SPF) | `/email-deliverability-audit` |
| "Are any of my domains/IPs on a blacklist right now?" | This skill (or MxToolbox's free web check, 1/24h without a key) |
| Cross-checking DNS auth after `/scaledmail-domain-setup-public` provisioning | Either — running both catches tool-specific blind spots |
| Investigating a specific "domain blacklisted" incident | `/deliverability-incident-response`, which already points here for confirmation |

## Prerequisites

- MxToolbox API key (env: `MXTOOLBOX_API_KEY`) — sign up at [mxtoolbox.com](https://mxtoolbox.com/), Account → API. A free tier exists (64 DNS lookups/day, no network/blacklist quota) — paid plans add blacklist checks and higher quotas.
- Node.js 18+ / `npx tsx`

## Usage

```bash
export MXTOOLBOX_API_KEY=xxx
npx tsx scripts/check-domains.ts \
  --domains-file=domains.txt \
  --dkim-selector=default \
  --out=mxtoolbox-report.csv
```

`domains.txt` — one domain per line, or a CSV with domains in the first column.

Output CSV: `domain, spf_ok, dkim_ok, dmarc_ok, dmarc_policy, blacklisted, blacklist_count`

## API reference (confirmed against MxToolbox's public docs)

**Base URL:** `https://api.mxtoolbox.com/api/v1`
**Auth:** `Authorization: <MXTOOLBOX_API_KEY>` header (not `Bearer <key>` — just the raw key)

**Lookup pattern:** `GET /Lookup/{command}/?argument={argument}`

| Command | Argument format | Checks |
|---|---|---|
| `spf` | domain | SPF record presence + validity |
| `dkim` | `domain:selector` (e.g. `example.com:default`) | DKIM record at that selector |
| `dmarc` | domain | DMARC record + policy |
| `blacklist` | domain or IP | Status across 100+ blacklists |
| `mx` | domain | MX records |
| `a` / `aaaa` / `txt` / `ptr` / `soa` | domain | Standard DNS record types |

Full command list and Monitor API (for standing blacklist alerts): `GET /Monitor`, `GET /Monitor/{MonitorUID}`.

**Response shape:** results come back with `Passed` / `Failed` / `Warnings` / `Information` arrays (MxToolbox's standard lookup response format across all commands) — the script above reads pass/fail off `Passed.length` and pulls the DMARC policy out of the raw record text. This is a best-effort parse against the documented pattern; if a field comes back empty unexpectedly, print the raw JSON for that domain and adjust.

**Rate limits / quotas:** Free tier = 64 DNS requests/day, 0 network (blacklist) requests. Paid plans raise both quotas separately — DNS and network/blacklist lookups draw from different pools. A `429`/quota-exceeded response returns HTTP 429.

## Gotchas

- **DKIM needs the right selector.** `default` is a common convention (including for ScaledMail-provisioned domains) but not universal — pass `--dkim-selector` if your provider uses something else, or the DKIM check will false-negative.
- **DNS quota and blacklist quota are separate pools** on paid plans. Running this across hundreds of domains can exhaust the DNS quota faster than the blacklist quota, or vice versa — watch for 429s and check which quota tripped.
- **Free tier has zero blacklist-check quota.** If you only need blacklist status occasionally, the web UI's free check (1 per 24h) may be cheaper than a paid API plan.
- **This is a cross-check, not a replacement** for `/email-deliverability-audit` — it doesn't see your actual send/reply/bounce data or Smartlead's internal reputation score.

## What to do next

**If any domain flags `blacklisted=true`:** go to `/deliverability-incident-response`'s "domain blacklisted" decision tree.

**If DKIM/SPF/DMARC missing:** reconnect the domain via `/scaledmail-domain-setup-public`, then re-run this check after DNS propagates.

**If all clean:** fold this into your `/cold-email-weekly-rhythm` Monday routine alongside `/email-deliverability-audit`.

## Related skills

- `/email-deliverability-audit` — the primary, fuller audit (send/reply/bounce metrics + spam placement test)
- `/deliverability-incident-response` — triage playbook once something's confirmed broken
- `/scaledmail-domain-setup-public` — where DNS auth records get configured in the first place

## Files

- `scripts/check-domains.ts` — batch SPF/DKIM/DMARC/blacklist check
