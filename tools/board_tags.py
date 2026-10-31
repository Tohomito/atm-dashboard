"""Refresh data/board_tags.csv from the ATM Kitchen board (monday.com board 18399602277).

Input: a JSON export of the board's items, as returned by the monday get_board_items_page tool with
includeColumns and columnIds ["dropdown_mm0fq02c", "dropdown_mm7ygqw0", "date_mm0fshfs"]
(Campaign Tags, Partner, Live/Due Date). Read only: this never writes to the board.

Usage: python3 -I tools/board_tags.py board_export.json [repo_dir]

One row per board item: series (one of ATM's nine), programs, categories, partner and live date.
The post links ("posts", "match") that the Oct 31 audit found are kept for items already in the file;
new items get none, and the page matches them to posts by live date and the guest's surname.
"""
import csv, json, os, sys

SERIES = {"On The Record", "Insider Scoop", "Trend Watch", "Masterclass Off Duty", "Brand Digest", "Media Diet",
          "The Heart Beat", "Newsroom", "Industry Movers & Shakers"}
CATS = {"Recap", "Holiday or topical moment", "Thought leadership", "Human interest", "Celebrity guest", "Ads"}
FIELDS = ["item_id", "item", "date", "group", "series", "programs", "categories", "partner", "posts", "match"]


def main(src, repo="."):
    path = os.path.join(repo, "data", "board_tags.csv")
    old = {r["item_id"]: r for r in csv.DictReader(open(path))} if os.path.exists(path) else {}
    data = json.load(open(src))
    items = data["items"] if isinstance(data, dict) else data
    rows = []
    for it in items:
        cv = it.get("column_values", {})
        t = cv.get("dropdown_mm0fq02c")
        tags = [x for x in t.split(", ") if x] if isinstance(t, str) else []
        p = cv.get("dropdown_mm7ygqw0")
        o = old.get(str(it["id"]), {})
        rows.append({"item_id": it["id"], "item": it["name"].replace("\n", " "), "date": cv.get("date_mm0fshfs") or "",
                     "group": (it.get("group") or {}).get("title", ""),
                     "series": next((x for x in tags if x in SERIES), ""),
                     "programs": ";".join(x for x in tags if x not in SERIES and x not in CATS),
                     "categories": ";".join(x for x in tags if x in CATS),
                     "partner": p if isinstance(p, str) else "", "posts": o.get("posts", ""), "match": o.get("match", "")})
    if len(rows) < 0.8 * max(len(old), 1):
        sys.exit(f"Refusing to write: {len(rows)} items read against {len(old)} before. Check the export is complete.")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n"); w.writeheader(); w.writerows(rows)
    print(f"{len(rows)} board items written to {path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
