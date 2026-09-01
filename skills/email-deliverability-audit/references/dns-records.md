# DNS Records for Cold Email Deliverability

Three records every sending domain needs: **SPF, DKIM, DMARC**. Miss any one and your deliverability suffers.

## SPF (Sender Policy Framework)

Declares which servers are allowed to send mail on behalf of your domain.

**Record type:** TXT
**Host:** `@` (the bare domain, e.g. `example.com`)
**Value format:**
```
v=spf1 include:<provider> ~all
```

### Examples

| Provider | SPF value |
|---|---|
| ScaledMail | auto-published on connect — read the exact `include:` host back from `dig TXT` after connecting rather than assuming a fixed string |
| Google Workspace | `v=spf1 include:_spf.google.com ~all` |
| Microsoft 365 | `v=spf1 include:spf.protection.outlook.com ~all` |
| SendGrid | `v=spf1 include:sendgrid.net ~all` |

### Strictness modifiers

- `~all` (soft fail) — emails that fail get marked suspicious but usually still delivered. **Default for new domains.**
- `-all` (hard fail) — emails that fail get rejected. **Only use after weeks of clean mail.**
- `+all` — allows any sender. **NEVER use. Makes SPF useless.**
- `?all` — neutral. Same as no SPF.

### Verify
```bash
dig TXT example.com +short | grep spf1
```

## DKIM (DomainKeys Identified Mail)

Cryptographic signature that proves the email wasn't modified in transit.

**Record type:** TXT
**Host:** `<selector>._domainkey` (e.g. `default._domainkey` is the common convention for white-glove providers like ScaledMail, `google._domainkey` for Workspace — confirm the actual selector your provider published rather than assuming)
**Value:** Long public key provided by your sending provider. Looks like:
```
v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
```

### Common "default" selector
Many white-glove providers (ScaledMail included) publish DKIM at the `default` selector. Check with:
```bash
dig TXT default._domainkey.example.com +short
```
If that returns nothing, check your provider's dashboard for the actual selector name before concluding DKIM is missing.

### Workspace selector
`google._domainkey.example.com`

### Microsoft 365 selectors
`selector1._domainkey.example.com` and `selector2._domainkey.example.com`

### Why it's often missing
- Domain wasn't connected through the sending provider's onboarding flow
- Selector published on old provider, domain migrated without re-publishing
- Propagation not yet complete (wait up to 48h after setup)

## DMARC (Domain-based Message Authentication, Reporting and Conformance)

Tells receiving servers what to do with emails that fail SPF/DKIM, and where to send reports.

**Record type:** TXT
**Host:** `_dmarc`
**Minimum value:**
```
v=DMARC1; p=none; rua=mailto:dmarc@example.com
```

### Policy levels

- `p=none` — monitor only. Failing emails still delivered. Reports sent to `rua=` address. **Start here.**
- `p=quarantine` — failing emails go to spam. **Upgrade to this after 1-2 weeks of clean `rua=` reports.**
- `p=reject` — failing emails bounced. **Strictest. Use only after 30+ days confirmed clean.**

### Additional tags

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; pct=100; adkim=r; aspf=r
```

- `rua` — aggregate reports (daily summary). Set this.
- `ruf` — forensic reports (per-failure detail). Optional, gets noisy.
- `pct` — percentage of failing mail to apply policy to. Start at 100.
- `adkim=r|s` — DKIM alignment mode. `r` = relaxed (subdomain OK), `s` = strict.
- `aspf=r|s` — SPF alignment mode. Same as above.

### Verify
```bash
dig TXT _dmarc.example.com +short
```

## Checklist for a new domain

1. **Day 0 — registration:** point nameservers to your sending provider (e.g., ScaledMail)
2. **Day 0-1 — DNS propagation:** wait 20 min - 48h for records to appear
3. **Day 1 — verify all three:**
   ```bash
   dig TXT example.com +short
   dig TXT default._domainkey.example.com +short
   dig TXT _dmarc.example.com +short
   ```
4. **Day 1-14 — warmup:** DMARC `p=none`, SPF `~all`. Warm inboxes slowly.
5. **Day 14 — tighten DMARC:** switch to `p=quarantine` if aggregate reports are clean.
6. **Day 30+ — optional reject:** switch to `p=reject` if you're confident no legitimate mail will fail.

## Common failure patterns

| Symptom | Likely cause |
|---|---|
| SPF present but marked soft-fail in DMARC reports | SPF `include:` list missing your provider |
| DKIM signature in email but DMARC still fails | From-domain doesn't match DKIM-signing domain (alignment issue) |
| DMARC reports show failures from your own sending | DKIM selector moved or expired |
| Emails landing in spam despite all 3 passing | Domain reputation issue — content/behavior, not auth |
| Brand-new domain, all auth fails | DNS propagation still in progress, wait 48h |

## How ScaledMail handles this

ScaledMail's order flow publishes SPF, DKIM, and DMARC (`p=none`) automatically when a domain is purchased/connected through them — see `/scaledmail-domain-setup-public`. If any are missing:
- Check the domain's status via the **Get Domains** endpoint (or dashboard) — DNS may still be propagating
- Confirm the domain was actually purchased/connected through ScaledMail rather than pointed there manually
- Wait longer for DNS propagation before concluding something's broken

If you need more control, ask ScaledMail support about a "custom DNS" or manual-records option, or publish records yourself at your registrar.
