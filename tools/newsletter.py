"""Write the dashboard's newsletter files from a beehiiv pull.

usage: python3 -I tools/newsletter.py <pull.json>

pull.json holds what the weekly task read from the beehiiv connector:
  {"pulled": "YYYY-MM-DD",
   "history": [{"date": "YYYY-MM-DD", "active_subscribers": N}, ...],   # get_subscriber_history
   "posts": [{"date": "YYYY-MM-DD", "title": "...", "post_id": "post_...",
              "recipients": N, "delivered": N, "unique_opens": N,
              "unique_verified_clicks": N, "unsubscribes": N}, ...]}   # list_posts + get_post_stats_batch

beehiiv dates a history entry by the morning after: the entry dated Nov 1 is the count at the end of
Oct 31. subscribers.csv shifts each entry back one day, so its dates mean "as of the end of that day".
Rows already in the files and missing from this pull are kept, so a short pull never erases history.
"""
import csv, datetime as dt, json, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "newsletter")
SEND_F = ["date", "title", "post_id", "recipients", "delivered", "unique_opens", "unique_verified_clicks", "unsubscribes"]

def read(path, key):
    if not os.path.exists(path):
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r[key]: r for r in csv.DictReader(f)}

def write(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

def main(src):
    pull = json.load(open(src, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    subs = read(os.path.join(OUT, "subscribers.csv"), "date")
    for h in pull.get("history", []):
        d = (dt.date.fromisoformat(h["date"]) - dt.timedelta(days=1)).isoformat()
        subs[d] = {"date": d, "active_subscribers": int(h["active_subscribers"])}
    sends = read(os.path.join(OUT, "sends.csv"), "post_id")
    for p in pull.get("posts", []):
        sends[p["post_id"]] = {k: p.get(k, "") for k in SEND_F}
    write(os.path.join(OUT, "subscribers.csv"), ["date", "active_subscribers"], sorted(subs.values(), key=lambda r: r["date"]))
    write(os.path.join(OUT, "sends.csv"), SEND_F, sorted(sends.values(), key=lambda r: r["date"]))
    last = max(subs) if subs else None
    json.dump({"pulled": pull.get("pulled"), "subscribers_through": last, "sends": len(sends),
               "source": "beehiiv connector: get_subscriber_history, list_posts, get_post_stats_batch",
               "publication": "Your ATM Withdrawal (pub_27219466-edae-4736-babe-f5e0bca5b78d)"},
              open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8"), indent=1)
    print(f"subscribers through {last}; {len(sends)} sends")

if __name__ == "__main__":
    main(sys.argv[1])
