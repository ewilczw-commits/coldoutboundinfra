#!/usr/bin/env tsx
/**
 * DiscoLike lookalike discovery via natural-language ICP prompt → CSV.
 *
 * Usage:
 *   export DISCOLIKE_API_KEY=xxx
 *   npx tsx scripts/discover.ts --text "ecom companies specializing in lighting fixtures in US" --out lookalikes.csv
 *   npx tsx scripts/discover.ts --text "medical device manufacturing startups in EU" --country EU --out lookalikes.csv
 *   npx tsx scripts/discover.ts --text "Industrial automation distributors like heilind.com, bpx.co.uk, automation24.de" --out lookalikes.csv
 *   npx tsx scripts/discover.ts --text "outbound sales automation" --domains "clay.com,apollo.io" --out lookalikes.csv
 *
 * Flags use space OR =. CLI ergonomics map to API param names internally.
 * --text (alias --icp-prompt) is required; routes to the icp_prompt wizard
 * (auto-extracts country/employee_range/category/tech_stack and synthesizes a
 * seed-domain set from your prompt). --domains is optional augmentation —
 * pass reference domains to bias the seed set.
 * API reference: https://api.discolike.com/v1/docs/api/endpoints/discover/
 */

import { writeFileSync } from "fs";

const DISCOLIKE_BASE = "https://api.discolike.com/v1";
const API_KEY = process.env.DISCOLIKE_API_KEY;
if (!API_KEY) {
  console.error("Missing env: DISCOLIKE_API_KEY (get one at https://app.discolike.com/account/management/keys)");
  process.exit(1);
}

const MIN_RECORDS = 20;
const MAX_RECORDS_PER_CALL = 10000;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_COMPANIES = 500;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idxEq = args.findIndex((a) => a.startsWith(`${flag}=`));
    if (idxEq >= 0) return args[idxEq].split("=").slice(1).join("=");
    const idxSp = args.indexOf(flag);
    if (idxSp >= 0 && idxSp + 1 < args.length && !args[idxSp + 1].startsWith("--")) return args[idxSp + 1];
    return undefined;
  };
  const limitRaw = Number(get("--limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Math.max(MIN_RECORDS, Math.min(MAX_RECORDS_PER_CALL, limitRaw));
  const maxCompanies = Number(get("--max-companies") ?? get("--max-records") ?? DEFAULT_MAX_COMPANIES);

  return {
    // Vector input — --text (alias --icp-prompt) is required and maps to the
    // server-side icp_prompt wizard (auto-extracts country/employee_range/
    // category/tech_stack and synthesizes a seed-domain set from natural
    // language). --domains is optional augmentation.
    text: get("--text") ?? get("--icp-prompt"),
    domains: get("--domains"),
    negationDomains: get("--negation-domains") ?? get("--negate-domain"),

    // Location
    country: get("--country"),
    negateCountry: get("--negate-country"),
    state: get("--state"),

    // Company filters
    employeeRange: get("--employee-range"),
    category: get("--category"),
    negateCategory: get("--negate-category"),
    techStack: get("--tech-stack"),
    negateTechStack: get("--negate-tech-stack"),
    phraseMatch: get("--phrase-match"),
    minDigitalFootprint: get("--min-digital-footprint"),
    maxDigitalFootprint: get("--max-digital-footprint"),

    // Result controls
    limit,
    maxCompanies,
    variance: get("--variance"),
    minSimilarity: get("--min-similarity"),

    out: get("--out") ?? "lookalikes.csv",
  };
}

interface DiscoLikeCompany {
  domain: string;
  name?: string;
  description?: string;
  similarity?: number;
  score?: number;
  industry_groups?: Record<string, number>;
  employees?: string;
  address?: { country?: string; state?: string; city?: string };
  social_urls?: string[];
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, { headers: { "x-discolike-key": API_KEY! } });
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`${resp.status}: ${t.slice(0, 400)}`);
    }
    return resp;
  }
  throw new Error("exhausted retries");
}

