#!/usr/bin/env python3
"""Load one month of video figures into data/video/.

Usage:
  python3 -I tools/video.py --month 2026-10 --vimeo <Vimeo export.csv> \
      --pageviews <csv> --landing <csv> --referrers <csv>

Inputs:
  --vimeo      Vimeo's "Video report" export for the whole calendar month (Analytics, Videos, Export).
               Columns used: Video URL, Video title, Video upload date, Views, Impressions, Unique Viewers,
               Total time watched (seconds), Avg. time watched (seconds), Avg. % watched, Finishes.
  --pageviews  GA4 (property 489265998), the month, America/New_York:
               pagePathWithoutQueryString, screenPageViews; filter pagePathWithoutQueryString =~ ^/episodes/.*
  --landing    GA4, the month: landingPage, c_sessioncustomchannelgroup_15809010745 (ATM channels), sessions,
               engagedSessions, screenPageViews, averageSessionDuration; filter landingPage =~ ^/episodes/.*
               (pull it in two parts, sessions > 2 and sessions <= 2, if one pull is cut short, and join them)
  --referrers  GA4, the month: pagePathWithoutQueryString, pageReferrer, screenPageViews;
               filter pagePathWithoutQueryString =~ ^/episodes OR pageReferrer =@ /episodes

Writes (each file keeps other months' rows and replaces this month's):
  data/video/videos.csv    one row per Vimeo video with views, and the episode page it plays on
  data/video/pages.csv     one row per episode page: visits by how people arrived, onward clicks, its video
  data/video/journeys.csv  page-to-page moves that start or end on an episode page (not reloads)
  data/video/arrivals.csv  visits that began on an episode page, by ATM channel group: sessions, page views, average length
  data/video/meta.json     the months held and their sources

Hand-kept files it reads:
  data/video/links.csv     page,video_id: episode pages whose video title does not match the page address
  data/video/exclude.csv   video_id,reason: site videos that are not content (the home page background loop)
  data/video/benchmarks.csv  published benchmarks the section compares against (source, year, link)
  data/video/actions.csv   kind,title,text: video actions for the Actions view, rewritten each month from the figures
  data/video/tags.csv      page,guest,company,program,series,basis: what each episode is. "basis" says how the
                           tag was set (board item and date, link tags, title). Add a row for each new episode;
                           untagged episodes are listed in the run's output and show as "Untagged" on the page.

A video counts as an episode play only when it is linked to an episode page. Other Vimeo plays (review copies,
social cuts, teasers, raw footage) are kept in videos.csv with kind "other" and left out of the episode figures.
"""
import argparse, csv, json, re, sys, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent.parent
V = ROOT / "data" / "video"


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").replace("﻿", "")).lower()
    return re.sub(r"[^a-z0-9]", "", s)


