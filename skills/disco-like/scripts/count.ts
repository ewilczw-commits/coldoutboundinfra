#!/usr/bin/env tsx
/**
 * DiscoLike /count — pre-count for STRUCTURED FILTERS ONLY.
 *
 * Important: /count does NOT accept vector inputs (`domain` / `icp_prompt`) — the API will return 422.
 * Use it to size the universe of structured filters (country / category / employee_range / tech_stack / phrase_match / etc.)
 * before adding a vector query.
 *
 * Usage:
 *   export DISCOLIKE_API_KEY=xxx
 *   npx tsx scripts/count.ts --country US --category TECHNOLOGY --employee-range "51,500"
 *   npx tsx scripts/count.ts --country DACH --tech-stack "salesforce.com"
 *   npx tsx scripts/count.ts --phrase-match "cloud security" --country US
 *
 * API reference: https://api.discolike.com/v1/docs/api/endpoints/count/
 */

const DISCOLIKE_BASE = "https://api.discolike.com/v1";
const API_KEY = process.env.DISCOLIKE_API_KEY;
if (!API_KEY) {
  console.error("Missing env: DISCOLIKE_API_KEY (get one at https://app.discolike.com/account/management/keys)");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idxEq = args.findIndex((a) => a.startsWith(`${flag}=`));
    if (idxEq >= 0) return args[idxEq].split("=").slice(1).join("=");
    const idxSp = args.indexOf(flag);
    if (idxSp >= 0 && idxSp + 1 < args.length && !args[idxSp + 1].startsWith("--")) return args[idxSp + 1];
    return undefined;
  };

  return {
    country: get("--country"),
    negateCountry: get("--negate-country"),
    state: get("--state"),
    employeeRange: get("--employee-range"),
    category: get("--category"),
    negateCategory: get("--negate-category"),
    techStack: get("--tech-stack"),
    negateTechStack: get("--negate-tech-stack"),
    phraseMatch: get("--phrase-match"),
    negatePhraseMatch: get("--negate-phrase-match"),
    minDigitalFootprint: get("--min-digital-footprint"),
    maxDigitalFootprint: get("--max-digital-footprint"),
    social: get("--social"),
    language: get("--language"),
    startDate: get("--start-date"),
    excludeLeadgen: get("--exclude-leadgen"),
  };
}

async function main() {
  const args = parseArgs();
  const p = new URLSearchParams();
  if (args.country) p.set("country", args.country);
  if (args.negateCountry) p.set("negate_country", args.negateCountry);
  if (args.state) p.set("state", args.state);
  if (args.employeeRange) p.set("employee_range", args.employeeRange);
  if (args.category) p.set("category", args.category);
  if (args.negateCategory) p.set("negate_category", args.negateCategory);
  if (args.techStack) p.set("tech_stack", args.techStack);
  if (args.negateTechStack) p.set("negate_tech_stack", args.negateTechStack);
  if (args.phraseMatch) p.set("phrase_match", args.phraseMatch);
  if (args.negatePhraseMatch) p.set("negate_phrase_match", args.negatePhraseMatch);
  if (args.minDigitalFootprint) p.set("min_digital_footprint", args.minDigitalFootprint);
  if (args.maxDigitalFootprint) p.set("max_digital_footprint", args.maxDigitalFootprint);
  if (args.social) p.set("social", args.social);
  if (args.language) p.set("language", args.language);
  if (args.startDate) p.set("start_date", args.startDate);
  if (args.excludeLeadgen) p.set("exclude_leadgen", args.excludeLeadgen);

  if (![...p.keys()].length) {
    console.error(
      "Pass at least one structured filter, e.g. --country US --category TECHNOLOGY --employee-range '51,500'.\n" +
        "Note: /count does NOT accept vector inputs (domain / icp_prompt) — use scripts/discover.ts with --limit 20 to sample-count vector queries.",
    );
    process.exit(1);
  }

  const url = `${DISCOLIKE_BASE}/count?${p.toString()}`;
  const resp = await fetch(url, { headers: { "x-discolike-key": API_KEY! } });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error(`${resp.status}: ${t.slice(0, 400)}`);
    process.exit(1);
  }
  const { count } = (await resp.json()) as { count: number };
  console.log(JSON.stringify({ count, filters: Object.fromEntries(p) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
