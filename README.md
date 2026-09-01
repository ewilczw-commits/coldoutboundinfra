# Cold Outbound Skills

Open-source [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) for cold email infrastructure, lead sourcing, copywriting, and operations.

37 skills that work together. Clone the repo, bring your API keys, point Claude Code at it, go from zero to a running campaign.

**New here?** Invoke `/cold-email-kickoff` — it's the guided entry point that orchestrates ICP + lead magnet + strategy + plan in one flow.

## What's in here

37 skills organized in 5 tracks, plus 19 signal playbooks in Track 6 — each shipping three ways (a Claude skill, a Clay table build, and a Clay CLI workflow).

**New to cold email? Start with `/cold-email-kickoff`.** It orchestrates ICP → lead magnet → campaign strategy → plan in one guided flow.

### Track 1 — Strategy (before you send anything)
- **`cold-email-kickoff`** — single "start here" orchestrator (recommended entry point)
- **`icp-onboarding`** — conversational intake that produces a `client-profile.yaml` (scrapes website first)
- **`lead-magnet-brainstorm`** — figure out what to offer for free in your cold emails
- **`campaign-strategy`** — generates 15-25 campaign ideas with AI strategies + value props
- **`campaign-copywriting`** — stepwise copy writer (direction → subject → body → final YAML)

### Track 2 — Infrastructure
- **`scaledmail-domain-setup-public`** — buy `.com`/`.co` domains and provision Google/Microsoft 365/SMTP inboxes end-to-end on ScaledMail (DNS auth configured for you)
- **`smartlead-inbox-manager`** — warmup settings, signatures (name/title/company/address), active/insurance tagging
- **`email-deliverability-audit`** — diagnostic tool (SPF/DKIM/DMARC, spam placement, 1% rule)
- **`mxtoolbox-deliverability-check`** — independent third-party SPF/DKIM/DMARC + blacklist cross-check via MxToolbox
- **`deliverability-incident-response`** — triage playbook for spam, bounces, blacklists, warmup blocks

### Track 3 — List Building
- **`list-builder`** — the meta skill for any list request: one-command lanes that sweep every source, AI-qualify every company, snowball until the market is dry, then pull uncapped contacts and find emails
- **`list-expander`** — turn ~10 known-good seed companies into a full qualified TAM (fingerprint → lookalikes → mined filters → wide pull → AI qualification → live-site verify)
- **`prospeo-full-export`** — title-first lead search (paginated, 25K+)
- **`prospeo-search-api`** — Prospeo filter reference
- **`blitz-list-builder`** — domain-first contact discovery
- **`ai-ark-list-builder`** — people/company search + lookalike company discovery + async email-find export via AI Ark
- **`quickenrich-list-builder`** — domain-first contact discovery via QuickEnrich, an alternative/supplement to Blitz
- **`google-maps-list-builder`** — scrape Google Maps for local SMB lists
- **`disco-like`** — lookalike company discovery (seed domains or NL ICP text)
- **`competitor-engagers`** — find people engaging with competitor LinkedIn posts
- **`apify-lead-enrichment`** — append firmographics (industry, headcount, revenue) to a domain list via an Apify actor
- **`rapidapi-lead-enrichment`** — generic harness + curated shortlist of RapidAPI Hub enrichment listings
- **`icp-prompt-builder`** — required qualification step invoked by every list-building skill
- **`list-quality-scorecard`** — grade a lead CSV across 8 dimensions before uploading
- **`millionverifier-email-verification`** — single or bulk email verification before any upload

### Track 4 — Copy & Send
- **`cold-email-starter-kit`** — the 14-step end-to-end tutorial (alternative to `/cold-email-kickoff`)
- **`spam-word-checker`** — scan copy for deliverability-killing phrases
- **`smartlead-spintax`** — add spintax variations to emails
- **`smartlead-api`** — Smartlead API reference
- **`smartlead-campaign-upload-public`** — DRAFT-upload leads.csv + variants.yaml to Smartlead (always DRAFT, you hit Start manually)
- **`instantly-campaign-upload-public`** — same leads.csv + variants.yaml, uploaded to Instantly instead (created but not activated)

