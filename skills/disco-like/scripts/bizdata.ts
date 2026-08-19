#!/usr/bin/env tsx
/**
 * DiscoLike /bizdata — single-domain firmographic lookup.
 *
 * Returns: name, address, phones, public_emails, social_urls, description, keywords,
 * industry_groups, employees, score, start_date, status, redirect_domain.
 *
 * Subdomains are normalized to root domain server-side.
 *
 * Usage:
 *   export DISCOLIKE_API_KEY=xxx
 *   npx tsx scripts/bizdata.ts acmecorp.com
 *   npx tsx scripts/bizdata.ts --domain acmecorp.com
 *
 * API reference: https://api.discolike.com/v1/docs/api/endpoints/bizdata/
 */

const DISCOLIKE_BASE = "https://api.discolike.com/v1";
const API_KEY = process.env.DISCOLIKE_API_KEY;
if (!API_KEY) {
  console.error("Missing env: DISCOLIKE_API_KEY (get one at https://app.discolike.com/account/management/keys)");
  process.exit(1);
}

function getDomain(): string | undefined {
  const args = process.argv.slice(2);
  const idxEq = args.findIndex((a) => a.startsWith("--domain="));
  if (idxEq >= 0) return args[idxEq].split("=").slice(1).join("=");
  const idxSp = args.indexOf("--domain");
  if (idxSp >= 0 && idxSp + 1 < args.length) return args[idxSp + 1];
  const positional = args.find((a) => !a.startsWith("--"));
  return positional;
}

async function main() {
  const domain = getDomain();
  if (!domain) {
    console.error("Usage: npx tsx scripts/bizdata.ts <domain>  (or --domain <domain>)");
    process.exit(1);
  }

  const url = `${DISCOLIKE_BASE}/bizdata?domain=${encodeURIComponent(domain)}`;
  const resp = await fetch(url, { headers: { "x-discolike-key": API_KEY! } });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error(`${resp.status}: ${t.slice(0, 400)}`);
    process.exit(1);
  }
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
