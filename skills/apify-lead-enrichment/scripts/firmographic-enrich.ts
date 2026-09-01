#!/usr/bin/env tsx
/**
 * Apify — append firmographics (industry, headcount, revenue, address, etc.) to a
 * list of company domains via the "Firmographic Append API" actor
 * (nabeelbaghoor/firmographic-append-api), which wraps Versium's B2B data API.
 *
 * Requires TWO keys: your Apify token (to run the actor) and your own Versium
 * API key (passed as the actor's `apiKey` input — the actor is a thin wrapper,
 * it does not supply Versium access itself).
 *
 * Usage:
 *   export APIFY_API_TOKEN=xxx
 *   export VERSIUM_API_KEY=xxx
 *   npx tsx scripts/firmographic-enrich.ts \
 *     --domains-file=companies.csv \
 *     --require=Country=US \
 *     --out=enriched.csv
 */

import { readFileSync, writeFileSync } from "fs";

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const VERSIUM_API_KEY = process.env.VERSIUM_API_KEY;
if (!APIFY_API_TOKEN) {
  console.error("Missing env: APIFY_API_TOKEN");
  process.exit(1);
}
if (!VERSIUM_API_KEY) {
  console.error("Missing env: VERSIUM_API_KEY (this actor wraps Versium's B2B data API — you need your own Versium account/key, separate from Apify)");
  process.exit(1);
}

const ACTOR_ID = "nabeelbaghoor~firmographic-append-api";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    domainsFile: get("--domains-file"),
    require: (get("--require") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    maxResults: Number(get("--max-results") ?? 5000),
    skipUnmatched: get("--skip-unmatched") !== "false",
    out: get("--out") ?? "enriched.csv",
  };
}

function readDomains(path: string): string[] {
  const text = readFileSync(path, "utf8").trim();
  const lines = text.split("\n");
  const header = lines[0].split(",").map((c) => c.replace(/"/g, "").trim());
  const idx = header.indexOf("company_domain");
  if (idx >= 0) {
    return lines.slice(1).map((l) => l.split(",")[idx]?.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  return lines.map((l) => l.split(",")[0].trim()).filter(Boolean);
}

interface EnrichedRow {
  input_domain: string;
  matched: string;
  business_name: string;
  domain: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  industry: string;
  naics: string;
  sic: string;
  employee_count: string;
  sales_volume: string;
  year_founded: string;
}

function toCsv(rows: EnrichedRow[]): string {
  const headers = Object.keys(rows[0] ?? {}) as (keyof EnrichedRow)[];
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(headers.map((h) => `"${String((r as any)[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return out.join("\n");
}

async function main() {
  const args = parseArgs();
  if (!args.domainsFile) {
    console.error("Usage: --domains-file=<path> [--require=Country=US] [--max-results=N] [--out=path]");
    process.exit(1);
  }
  const domains = [...new Set(readDomains(args.domainsFile))].filter(Boolean);
  console.error(`Enriching ${domains.length} domains via Apify actor ${ACTOR_ID}...`);
  console.error(`Cost: ~$12 per 1,000 MATCHED results (misses/dupes are free) — expect this call to bill for however many of ${domains.length} actually match.`);

  const input: any = {
    domains,
    apiKey: VERSIUM_API_KEY,
    skipUnmatched: args.skipUnmatched,
    maxResults: args.maxResults,
  };
  if (args.require.length > 0) input.requireValues = args.require;

  // run-sync-get-dataset-items has a ~5 minute execution window. For lists large
  // enough to exceed that, switch to the async run endpoint (POST /v2/acts/{actorId}/runs)
  // and poll GET /v2/actor-runs/{runId} instead of this sync call.
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`${resp.status}: ${t.slice(0, 300)}`);
  }
  const items: any[] = await resp.json();

  const rows: EnrichedRow[] = items.map((item) => ({
    input_domain: item.query?.domain ?? item.input?.domain ?? "",
    matched: String(item.matched ?? Boolean(item.business_name)),
    business_name: item.business_name ?? "",
    domain: item.domain ?? "",
    website: item.website ?? "",
    phone: item.phone ?? "",
    address: item.address ?? "",
    city: item.city ?? "",
    state: item.state ?? "",
    zip: item.zip ?? "",
    country: item.country ?? "",
    industry: item.industry ?? "",
    naics: item.naics ?? "",
    sic: item.sic ?? "",
    employee_count: String(item.employee_count ?? ""),
    sales_volume: String(item.sales_volume ?? ""),
    year_founded: String(item.year_founded ?? ""),
  }));

  writeFileSync(args.out, toCsv(rows));
  const matched = rows.filter((r) => r.matched === "true").length;
  console.error(`\nWrote ${args.out} — ${rows.length} rows (${matched} matched)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
