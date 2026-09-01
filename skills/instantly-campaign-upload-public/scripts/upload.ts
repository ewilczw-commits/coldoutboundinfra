#!/usr/bin/env tsx
/**
 * Upload a variants.yaml + leads.csv to Instantly as a campaign (created but NOT activated).
 *
 * ALWAYS leaves the campaign un-activated. No --activate flag. Review in the
 * Instantly UI and press Launch manually.
 *
 * Usage:
 *   export INSTANTLY_API_KEY=xxx
 *   npx tsx scripts/upload.ts \
 *     --leads=path/to/leads.csv \
 *     --variants=path/to/variants.yaml \
 *     --account-ids=abc123,def456
 *
 * Uses the same leads.csv + variants.yaml schema as smartlead-campaign-upload-public
 * (see that skill's references/ for the schema docs) so copy produced by
 * /campaign-copywriting works with either upload target unchanged.
 */

import { readFileSync } from "fs";

const API = "https://api.instantly.ai";
const API_KEY = process.env.INSTANTLY_API_KEY;
if (!API_KEY) {
  console.error("Missing env: INSTANTLY_API_KEY");
  process.exit(1);
}

const LEADS_BATCH = 1000; // Instantly's bulk-create cap

const REQUIRED_COLS = ["email", "first_name", "last_name", "company_name"];
const ALLOWED_COLS = new Set([
  ...REQUIRED_COLS,
  "company_domain",
  "title",
  "linkedin_url",
  "situation_line",
  "value_line",
  "cta_line",
]);

// ---------- arg parsing ----------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    leads: get("--leads"),
    variants: get("--variants"),
    accountIds: (get("--account-ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    variantLabel: get("--variant-label") ?? "A",
  };
}

// ---------- CSV parsing (shared pattern with smartlead-campaign-upload-public) ----------

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cols = parseCsvLine(l);
    const r: Record<string, string> = {};
    headers.forEach((h, i) => (r[h] = (cols[i] ?? "").trim()));
    return r;
  });
  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ---------- minimal YAML parser (same subset as smartlead-campaign-upload-public) ----------

type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

function parseYaml(text: string): YamlValue {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cleaned: { indent: number; content: string }[] = [];
  for (const raw of lines) {
    let line = raw;
    let inQuote: string | null = null;
    let commentAt = -1;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuote) {
        if (c === inQuote && line[i - 1] !== "\\") inQuote = null;
      } else {
        if (c === '"' || c === "'") inQuote = c;
        else if (c === "#") { commentAt = i; break; }
      }
    }
    if (commentAt >= 0) line = line.slice(0, commentAt);
    const trimmedRight = line.replace(/\s+$/, "");
    if (!trimmedRight.trim()) continue;
    const indent = trimmedRight.search(/\S/);
    cleaned.push({ indent, content: trimmedRight.slice(indent) });
  }

  let idx = 0;
  function parseBlock(parentIndent: number): YamlValue {
    if (idx >= cleaned.length) return null;
    const firstIndent = cleaned[idx].indent;
    if (firstIndent <= parentIndent) return null;
    if (cleaned[idx].content.startsWith("- ")) return parseList(firstIndent);
    return parseMap(firstIndent);
  }

  function parseMap(indent: number): Record<string, YamlValue> {
    const obj: Record<string, YamlValue> = {};
    while (idx < cleaned.length) {
      const line = cleaned[idx];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`Unexpected indent on line: ${line.content}`);
      const content = line.content;
      const colonIdx = findColon(content);
      if (colonIdx === -1) throw new Error(`Expected key: value, got: ${content}`);
      const key = content.slice(0, colonIdx).trim();
      const afterColon = content.slice(colonIdx + 1).trim();
      idx++;
      obj[key] = afterColon === "" ? parseBlock(indent) : parseScalar(afterColon);
    }
    return obj;
  }

  function parseList(indent: number): YamlValue[] {
    const arr: YamlValue[] = [];
    while (idx < cleaned.length) {
      const line = cleaned[idx];
      if (line.indent < indent) break;
      if (line.indent > indent || !line.content.startsWith("- ")) break;
      const afterDash = line.content.slice(2);
      idx++;
      if (afterDash.trim() === "") {
        arr.push(parseBlock(indent));
        continue;
      }
      const colonIdx = findColon(afterDash);
      if (colonIdx !== -1 && !afterDash.trim().startsWith('"') && !afterDash.trim().startsWith("'")) {
        const key = afterDash.slice(0, colonIdx).trim();
        const afterKey = afterDash.slice(colonIdx + 1).trim();
        const obj: Record<string, YamlValue> = {};
        obj[key] = afterKey === "" ? parseBlock(indent + 2) : parseScalar(afterKey);
        while (idx < cleaned.length) {
          const nl = cleaned[idx];
          if (nl.indent <= indent) break;
          if (nl.content.startsWith("- ")) break;
          const ci = findColon(nl.content);
          if (ci === -1) break;
          const k2 = nl.content.slice(0, ci).trim();
          const v2 = nl.content.slice(ci + 1).trim();
          idx++;
          obj[k2] = v2 === "" ? parseBlock(nl.indent) : parseScalar(v2);
        }
        arr.push(obj);
      } else {
        arr.push(parseScalar(afterDash));
      }
    }
    return arr;
  }

  return parseBlock(-1);
}

function findColon(s: string): number {
  let inQuote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === inQuote && s[i - 1] !== "\\") inQuote = null;
    } else {
      if (c === '"' || c === "'") inQuote = c;
      else if (c === ":") return i;
    }
  }
  return -1;
}

