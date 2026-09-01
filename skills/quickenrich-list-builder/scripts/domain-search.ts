#!/usr/bin/env tsx
/**
 * QuickEnrich — domain-first employee search, write CSV.
 * For each input domain, pulls contacts (title-filterable) with email/phone when found.
 *
 * Usage:
 *   export QUICKENRICH_API_KEY=xxx
 *   npx tsx scripts/domain-search.ts \
 *     --domains-file=companies.csv \
 *     --titles=owner,founder,ceo \
 *     --has-email=true \
 *     --out=contacts.csv
 */

import { readFileSync, writeFileSync } from "fs";

const QUICKENRICH_API_KEY = process.env.QUICKENRICH_API_KEY;
if (!QUICKENRICH_API_KEY) {
  console.error("Missing env: QUICKENRICH_API_KEY");
  process.exit(1);
}

const BASE_URL = "https://app.quickenrich.io/api";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    domainsFile: get("--domains-file"),
    titles: (get("--titles") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    hasEmail: get("--has-email") === "true",
    out: get("--out") ?? "contacts.csv",
    // Domain search is rate-limited to 300 req/min per QuickEnrich's published tiers.
    // Stay comfortably under that.
    minIntervalMs: Number(get("--min-interval-ms") ?? 250),
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

async function quickEnrichFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${QUICKENRICH_API_KEY}` },
    });
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`${resp.status}: ${t.slice(0, 300)}`);
    }
    return resp.json();
  }
  throw new Error(`exhausted retries for ${path}`);
}

interface ContactRow {
  company_domain: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone: string;
}

function toCsv(rows: ContactRow[]): string {
  const headers: (keyof ContactRow)[] = ["company_domain", "first_name", "last_name", "title", "email", "phone"];
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return out.join("\n");
}

function cleanDomain(d: string): string {
  return d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
}

async function main() {
  const args = parseArgs();
  if (!args.domainsFile) {
    console.error("Usage: --domains-file=<path> [--titles=csv] [--has-email=true] [--out=path]");
    process.exit(1);
  }
  const domains = [...new Set(readDomains(args.domainsFile).map(cleanDomain))].filter(Boolean);
  console.error(`Searching ${domains.length} domains (titles: ${args.titles.join(", ") || "any"})`);

  const rows: ContactRow[] = [];
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    if (i % 25 === 0) console.error(`  ${i}/${domains.length}`);
    let page = 1;
    while (true) {
      const params: Record<string, string> = { company_url: domain, page: String(page) };
      if (args.titles.length > 0) params.title = args.titles.join(",");
      if (args.hasEmail) params.has_email = "true";
      try {
        const data = await quickEnrichFetch("/employees/dataset-search", params);
        const items = data.data ?? data.results ?? [];
        for (const e of items) {
          rows.push({
            company_domain: domain,
            first_name: e.first_name ?? "",
            last_name: e.last_name ?? "",
            title: e.title ?? e.job_title ?? "",
            email: e.email ?? "",
            phone: e.phone ?? "",
          });
        }
        // Up to 20 contacts per page — stop once a page comes back short.
        if (items.length < 20) break;
        page++;
      } catch (err) {
        console.error(`  ${domain} p${page}: ${String(err).slice(0, 120)}`);
        break;
      }
      await new Promise((r) => setTimeout(r, args.minIntervalMs));
    }
    await new Promise((r) => setTimeout(r, args.minIntervalMs));
  }

  writeFileSync(args.out, toCsv(rows));
  const withEmail = rows.filter((r) => r.email).length;
  console.error(`\nWrote ${args.out} — ${rows.length} contacts (${withEmail} with email)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
