"""Merge a weekly Reposts-list read into the dashboard's repost files.

usage: python3 -I tools/reposts.py <read.json>

read.json (written by the weekly repost read in Matt's signed-in Chrome):
  {"read": "YYYY-MM-DD", "atm_followers": N,
   "posts": [{"post_id": "<LinkedIn update_id>", "post_date": "YYYY-MM-DD", "person": "...", "company": "...",
              "label": "Amanda Forrester's post",
              "reposts": [{"name": "...", "headline": "...", "profile_url": "...", "kind": "words" | "plain",
                           "when": "YYYY-MM-DD" (from the list's "3d", "1w"; approximate), "followers": N or null,
                           "followers_read": "YYYY-MM-DD" or null,
                           "reactions": N, "comments": N, "reposts": N}]}]}

Writes:
- data/reposts.csv: one row per repost (key post_id + profile_url, or name when there is no URL). A later
  read updates the counts; a follower count read earlier is kept when this read has none.
- data/syndication.csv: the rows for the posts in this read are rebuilt from data/reposts.csv; every
  other row (other posts, earlier months) is kept as it is. One row per ATM post whose reposts carried the
  reposter's own words. organic = likes + comments + shares on ATM's post (data/sm/li_posts.csv);
  syndicated = reactions + comments + reposts on those reposts; reposter_followers = the followers of
  everyone who reposted it (words and plain); atm_followers = ATM's page followers at the read.
- data/repost_estimates.csv: an estimate of what plain reposts added to ATM's post, from the daily
  snapshots in data/sm/li_post_history.csv (see estimate() below). Written only where the snapshots
  cover the days around a repost.
"""
import csv, datetime as dt, json, os, statistics, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
R_F = ["post_id", "post_date", "name", "headline", "profile_url", "kind", "when", "followers", "followers_read",
       "reactions", "comments", "reposts", "read"]
S_F = ["month", "date", "post_id", "person", "company", "label", "organic", "syndicated", "reposters",
       "reposter_followers", "atm_followers"]
E_F = ["post_id", "post_date", "plain_reposts", "plain_reposter_followers", "repost_dates", "impressions_gain",
       "expected_gain", "estimated_lift_impressions", "snapshots_used", "read"]

def rd(path):
    return list(csv.DictReader(open(path, newline="", encoding="utf-8"))) if os.path.exists(path) else []

def wr(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

n = lambda v: int(float(v)) if str(v or "").strip() not in ("", "None") else 0
key = lambda r: (r["post_id"], r.get("profile_url") or r["name"])

def estimate(post_id, plain, hist):
    """Impressions an ATM post gained in the two days after its plain reposts, minus what posts of the
    same age without reposts gained over the same two days (their median). Needs snapshots on the day
    before the first plain repost and two days after it."""
    days = sorted({r["when"] for r in plain if r.get("when")})
    if not days:
        return None
    start = (dt.date.fromisoformat(days[0]) - dt.timedelta(days=1)).isoformat()
    end = (dt.date.fromisoformat(days[0]) + dt.timedelta(days=2)).isoformat()
    by = {}
    for h in hist:
        by.setdefault(h["post_id"], {})[h["snapshot"]] = n(h["impressions"])
    me = by.get(post_id, {})
    if start not in me or end not in me:
        return None
    gain = me[end] - me[start]
    others = [v[end] - v[start] for pid, v in by.items() if pid != post_id and start in v and end in v and pid not in plain_posts]
    exp = statistics.median(others) if len(others) >= 3 else None
    return {"impressions_gain": gain, "expected_gain": "" if exp is None else round(exp),
            "estimated_lift_impressions": "" if exp is None else max(0, round(gain - exp)), "snapshots_used": f"{start} to {end}",
            "repost_dates": "; ".join(days)}

plain_posts = set()

def main(src):
    read = json.load(open(src, encoding="utf-8"))
    day = read["read"]
    rp = {key(r): r for r in rd(os.path.join(DATA, "reposts.csv"))}
    meta = {}
    for p in read["posts"]:
        meta[p["post_id"]] = p
        for r in p.get("reposts", []):
            row = {"post_id": p["post_id"], "post_date": p["post_date"], "read": day, **{k: r.get(k, "") for k in R_F if k in r}}
            old = rp.get(key(row))
            if old and not row.get("followers") and old.get("followers"):
                row["followers"], row["followers_read"] = old["followers"], old.get("followers_read", "")
            rp[key(row)] = row
    reposts = sorted(rp.values(), key=lambda r: (r["post_date"], r["post_id"], r["name"]))
    wr(os.path.join(DATA, "reposts.csv"), R_F, reposts)

    posts = {r["post_id"]: r for r in rd(os.path.join(DATA, "sm", "li_posts.csv"))}
    read_ids = {p["post_id"] for p in read["posts"]}
    syn = [r for r in rd(os.path.join(DATA, "syndication.csv")) if r.get("post_id") not in read_ids]
    by_post = {}
    for r in reposts:
        if r["post_id"] in read_ids:
            by_post.setdefault(r["post_id"], []).append(r)
    for pid, rs in by_post.items():
        words = [r for r in rs if r["kind"] == "words"]
        if not words:
            continue
        p, m = posts.get(pid, {}), meta.get(pid, {})
        eng = lambda r: n(r["reactions"]) + n(r["comments"]) + n(r["reposts"])
        fol = [n(r["followers"]) for r in rs if str(r.get("followers") or "").strip()]
        words.sort(key=eng, reverse=True)
        syn.append({"month": rs[0]["post_date"][:7], "date": rs[0]["post_date"], "post_id": pid,
                    "person": m.get("person", ""), "company": m.get("company", ""), "label": m.get("label") or f"the {rs[0]['post_date']} post",
                    "organic": n(p.get("likes")) + n(p.get("comments")) + n(p.get("shares")) if p else "",
                    "syndicated": sum(eng(r) for r in words),
                    "reposters": "; ".join(f"{r['name']} ({eng(r)})" for r in words if eng(r) > 0),
                    "reposter_followers": sum(fol) if fol else "", "atm_followers": read.get("atm_followers", "")})
    syn.sort(key=lambda r: (r["date"], r.get("post_id", "")))
    wr(os.path.join(DATA, "syndication.csv"), S_F, syn)

    hist = rd(os.path.join(DATA, "sm", "li_post_history.csv"))
    est = {r["post_id"]: r for r in rd(os.path.join(DATA, "repost_estimates.csv"))}
    plain_by = {}
    for r in reposts:
        if r["kind"] == "plain":
            plain_by.setdefault(r["post_id"], []).append(r)
    plain_posts.update(plain_by)
    for pid, rs in plain_by.items():
        e = estimate(pid, rs, hist)
        if e:
            fol = [n(r["followers"]) for r in rs if str(r.get("followers") or "").strip()]
            est[pid] = {"post_id": pid, "post_date": rs[0]["post_date"], "plain_reposts": len(rs),
                        "plain_reposter_followers": sum(fol) if fol else "", "read": day, **e}
    wr(os.path.join(DATA, "repost_estimates.csv"), E_F, sorted(est.values(), key=lambda r: r["post_date"]))
    print(f"{len(reposts)} reposts on file; {len(read_ids)} posts updated in data/syndication.csv; {len(est)} plain-repost estimates")

if __name__ == "__main__":
    main(sys.argv[1])