function parseScalar(s: string): YamlValue {
  const t = s.trim();
  if (!t) return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "~") return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => parseScalar(x.trim()));
  }
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return t;
}

// ---------- Instantly API helpers ----------

async function instantlyFetch(path: string, init: RequestInit = {}): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`${init.method ?? "GET"} ${path} → ${resp.status}: ${t.slice(0, 300)}`);
    }
    return resp.json();
  }
  throw new Error(`Exhausted retries for ${path}`);
}

// ---------- validation ----------

function validateVariants(v: any): void {
  if (!v || typeof v !== "object") throw new Error("variants.yaml must be a map at the top level");
  if (!v.name) throw new Error("variants.yaml: `name` is required");
  if (!Array.isArray(v.sequences) || !v.sequences.length) throw new Error("variants.yaml: `sequences` must be a non-empty array");
  for (const seq of v.sequences) {
    if (!Number.isFinite(seq.step)) throw new Error("sequences[].step must be a number");
    if (!Number.isFinite(seq.delay_days)) throw new Error("sequences[].delay_days must be a number");
    if (!Array.isArray(seq.variants) || !seq.variants.length) throw new Error("sequences[].variants must be a non-empty array");
  }
}

function validateCsvSchema(headers: string[]): void {
  const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
  if (missing.length) throw new Error(`leads.csv missing required columns: ${missing.join(", ")}`);
  const extras = headers.filter((h) => !ALLOWED_COLS.has(h));
  if (extras.length) {
    throw new Error(`leads.csv has unallowed columns: ${extras.join(", ")}.`);
  }
}

// ---------- main ----------

async function main() {
  const args = parseArgs();
  if (!args.leads || !args.variants) {
    console.error("Usage: --leads=<path> --variants=<path> --account-ids=<id1,id2,...> [--variant-label=A]");
    process.exit(1);
  }
  if (!args.accountIds.length) {
    console.error(
      "Missing --account-ids. Instantly's public API doesn't document a tag-based\n" +
      "account filter the way Smartlead's does — list your sending accounts with\n" +
      "GET /api/v2/accounts, pick the ones to attach, and pass their IDs here."
    );
    process.exit(1);
  }

  console.error(`Loading leads from ${args.leads}...`);
  const { headers, rows: leads } = parseCsv(readFileSync(args.leads, "utf8"));
  validateCsvSchema(headers);
  console.error(`  ${leads.length} leads, columns: ${headers.join(", ")}`);

  console.error(`Loading variants from ${args.variants}...`);
  const v = parseYaml(readFileSync(args.variants, "utf8")) as any;
  validateVariants(v);

  // Instantly's public v2 schema (per our own 09-instantly-api.md reference) shows
  // steps as { delay, subject, body } — no confirmed multi-variant-per-step field.
  // We ship one variant per step (--variant-label, default "A"). For true A/B/C
  // split testing, use the Instantly dashboard's own variant UI after creation,
  // or confirm the live schema supports a variants array before scripting it.
  const steps = v.sequences.map((seq: any) => {
    const chosen = seq.variants.find((va: any) => va.label === args.variantLabel) ?? seq.variants[0];
    return {
      delay: seq.delay_days,
      subject: chosen.subject ?? "",
      body: chosen.body ?? "",
    };
  });
  if (v.sequences.some((seq: any) => seq.variants.length > 1)) {
    console.error(
      `  ⚠ variants.yaml defines multiple variants per step; only "${args.variantLabel}" was used. ` +
      `Set up A/B/C split testing in the Instantly UI if you need it.`
    );
  }

  console.error(`Creating Instantly campaign "${v.name}"...`);
  const created = await instantlyFetch("/api/v2/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name: v.name,
      email_list: args.accountIds,
      sequences: [{ steps }],
    }),
  });
  const campaignId = created.id;
  if (!campaignId) throw new Error(`Campaign create failed: ${JSON.stringify(created)}`);
  console.error(`  ✓ Campaign ${campaignId}`);

  // Bulk-create leads, up to 1,000 per call
  let uploaded = 0;
  for (let i = 0; i < leads.length; i += LEADS_BATCH) {
    const batch = leads.slice(i, i + LEADS_BATCH).map((l) => {
      const custom_fields: Record<string, string> = {};
      for (const h of headers) {
        if (!REQUIRED_COLS.includes(h) && l[h]) custom_fields[h] = l[h];
      }
      return {
        email: l.email,
        first_name: l.first_name || "",
        last_name: l.last_name || "",
        company_name: l.company_name || "",
        custom_variables: custom_fields,
      };
    });
    await instantlyFetch("/api/v2/leads/bulk-create", {
      method: "POST",
      body: JSON.stringify({ campaign: campaignId, leads: batch }),
    });
    uploaded += batch.length;
    process.stdout.write(`  ${uploaded}/${leads.length} leads uploaded\r`);
  }
  console.error(`\n  ✓ ${uploaded} leads uploaded`);

  console.log(``);
  console.log(`✓ Campaign ${campaignId} created (NOT activated)`);
  console.log(``);
  console.log(`Review + launch in the Instantly dashboard: https://app.instantly.ai/`);
  console.log(`(exact campaign URL path wasn't in our confirmed API reference — search by campaign name or ID in the Campaigns tab)`);
  console.log(``);
  console.log(`This script does NOT call /api/v2/campaigns/{id}/activate. Review, then activate manually.`);
}

main().catch((e) => {
  console.error("\nERROR:", e.message);
  process.exit(1);
});
