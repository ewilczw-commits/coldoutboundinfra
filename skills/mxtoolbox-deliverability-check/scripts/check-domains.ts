#!/usr/bin/env tsx
/**
 * MxToolbox — batch SPF/DKIM/DMARC/blacklist check across a list of sending domains.
 * Independent third-party cross-check to run alongside /email-deliverability-audit.
 *
 * Usage:
 *   export MXTOOLBOX_API_KEY=xxx
 *   npx tsx scripts/check-domains.ts --domains-file=domains.txt --dkim-selector=default --out=mxtoolbox-report.csv
 */

import { readFileSync, writeFileSync } from "fs";

const API_KEY = process.env.MXTOOLBOX_API_KEY;
if (!API_KEY) {
  console.error("Missing env: MXTOOLBOX_API_KEY");
  process.exit(1);
}

const BASE_URL = "https://api.mxtoolbox.com/api/v1";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    domainsFile: get("--domains-file"),
    dkimSelector: get("--dkim-selector") ?? "default",
    out: get("--out") ?? "mxtoolbox-report.csv",
    minIntervalMs: Number(get("--min-interval-ms") ?? 1000),
  };
}

function readDomains(path: string): string[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split(",")[0].trim())
    .filter(Boolean);
}

async function mxLookup(command: string, argument: string): Promise<any> {
  const url = `${BASE_URL}/Lookup/${command}/?argument=${encodeURIComponent(argument)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, { headers: { Authorization: API_KEY! } });
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { error: `${resp.status}: ${t.slice(0, 200)}` };
    }
    return resp.json();
  }
  return { error: "exhausted retries (429)" };
}

interface DomainReport {
  domain: string;
  spf_ok: string;
  dkim_ok: string;
  dmarc_ok: string;
  dmarc_policy: string;
  blacklisted: string;
  blacklist_count: string;
}

function toCsv(rows: DomainReport[]): string {
  const headers: (keyof DomainReport)[] = [
    "domain",
    "spf_ok",
    "dkim_ok",
    "dmarc_ok",
    "dmarc_policy",
    "blacklisted",
    "blacklist_count",
  ];
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return out.join("\n");
}

async function main() {
  const args = parseArgs();
  if (!args.domainsFile) {
    console.error("Usage: --domains-file=<path> [--dkim-selector=default] [--out=path]");
    process.exit(1);
  }
  const domains = readDomains(args.domainsFile);
  console.error(`Checking ${domains.length} domains (SPF, DKIM selector="${args.dkimSelector}", DMARC, blacklist)...`);

  const rows: DomainReport[] = [];
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    if (i % 10 === 0) console.error(`  ${i}/${domains.length}`);

    const [spf, dkim, dmarc, blacklist] = await Promise.all([
      mxLookup("spf", domain),
      mxLookup("dkim", `${domain}:${args.dkimSelector}`),
      mxLookup("dmarc", domain),
      mxLookup("blacklist", domain),
    ]);

    const dmarcRecord = dmarc?.Information?.[0]?.Value ?? dmarc?.Failed?.[0]?.Value ?? "";
    const policyMatch = /p=(\w+)/.exec(String(dmarcRecord));
    const blacklistHits = blacklist?.Failed?.length ?? 0;

    rows.push({
      domain,
      spf_ok: String(!spf?.error && (spf?.Passed?.length ?? 0) > 0),
      dkim_ok: String(!dkim?.error && (dkim?.Passed?.length ?? 0) > 0),
      dmarc_ok: String(!dmarc?.error && (dmarc?.Passed?.length ?? 0) > 0),
      dmarc_policy: policyMatch?.[1] ?? "none/missing",
      blacklisted: String(blacklistHits > 0),
      blacklist_count: String(blacklistHits),
    });

    await new Promise((r) => setTimeout(r, args.minIntervalMs));
  }

  writeFileSync(args.out, toCsv(rows));
  const flagged = rows.filter((r) => r.spf_ok === "false" || r.dkim_ok === "false" || r.blacklisted === "true");
  console.error(`\nWrote ${args.out} — ${rows.length} domains checked, ${flagged.length} flagged`);
  if (flagged.length) {
    console.error(`Flagged: ${flagged.map((r) => r.domain).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
