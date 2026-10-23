"""Merge freshly pulled rows into one of the data/sm/ CSV files.

Usage: python3 tools/sm_upsert.py data/sm/li_daily.csv new_rows.csv date
       (the last argument names the key column; a new row replaces an old row with the same key)

The new file must have exactly the same header as the existing one. Rows are kept sorted by
the key column. Nothing is written if the headers differ or the new file has no rows.
"""
import csv
import sys


def main():
    target, new, key = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(target, newline="", encoding="utf-8") as f:
        old_rows = list(csv.reader(f))
    with open(new, newline="", encoding="utf-8") as f:
        new_rows = list(csv.reader(f))
    if not new_rows or len(new_rows) < 2:
        sys.exit(f"{new}: no rows, nothing written")
    if old_rows and old_rows[0] != new_rows[0]:
        sys.exit(f"header mismatch:\n  {target}: {old_rows[0]}\n  {new}: {new_rows[0]}")
    header = new_rows[0]
    k = header.index(key)
    merged = {r[k]: r for r in old_rows[1:] if len(r) == len(header)}
    added = sum(1 for r in new_rows[1:] if r[k] not in merged)
    for r in new_rows[1:]:
        if len(r) != len(header):
            sys.exit(f"{new}: row has {len(r)} fields, header has {len(header)}: {r[:3]}")
        merged[r[k]] = r
    rows = sorted(merged.values(), key=lambda r: r[k])
    with open(target, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{target}: {len(rows)} rows ({added} new, {len(new_rows) - 1 - added} updated)")


if __name__ == "__main__":
    main()
