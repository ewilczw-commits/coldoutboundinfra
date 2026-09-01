#!/usr/bin/env tsx
/**
 * MillionVerifier — verify a single email address. Useful for ad-hoc checks
 * (e.g. verifying a reply-to address, or spot-checking before a small send).
 *
 * Usage:
 *   export MILLIONVERIFIER_API_KEY=xxx
 *   npx tsx scripts/single-verify.ts someone@example.com
 */

const API_KEY = process.env.MILLIONVERIFIER_API_KEY;
if (!API_KEY) {
  console.error("Missing env: MILLIONVERIFIER_API_KEY");
  process.exit(1);
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: single-verify.ts <email>");
    process.exit(1);
  }
  const url = `https://api.millionverifier.com/api/v3?api=${API_KEY}&email=${encodeURIComponent(email)}&timeout=20`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`${resp.status}: ${await resp.text().catch(() => "")}`);
  }
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
  console.error(
    `\n${email}: result=${data.result} quality=${data.quality}${data.free ? " (free provider)" : ""}${data.role ? " (role address)" : ""} — ${data.credits} credits remaining`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