### Track 5 — Iterate & Automate
- **`positive-reply-scoring`** — the metric that matters (positive replies / total sent)
- **`experiment-design`** — single-variable experiment framework
- **`auto-research-public`** — autonomous campaign launcher (scrape → ICP → leads → personalize → upload)
- **`personalization-subagent-pattern`** — reusable pattern for per-lead Claude sub-agent personalization
- **`deliverability-test-public`** — compare reply/bounce by inbox type
- **`cold-email-weekly-rhythm`** — Monday/Wednesday/Friday operational playbook — what separates hobbyist from top-1%


### Track 6 — Signal Playbooks

Nineteen playbooks, each turning **one buying signal into one copy-ready sentence**. They live
together in **[`skills/playbooks/`](skills/playbooks/)** — start at
[`clay-playbooks`](skills/playbooks/clay-playbooks/) for the index and the two build harnesses.

Every playbook ships the same three files:

| File | What it is |
|---|---|
| `SKILL.md` | the playbook: source chain, output contract, locked prompt, edge cases |
| `clay-table.md` | the Clay **table** build — columns, formulas, credit gates (browser-driven) |
| `clay-workflow.md` | the Clay **workflow** build via the `clay` CLI (terminal-driven) |

*Tables are browser-driven and workflows are CLI-driven because of a real constraint: the `clay` CLI
is read-only for tables, but can create, edit and publish workflows.*

- **Person signals** — `new-in-role` · `linkedin-engagement` · `social-posts` · `warm-intros`
- **Company signals** — `fundraising` · `hiring-surge` · `job-posting-language` · `ad-library`
- **Website signals** — `pricing-page` · `case-study-page` · `tech-on-website` · `google-site-search`
- **List shaping** — `company-name-cleaning` · `first-name-cleaning` · `social-link-finding` · `lookalikes` · `name-to-other-prospects`
- **Copy generation** — `ai-specificity` · `creative-ideas`

⚠️ Each `SKILL.md` carries a verification line saying what was actually run and on how many rows. The
`clay-table.md` and `clay-workflow.md` files are documented recipes that **have not been built and run
in a live Clay workspace** — written against the real Clay action catalog and CLI surface, but treat
them as specifications: build one, run 5 rows, read the output, fix the file.

## Getting started

### 1. Install Claude Code

This repo is designed for Claude Code. Install from https://claude.com/claude-code.

### 2. Clone and configure

```bash
git clone <this-repo-url> ~/cold-email-ai-skills
cd ~/cold-email-ai-skills
cp .env.example .env
# Edit .env with your API keys (you don't need all of them — only the skills you'll use)
```

### 3. Install dependencies

```bash
npm install -g tsx
cd skills/cold-email-starter-kit
npm install
```

### 4. Verify credentials

```bash
npx tsx skills/cold-email-starter-kit/scripts/verify-credentials.ts
```

### 5. Start with the kickoff orchestrator

If you've never run cold email before, invoke the kickoff skill from Claude Code:

```
/cold-email-kickoff
```

It asks whether you have infrastructure already, then orchestrates ICP + lead magnet + campaign strategy + plan in a single guided flow. Produces a `campaign-plan.md` and hands you off to the right next skill based on your current state.

Alternative: `/cold-email-starter-kit` — the longer manual 14-step tutorial. Use this if you want to learn each piece deeply rather than move fast.

## API keys required (bring your own)

