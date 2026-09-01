#!/usr/bin/env tsx
/**
 * MillionVerifier — bulk-verify a CSV of emails, poll until done, download results.
 *
 * Usage:
 *   export MILLIONVERIFIER_API_KEY=xxx
 *   npx tsx scripts/bulk-verify.ts --in=leads.csv --email-col=email --out=leads-verified.csv
 */

import { readFileSync, writeFileSync } from "fs";

const API_KEY = process.env.MILLIONVERIFIER_API_KEY;
if (!API_KEY) {
  console.error("Missing env: MILLIONVERIFIER_API_KEY");
  process.exit(1);
}

const BULK_BASE = "https://bulkapi.millionverifier.com";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`));
    return arg ? arg.split("=").slice(1).join("=") : undefined;
  };
  return {
    in: get("--in"),
    emailCol: get("--email-col") ?? "email",
    out: get("--out") ?? "verified.csv",
    pollIntervalMs: Number(get("--poll-interval-ms") ?? 15000),
  };
}

async function main() {
  const args = parseArgs();
  if (!args.in) {
    console.error("Usage: --in=<path-to-csv> [--email-col=email] [--out=path]");
    process.exit(1);
  }

  const csv = readFileSync(args.in, "utf8");

  console.error("Uploading file to MillionVerifier bulk API...");
  const form = new FormData();
  form.append("file_contents", new Blob([csv], { type: "text/csv" }), "input.csv");
  const uploadResp = await fetch(`${BULK_BASE}/bulkapi/v2/upload?key=${API_KEY}`, {
    method: "POST",
    body: form,
  });
  if (!uploadResp.ok) {
    throw new Error(`upload failed: ${uploadResp.status} ${await uploadResp.text().catch(() => "")}`);
  }
  const uploadData = await uploadResp.json();
  const fileId = uploadData.file_id;
  if (!fileId) throw new Error(`No file_id in upload response: ${JSON.stringify(uploadData)}`);
  console.error(`file_id=${fileId} — polling every ${args.pollIntervalMs / 1000}s`);

  while (true) {
    const infoResp = await fetch(`${BULK_BASE}/bulkapi/v2/fileinfo?key=${API_KEY}&file_id=${fileId}`);
    const info = await infoResp.json();
    console.error(`  status=${info.file_status} progress=${info.percent ?? "?"}%`);
    if (info.file_status === "FINISHED" || info.file_status === "finished") break;
    if (info.file_status === "FAILED" || info.file_status === "failed") {
      throw new Error(`Bulk verification job failed: ${JSON.stringify(info)}`);
    }
    await new Promise((r) => setTimeout(r, args.pollIntervalMs));
  }

  console.error("Downloading results...");
  const downloadResp = await fetch(`${BULK_BASE}/bulkapi/v2/download?key=${API_KEY}&file_id=${fileId}`);
  if (!downloadResp.ok) {
    throw new Error(`download failed: ${downloadResp.status}`);
  }
  const resultCsv = await downloadResp.text();
  writeFileSync(args.out, resultCsv);
  console.error(`\nWrote ${args.out}`);
  console.error(`Filter to result="ok" (or quality="good") before uploading to your sending platform.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