function buildParams(args: ReturnType<typeof parseArgs>, text: string, offset: number): URLSearchParams {
  const p = new URLSearchParams();

  // --text → icp_prompt (the wizard: auto-extracts country/employee_range/
  // category/tech_stack and synthesizes seed domains from natural language).
  p.set("icp_prompt", text);
  if (args.domains) p.set("domain", args.domains);
  if (args.negationDomains) p.set("negate_domain", args.negationDomains);

  // Location
  if (args.country) p.set("country", args.country);
  if (args.negateCountry) p.set("negate_country", args.negateCountry);
  if (args.state) p.set("state", args.state);

  // Company filters
  if (args.employeeRange) p.set("employee_range", args.employeeRange);
  if (args.category) p.set("category", args.category);
  if (args.negateCategory) p.set("negate_category", args.negateCategory);
  if (args.techStack) p.set("tech_stack", args.techStack);
  if (args.negateTechStack) p.set("negate_tech_stack", args.negateTechStack);
  if (args.phraseMatch) p.set("phrase_match", args.phraseMatch);
  if (args.minDigitalFootprint) p.set("min_digital_footprint", args.minDigitalFootprint);
  if (args.maxDigitalFootprint) p.set("max_digital_footprint", args.maxDigitalFootprint);

  // Result controls — --limit is per-call page size, mapped to API max_records
  p.set("max_records", String(args.limit));
  if (offset) p.set("offset", String(offset));
  if (args.variance) p.set("variance", args.variance);
  if (args.minSimilarity) p.set("min_similarity", args.minSimilarity);

  return p;
}

function topIndustry(groups: Record<string, number> | undefined): string {
  if (!groups) return "";
  const entries = Object.entries(groups);
  if (!entries.length) return "";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function parseEmployeeMidpoint(e: string | undefined): number | "" {
  if (!e) return "";
  const m: Record<string, number> = {
    "1-10": 5,
    "11-50": 30,
    "51-200": 125,
    "201-500": 350,
    "501-1000": 750,
    "1001-5000": 3000,
    "5001-10000": 7500,
    "10001+": 15000,
  };
  return m[e] ?? "";
}

async function main() {
  const args = parseArgs();
  const { text } = args;
  if (!text) {
    console.error(
      "Missing --text / --icp-prompt (natural-language ICP prompt, required; routes to icp_prompt). Examples:\n" +
        '  --text "ecom companies specializing in lighting fixtures in US"\n' +
        '  --text "medical device manufacturing startups in EU"\n' +
        '  --text "EdTech SaaS companies"\n' +
        "Add reference domains inside the prompt or via --domains to bias the seed set:\n" +
        '  --text "Industrial automation distributors like heilind.com, bpx.co.uk, automation24.de"\n' +
        '  --text "outbound sales automation" --domains "clay.com,apollo.io"',
    );
    process.exit(1);
  }

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let apiCalls = 0;
  let firstAppliedFilters: string | null = null;
  let firstTotalCount: string | null = null;

  while (rows.length < args.maxCompanies && offset < MAX_RECORDS_PER_CALL) {
    const url = `${DISCOLIKE_BASE}/discover?${buildParams(args, text, offset).toString()}`;
    const resp = await fetchWithRetry(url);
    apiCalls++;

    if (apiCalls === 1) {
      firstTotalCount = resp.headers.get("x-total-count");
      firstAppliedFilters = resp.headers.get("x-applied-filters");
      if (firstTotalCount) console.error(`[DiscoLike] X-Total-Count (first page): ${firstTotalCount}`);
      if (firstAppliedFilters) {
        console.error(`[DiscoLike] X-Applied-Filters (extracted from --text via icp_prompt wizard): ${firstAppliedFilters}`);
      }
    }

    const batch: DiscoLikeCompany[] = await resp.json();
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected response shape: ${JSON.stringify(batch).slice(0, 200)}`);
    }
    if (!batch.length) break;

    for (const c of batch) {
      const d = c.domain?.toLowerCase();
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const linkedin = (c.social_urls ?? []).find((u) => u.includes("linkedin.com/company")) ?? "";
      rows.push({
        domain: d,
        company_name: c.name ?? "",
        industry: topIndustry(c.industry_groups),
        headcount_range: c.employees ?? "",
        headcount: parseEmployeeMidpoint(c.employees),
        location_country: c.address?.country ?? "",
        location_state: c.address?.state ?? "",
        location_city: c.address?.city ?? "",
        linkedin_url: linkedin,
        similarity: c.similarity ?? "",
        score: c.score ?? "",
        description: (c.description ?? "").slice(0, 500),
        source: "discolike",
      });
      if (rows.length >= args.maxCompanies) break;
    }

    console.error(`[DiscoLike] offset=${offset} returned=${batch.length} new_total=${rows.length}`);
    if (batch.length < args.limit) break;
    offset += args.limit;
  }

  console.error(`[DiscoLike] Done: ${rows.length} companies, ${apiCalls} API call(s)`);

  const headers = [
    "domain",
    "company_name",
    "industry",
    "headcount_range",
    "headcount",
    "location_country",
    "location_state",
    "location_city",
    "linkedin_url",
    "similarity",
    "score",
    "description",
    "source",
  ];
  const csv = [headers.join(",")];
  for (const r of rows) {
    csv.push(headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  writeFileSync(args.out, csv.join("\n"));
  console.error(`Wrote ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