| Service | Env var | What it's for | Skills that use it |
|---|---|---|---|
| Smartlead | `SMARTLEAD_API_KEY` | Send emails, manage inboxes | inbox-manager, starter-kit, auto-research, audit, scoring |
| Prospeo | `PROSPEO_API_KEY` | List building (title-first) | prospeo-*, auto-research |
| ScaledMail | `SCALEDMAIL_API_KEY` | Buy domains + provision inboxes | scaledmail-domain-setup |
| Dynadot | `DYNADOT_API_KEY` | Buy domains (legacy DIY flow) | starter-kit only |
| MillionVerifier | `MILLIONVERIFIER_API_KEY` | Validate emails before sending | millionverifier-email-verification, waterfall, auto-research |
| Blitz | `BLITZ_API_KEY` | Domain-to-contacts lookup | blitz-list-builder |
| AI Ark | `AIARK_API_KEY` | People/company search + lookalikes | ai-ark-list-builder |
| QuickEnrich | `QUICKENRICH_API_KEY` | Domain-first contact discovery | quickenrich-list-builder |
| RapidAPI | `RAPIDAPI_KEY` | Google Maps scraping, LinkedIn data, enrichment | google-maps-*, competitor-engagers, rapidapi-lead-enrichment |
| Apify | `APIFY_API_TOKEN` | Firmographic enrichment, Track 6 playbooks | apify-lead-enrichment, ad-library, linkedin-engagement |
| Versium | `VERSIUM_API_KEY` | Data source behind the Apify enrichment actor | apify-lead-enrichment |
| MxToolbox | `MXTOOLBOX_API_KEY` | Blacklist/DNS deliverability cross-check | mxtoolbox-deliverability-check |
| Instantly | `INSTANTLY_API_KEY` | Alternative sending platform | instantly-campaign-upload-public, starter-kit (09) |
| OpenWebNinja | `OPENWEBNINJA_KEY` | Company news enrichment | starter-kit (07) |
| OpenRouter | `OPENROUTER_API_KEY` | AI company analysis enrichment | starter-kit (07), competitor-engagers |

The minimum viable setup for your first campaign is: **ScaledMail + Prospeo + Smartlead**. Start there, add more as you need them.

## Recommended path

**If you've never run cold email:**
1. `/cold-email-kickoff` — one guided flow: ICP → lead magnet → strategy → plan → next-skill menu
2. Follow the menu's recommended next skill (infra setup OR list building, depending on your current state)
3. After campaign launch, wait 21 days, then `/positive-reply-scoring`
4. Add `/cold-email-weekly-rhythm` to your calendar for ongoing ops

**If you have experience but no automation:**
1. `/icp-onboarding` — lock down your ICP
2. `/smartlead-inbox-manager` — configure your existing inboxes properly
3. `/email-deliverability-audit` — fix any domain/inbox issues before scaling
4. `/auto-research-public` — daily automated campaign launches

**If you're debugging a broken campaign:**
1. `/email-deliverability-audit` — find the infrastructure issue
2. `/positive-reply-scoring` — see if replies are positive or hostile
3. `/deliverability-test-public` — compare across inbox types
4. `/spam-word-checker` — scan copy for banned phrases

## Directory layout

```
cold-email-ai-skills/
  README.md                    # this file
  .env.example                 # template for your API keys
  skills/
    <skill-name>/
      SKILL.md                 # the skill definition (required)
      scripts/                 # runnable code
      references/              # deeper docs
  profiles/                    # YOUR client profiles + experiment logs (gitignored)
    <business-slug>/
      client-profile.yaml
      experiments/
      scores/
```

## Cost expectations

First campaign (2,000 leads, 20 domains, 40 inboxes):
- Domains + inboxes (ScaledMail package): tiered/volume-based, quote-based via their package calculator — run `/scaledmail-domain-setup-public`'s Calculate Package step for your actual volume. As a rough planning ballpark (based on the prior Dynadot+Zapmail split this replaced): ~$240 one-time for 20 domains + ~$60/mo for 40 inboxes.
- Prospeo: ~$20 for 2,000-lead export
- Smartlead: ~$39/mo starter plan
- MillionVerifier: ~$5 for 2,000 validations
- **Month 1 total: ~$360 (confirm domain/inbox cost against ScaledMail's calculator). Recurring: ~$130/mo.**

See `skills/cold-email-starter-kit/references/00-getting-started.md` for the original full breakdown (still accurate for that tutorial's legacy Dynadot+Zapmail flow).

## License

MIT — use it, fork it, profit from it. Attribution appreciated but not required.
