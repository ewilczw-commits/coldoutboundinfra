"""
seo_qualify.py — SEO/GEO service qualifier helper (no API key).

Deterministic split/merge around Claude Code Task sub-agents that fetch each
company site with the built-in WebFetch tool and judge SEO/GEO relevance.
Stdlib only (csv/json) — matches validate_leads.py style. Crash-safe/incremental.

Usage:
  python tools/seo_qualify.py split [--in CSV] [--size N]
  python tools/seo_qualify.py merge [--in CSV] [--out CSV]

split  — assign stable row_id, normalize Website, write .tmp/seo_batches/batch_NN.json
merge  — join .tmp/seo_results/batch_NN.json back to rows, write RESULTS csv

Re-run safe: merge consumes whatever result files exist; missing batches leave
those rows blank so only the missing batches need re-running.
"""

import argparse
import csv
import json
import os
from urllib.parse import urlparse

# ── Paths ──────────────────────────────────────────────────────────────────
# Resolve everything against the working directory (where the skill is run),
# NOT the skill install location. Override with VALIDATE_COMPANY_WORKDIR.
HERE = os.environ.get("VALIDATE_COMPANY_WORKDIR", os.getcwd())
DEFAULT_IN = os.path.join(HERE, "companies.csv")
DEFAULT_OUT = os.path.join(HERE, "companies - RESULTS.csv")
BATCH_DIR = os.path.join(HERE, ".tmp", "seo_batches")
RESULT_DIR = os.path.join(HERE, ".tmp", "seo_results")
BATCH_SIZE = 8

OUT_COLS = ["Company Name", "Website", "SEO Services Found", "Services Identified"]


# ── Helpers ──────────────────────────────────────────────────────────────────
def normalize_url(raw):
    """Prepend https:// if the URL has no scheme. Sub-agent handles http:// retry."""
    u = (raw or "").strip()
    if not u:
        return ""
    if not urlparse(u).scheme:
        u = "https://" + u
    return u


def read_rows(in_path):
    """Read input CSV → list of dicts with a stable row_id (0-based, in file order)."""
    with open(in_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = []
        for i, r in enumerate(reader):
            rows.append({
                "row_id": i,
                "company_name": (r.get("Company Name") or "").strip(),
                "website_raw": (r.get("Website") or "").strip(),
                "website": normalize_url(r.get("Website")),
            })
    return rows


# ── split ──────────────────────────────────────────────────────────────────
def cmd_split(args):
    rows = read_rows(args.in_path)
    os.makedirs(BATCH_DIR, exist_ok=True)
    size = args.size
    n_batches = (len(rows) + size - 1) // size
    for b in range(n_batches):
        chunk = rows[b * size:(b + 1) * size]
        batch = [{
            "row_id": r["row_id"],
            "company_name": r["company_name"],
            "website": r["website"],
        } for r in chunk]
        path = os.path.join(BATCH_DIR, f"batch_{b:02d}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)
    print(f"split: {len(rows)} rows → {n_batches} batches (size {size}) in {BATCH_DIR}")


# ── merge ──────────────────────────────────────────────────────────────────
def load_results():
    """Read all .tmp/seo_results/batch_NN.json → {row_id: result dict}."""
    results = {}
    if not os.path.isdir(RESULT_DIR):
        return results
    for fn in sorted(os.listdir(RESULT_DIR)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(RESULT_DIR, fn), encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"  WARN: {fn} is not valid JSON — skipping")
                continue
        for obj in data:
            rid = obj.get("row_id")
            if rid is not None:
                results[int(rid)] = obj
    return results


def cmd_merge(args):
    rows = read_rows(args.in_path)
    results = load_results()
    written = filled = 0
    with open(args.out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS)
        w.writeheader()
        for r in rows:
            res = results.get(r["row_id"])
            found = (res or {}).get("seo_services_found", "")
            services = (res or {}).get("services_identified", "")
            if res:
                filled += 1
            w.writerow({
                "Company Name": r["company_name"],
                "Website": r["website_raw"],
                "SEO Services Found": found,
                "Services Identified": services,
            })
            written += 1
    missing = written - filled
    print(f"merge: wrote {written} rows → {args.out_path}")
    print(f"  filled={filled}  blank/missing={missing}")
    if missing:
        have = set(results.keys())
        miss_ids = sorted(r["row_id"] for r in rows if r["row_id"] not in have)
        miss_batches = sorted({rid // BATCH_SIZE for rid in miss_ids})
        print(f"  re-run batches: {', '.join(f'{b:02d}' for b in miss_batches)}")


# ── CLI ──────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="SEO/GEO service qualifier split/merge")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("split", help="write batch JSON files for sub-agents")
    sp.add_argument("--in", dest="in_path", default=DEFAULT_IN)
    sp.add_argument("--size", type=int, default=BATCH_SIZE)
    sp.set_defaults(func=cmd_split)

    mp = sub.add_parser("merge", help="join results into RESULTS csv")
    mp.add_argument("--in", dest="in_path", default=DEFAULT_IN)
    mp.add_argument("--out", dest="out_path", default=DEFAULT_OUT)
    mp.set_defaults(func=cmd_merge)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
