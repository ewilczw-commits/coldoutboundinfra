#!/usr/bin/env tsx
/**
 * AI Ark — search + email-find people in one async export job, write CSV.
 *
 * Usage:
 *   export AIARK_API_KEY=xxx
 *   npx tsx scripts/export-people.ts \
 *     --domains=acme.com,other.com \
 *     --titles="VP Marketing,Head of Growth" \
 *     --size=2000 \
 *     --out=leads.csv
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
    domains: (get("--domains") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    titles: (get("--titles") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    seniority: (get("--seniority") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    size: Math.min(Number(get("--size") ?? 500), 10000),
    out: get("--out") ?? "leads.csv",
    pollIntervalMs: Number(get("--poll-interval-ms") ?? 10000),
    pollTimeoutMin: Number(get("--poll-timeout-min") ?? 30),
  };
}

async function aiArkFetch(path: string, init: RequestInit = {}): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-TOKEN": AIARK_API_KEY!,
        ...init.headers,
      },
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

interface LeadRow {
  first_name: string;
  last_name: string;
  email: string;
  email_status: string;
  title: string;
  linkedin_url: string;
  company_name: string;
  company_domain: string;
}

function toCsv(rows: LeadRow[]): string {
  const headers: (keyof LeadRow)[] = [
    "first_name",
    "last_name",
    "email",
    "email_status",
    "title",
    "linkedin_url",
    "company_name",
    "company_domain",
  ];
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(
      headers
        .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  return out.join("\n");
}

async function main() {
  const args = parseArgs();
  if (args.domains.length === 0 && args.titles.length === 0) {
    console.error("Usage: --domains=csv and/or --titles=csv [--seniority=csv] [--size=N] [--out=path]");
    process.exit(1);
  }

  const body: any = { page: 0, size: args.size };
  if (args.domains.length > 0) {
    body.account = { domain: { any: { include: args.domains } } };
  }
  if (args.titles.length > 0 || args.seniority.length > 0) {
    body.contact = {};
    if (args.titles.length > 0) body.contact.title = { any: { include: args.titles } };
    if (args.seniority.length > 0) body.contact.seniority = { any: { include: args.seniority } };
  }

  console.error(`Submitting export job for ${args.size} people...`);
  const submitted = await aiArkFetch("/v1/people/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const trackId = submitted.trackId;
  if (!trackId) throw new Error(`No trackId in response: ${JSON.stringify(submitted)}`);
  console.error(`trackId=${trackId} — polling every ${args.pollIntervalMs / 1000}s (trackId expires 6h after the job started)`);

  const deadline = Date.now() + args.pollTimeoutMin * 60_000;
  let stats = submitted.statistics ?? { total: args.size, found: 0 };
  while (Date.now() < deadline) {
    const statsResp = await aiArkFetch(`/v1/people/export/statistics/${trackId}`, { method: "POST" });
    stats = statsResp.statistics ?? stats;
    const done = (stats.success ?? 0) + (stats.failed ?? 0);
    console.error(`  progress: ${done}/${stats.total ?? "?"} (found emails: ${stats.found ?? 0})`);
    if (statsResp.state === "DONE" || done >= (stats.total ?? args.size)) break;
    await new Promise((r) => setTimeout(r, args.pollIntervalMs));
  }

  // Paginate through results (max 100/page)
  const rows: LeadRow[] = [];
  let page = 0;
  const pageSize = 100;
  while (true) {
    const resultsResp = await aiArkFetch(`/v1/people/export/results/${trackId}`, {
      method: "POST",
      body: JSON.stringify({ page, size: pageSize }),
    });
    const content = resultsResp.content ?? [];
    for (const item of content) {
      const profile = item.profile ?? item.input ?? {};
      const emails = item.output?.emails ?? item.emails ?? [];
      const bestEmail = emails.find((e: any) => e.status === "VALID") ?? emails[0] ?? {};
      rows.push({
        first_name: profile.first_name ?? profile.firstname ?? "",
        last_name: profile.last_name ?? profile.lastname ?? "",
        email: bestEmail.email ?? "",
        email_status: bestEmail.status ?? "",
        title: item.company?.title ?? profile.headline ?? "",
        linkedin_url: item.link?.linkedin ?? "",
        company_name: item.company?.name ?? "",
        company_domain: item.company?.domain ?? "",
      });
    }
    page++;
    if (content.length < pageSize || page * pageSize >= (resultsResp.totalElements ?? 0)) break;
  }

  writeFileSync(args.out, toCsv(rows));
  const withEmail = rows.filter((r) => r.email).length;
  console.error(`\nWrote ${args.out} — ${rows.length} people (${withEmail} with a valid email)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
