#!/usr/bin/env tsx
/**
 * Generic RapidAPI domain-enrichment runner.
 *
 * RapidAPI is a marketplace, not one fixed API — this script is a reusable
 * harness for whichever specific listing you've subscribed to (see SKILL.md's
 * shortlist). You supply the host + path + the query param name the listing
 * expects for a domain, and this script batches your domain list through it.
 *
 * Usage:
 *   export RAPIDAPI_KEY=xxx
 *   npx tsx scripts/enrich-domains.ts \
 *     --domains-file=companies.csv \
 *     --host=company-enrichment.p.rapidapi.com \
 *     --path=/enrich \
 *     --domain-param=domain \
 *     --out=enriched.csv
 *
 * Get --host and --path from the "Code Snippets" tab on the specific endpoint
 * page you subscribed to on rapidapi.com — that's the authoritative, always-
 * current source for a given listing's exact request shape. This script
 * assumes a simple GET-with-query-param pattern; if your listing needs a POST
 * body instead, adjust the fetch call below.
 */

import { readFileSync, writeFileSync } from "fs";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) {
  console.error("Missing env: RAPIDAPI_KEY");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    domainsFile: get("--domains-file"),
    host: get("--host"),
    path: get("--path"),
    domainParam: get("--domain-param") ?? "domain",
    extraParams: get("--extra-params") ?? "", // e.g. "country=US,format=json"
    out: get("--out") ?? "enriched.csv",
    minIntervalMs: Number(get("--min-interval-ms") ?? 500),
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

async function main() {
  const args = parseArgs();
  if (!args.domainsFile || !args.host || !args.path) {
    console.error(
      "Usage: --domains-file=<path> --host=<x-rapidapi-host> --path=</endpoint> " +
      "[--domain-param=domain] [--extra-params=k=v,k2=v2] [--out=path]"
    );
    process.exit(1);
  }
  const domains = [...new Set(readDomains(args.domainsFile))].filter(Boolean);
  console.error(`Enriching ${domains.length} domains via https://${args.host}${args.path}`);

  const extra = Object.fromEntries(
    args.extraParams.split(",").filter(Boolean).map((kv) => kv.split("=").map((s) => s.trim()))
  );

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    if (i % 25 === 0) console.error(`  ${i}/${domains.length}`);
    const params = new URLSearchParams({ [args.domainParam]: domain, ...extra });
    try {
      const resp = await fetch(`https://${args.host}${args.path}?${params.toString()}`, {
        headers: {
          "X-RapidAPI-Key": RAPIDAPI_KEY!,
          "X-RapidAPI-Host": args.host,
        },
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.error(`  ${domain}: ${resp.status} ${t.slice(0, 150)}`);
        rows.push({ input_domain: domain, error: `${resp.status}` });
      } else {
        const data = await resp.json();
        rows.push({ input_domain: domain, raw_json: JSON.stringify(data) });
      }
    } catch (err) {
      console.error(`  ${domain}: ${String(err).slice(0, 150)}`);
      rows.push({ input_domain: domain, error: String(err).slice(0, 150) });
    }
    await new Promise((r) => setTimeout(r, args.minIntervalMs));
  }

  const headers = ["input_domain", "raw_json", "error"];
  const csv = [headers.join(",")]
    .concat(
      rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
    )
    .join("\n");
  writeFileSync(args.out, csv);
  console.error(
    `\nWrote ${args.out} — ${rows.length} rows (raw JSON per row; write a follow-up pass to flatten ` +
    `the specific fields your chosen listing returns once you've seen a live response)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