def clean_path(p):
    p = (p or "").replace("﻿", "").strip()
    if p.startswith("http"):
        p = urlparse(p).path
    p = unquote(p).replace("﻿", "").lower()
    p = p.split("?")[0].split("&")[0]
    return p.rstrip("/") or "/"


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def read(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def keep_other_months(path, month):
    return [r for r in read(path) if r["month"] != month] if path.exists() else []


def write(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--vimeo", required=True)
    ap.add_argument("--pageviews", required=True)
    ap.add_argument("--landing", required=True)
    ap.add_argument("--referrers", required=True)
    a = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}", a.month):
        sys.exit("--month must be YYYY-MM")
    V.mkdir(parents=True, exist_ok=True)
    m = a.month

    links = {clean_path(r["page"]): r["video_id"] for r in read(V / "links.csv")} if (V / "links.csv").exists() else {}
    exclude = {r["video_id"]: r["reason"] for r in read(V / "exclude.csv")} if (V / "exclude.csv").exists() else {}
    tags = {clean_path(r["page"]): r for r in read(V / "tags.csv")} if (V / "tags.csv").exists() else {}

    # GA4: page views per episode page
    pv = {}
    for r in read(a.pageviews):
        p = clean_path(r["pagePathWithoutQueryString"])
        if p.startswith("/episodes/") and len(p) > 10:
            pv[p] = pv.get(p, 0) + num(r["screenPageViews"])

    # GA4: sessions that started on an episode page, by how people arrived
    land, arrive = {}, {}
    for r in read(a.landing):
        p = clean_path(r["landingPage"])
        ch = r.get("c_sessioncustomchannelgroup_15809010745") or r.get("sessionDefaultChannelGrouping") or ""
        k = "email" if ch.lower() == "email" else "other"
        d = land.setdefault(p, {"email": [0, 0.0], "other": [0, 0.0]})
        s = num(r["sessions"])
        d[k][0] += s
        d[k][1] += s * num(r["averageSessionDuration"])
        g = arrive.setdefault(ch or "(none)", [0, 0.0, 0.0])
        g[0] += s
        g[1] += num(r["screenPageViews"])
        g[2] += s * num(r["averageSessionDuration"])

    # GA4: moves between pages (referrer -> page), leaving out reloads of the same page
    moves = {}
    for r in read(a.referrers):
        to, frm = clean_path(r["pagePathWithoutQueryString"]), clean_path(r["pageReferrer"])
        if not r["pageReferrer"].startswith("https://www.atm.media") or to == frm:
            continue
        if not (to.startswith("/episodes/") or frm.startswith("/episodes/")):
            continue
        moves[(frm, to)] = moves.get((frm, to), 0) + num(r["screenPageViews"])

    # Vimeo
    vids = []
    by_title = {}
    for r in read(a.vimeo):
        views = int(num(r["Views"]))
        if views <= 0:
            continue
        vid = r["Video URL"].rstrip("/").split("/")[-1]
        row = {"month": m, "video_id": vid, "title": r["Video title"].replace("﻿", "").strip().strip('"'),
               "uploaded": r["Video upload date"][:10], "views": views, "impressions": int(num(r["Impressions"])),
               "unique_viewers": int(num(r["Unique Viewers"])), "time_s": int(num(r["Total time watched (seconds)"])),
               "avg_time_s": int(num(r["Avg. time watched (seconds)"])), "avg_pct": int(num(r["Avg. % watched"])),
               "finishes": int(num(r["Finishes"])), "page": "", "kind": "other"}
        if vid in exclude:
            row["kind"] = "site"
        vids.append(row)
        by_title.setdefault(norm(row["title"]), []).append(row)

    # link episode pages to videos: hand-kept links first, then an exact title match
    episode_pages = set(pv) | {p for p in land if p.startswith("/episodes/")}
    page_video = {}
    for p in sorted(episode_pages):
        vid = links.get(p)
        cand = [v for v in vids if v["video_id"] == vid] if vid else by_title.get(norm(p.split("/episodes/")[1]), [])
        cand = [v for v in cand if v["kind"] != "site"]
        if cand:
            best = max(cand, key=lambda v: v["views"])
            best["page"], best["kind"] = p, "episode"
            page_video[p] = best["video_id"]

    pages = []
    for p in sorted(episode_pages, key=lambda p: -pv.get(p, 0)):
        d = land.get(p, {"email": [0, 0.0], "other": [0, 0.0]})
        onward = {k: v for k, v in moves.items() if k[0] == p}
        t = tags.get(p, {})
        pages.append({"month": m, "page": p, "views": int(pv.get(p, 0)),
                      "sessions_email": int(d["email"][0]),
                      "secs_email": round(d["email"][1] / d["email"][0], 1) if d["email"][0] else "",
                      "sessions_other": int(d["other"][0]),
                      "secs_other": round(d["other"][1] / d["other"][0], 1) if d["other"][0] else "",
                      "onward": int(sum(onward.values())),
                      "onward_episode": int(sum(v for (f, to), v in onward.items() if to.startswith("/episodes/"))),
                      "video_id": page_video.get(p, ""),
                      "guest": t.get("guest", ""), "company": t.get("company", ""),
                      "program": t.get("program", ""), "series": t.get("series", "")})

    journeys = [{"month": m, "from": f, "to": to, "views": int(v)} for (f, to), v in sorted(moves.items(), key=lambda x: -x[1])]

    vcols = ["month", "video_id", "title", "uploaded", "views", "impressions", "unique_viewers", "time_s", "avg_time_s",
             "avg_pct", "finishes", "page", "kind"]
    pcols = ["month", "page", "views", "sessions_email", "secs_email", "sessions_other", "secs_other", "onward",
             "onward_episode", "video_id", "guest", "company", "program", "series"]
    write(V / "videos.csv", vcols, keep_other_months(V / "videos.csv", m) + sorted(vids, key=lambda v: -v["views"]))
    write(V / "pages.csv", pcols, keep_other_months(V / "pages.csv", m) + pages)
    arr = [{"month": m, "channel": k, "sessions": int(g[0]), "views": int(g[1]), "avg_secs": round(g[2] / g[0], 1) if g[0] else ""}
           for k, g in sorted(arrive.items(), key=lambda x: -x[1][0])]
    write(V / "arrivals.csv", ["month", "channel", "sessions", "views", "avg_secs"], keep_other_months(V / "arrivals.csv", m) + arr)
    write(V / "journeys.csv", ["month", "from", "to", "views"], keep_other_months(V / "journeys.csv", m) + journeys)

    meta_p = V / "meta.json"
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {"months": {}}
    meta["months"][m] = {"loaded": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                         "vimeo": "Vimeo video report export, full calendar month",
                         "ga4": "GA4 489265998 via Supermetrics, full calendar month, America/New_York"}
    meta["latest"] = max(meta["months"])
    meta_p.write_text(json.dumps(meta, indent=1) + "\n")

    ep = [v for v in vids if v["kind"] == "episode"]
    vv = {v["video_id"]: v["views"] for v in vids}
    played = [p for p in pages if p["video_id"] and vv.get(p["video_id"], 0) >= 5]
    untagged = [p["page"] for p in played if not p["program"]]
    unlinked = [p["page"] for p in pages if not p["video_id"] and p["views"] >= 20]
    print(f"{m}: {len(vids)} Vimeo videos with views ({sum(v['views'] for v in vids)} views); "
          f"{len(ep)} linked to episode pages ({sum(v['views'] for v in ep)} views); {len(pages)} episode pages")
    if unlinked:
        print("Episode pages with 20+ views and no linked video (add to data/video/links.csv if they have one):")
        for p in unlinked:
            print("  " + p)
    if untagged:
        print("Episode pages whose video had 5+ plays but no tags (add to data/video/tags.csv):")
        for p in untagged:
            print("  " + p)


if __name__ == "__main__":
    main()
