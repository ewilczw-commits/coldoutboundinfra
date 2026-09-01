#!/usr/bin/env tsx
/**
 * AI Ark — find companies similar to up to 5 seed domains/LinkedIn URLs, write CSV.
 *
 * Usage:
 *   export AIARK_API_KEY=xxx
 *   npx tsx scripts/lookalike-companies.ts \
 *     --seeds=raisin.com,https://www.linkedin.com/company/n26 \
 *     --location=Germany \
 *     --size=200 \
 *     --out=lookalike-companies.csv
 */

import { writeFileSync } from "fs";

const AIARK_API_KEY = process.env.AIARK_API_KEY;
if (!AIARK_API_KEY) {
  console.error("Missing env: AIARK_API_KEY");
  process.exit(1);
}

const BASE_URL = "https://api.ai-ark.com/api/developer-portal";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    seeds: (get("--seeds") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
    location: (get("--location") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    size: Math.min(Number(get("--size") ?? 100), 100),
    out: get("--out") ?? "lookalike-companies.csv",
  };
}

interface CompanyRow {
  company_name: string;
  company_domain: string;
  linkedin_url: string;
  industry: string;
  description: string;
}

function toCsv(rows: CompanyRow[]): string {
  const headers: (keyof CompanyRow)[] = [
    "company_name",
    "company_domain",
    "linkedin_url",
    "industry",
    "description",
  ];
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return out.join("\n");
}

async function main() {
  const args = parseArgs();
  if (args.seeds.length === 0) {
    console.error("Usage: --seeds=domain1,domain2 (max 5, domains or LinkedIn company URLs) [--location=csv] [--size=N]");
    process.exit(1);
  }

  const body: any = { lookalikeDomains: args.seeds, page: 0, size: args.size };
  if (args.location.length > 0) {
    body.account = { location: { any: { include: args.location } } };
  }

  const resp = await fetch(`${BASE_URL}/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TOKEN": AIARK_API_KEY! },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  const rows: CompanyRow[] = (data.content ?? []).map((c: any) => ({
    company_name: c.summary?.name ?? "",
    company_domain: c.link?.domain ?? "",
    linkedin_url: c.link?.linkedin ?? "",
    industry: c.summary?.industry ?? "",
    description: c.summary?.description ?? "",
  }));

  writeFileSync(args.out, toCsv(rows));
  console.error(`Wrote ${args.out} — ${rows.length} lookalike companies (of ${data.totalElements ?? "?"} total matches)`);
  console.error(`Feed company_domain values into export-people.ts's --domains to find people at these companies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
