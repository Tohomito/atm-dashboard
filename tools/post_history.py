"""Save today's LinkedIn post figures as a dated snapshot.

usage: python3 -I tools/post_history.py

data/sm/li_posts.csv holds each post's running totals and is overwritten every day. This appends one
row per post to data/sm/li_post_history.csv (snapshot, post_id, impressions, likes, comments, shares),
dated with data/sm/meta.json "pulled". A snapshot date already in the file is replaced, so running it
twice on one day changes nothing. tools/reposts.py uses the history to estimate what plain reposts
(reposts without the reposter's own words) added to ATM's post.
"""
import csv, json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sm")
FIELDS = ["snapshot", "post_id", "impressions", "likes", "comments", "shares"]

def main():
    day = json.load(open(os.path.join(ROOT, "meta.json"), encoding="utf-8"))["pulled"]
    posts = list(csv.DictReader(open(os.path.join(ROOT, "li_posts.csv"), newline="", encoding="utf-8")))
    path = os.path.join(ROOT, "li_post_history.csv")
    old = list(csv.DictReader(open(path, newline="", encoding="utf-8"))) if os.path.exists(path) else []
    keep = [r for r in old if r["snapshot"] != day]
    new = [{"snapshot": day, **{k: p.get(k, "") for k in FIELDS[1:]}} for p in posts if p.get("post_id")]
    rows = sorted(keep + new, key=lambda r: (r["snapshot"], r["post_id"]))
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(new)} posts saved for {day}; {len({r['snapshot'] for r in rows})} snapshot days in the file")

if __name__ == "__main__":
    main()
