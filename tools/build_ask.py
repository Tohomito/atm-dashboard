#!/usr/bin/env python3
"""Build data/ask.md: one plain-text file holding every figure the dashboard cites.

The ask box on the dashboard sends its question to Claude with a link to this
file, so the answer can draw on all the data, not just what fits in a link.

Run from the repo root after any change to data/ or js/archive.js:
    python3 tools/build_ask.py
"""
import csv, io, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
D = ROOT / "data"
SC = D / "scorecard"
SITE = "https://atm.mattbecher.com"

TABLE_TITLES = {
    "table_1": "September's standout posts and the likely reasons",
    "table_2": "LinkedIn peer set, last 30 days (September read)",
    "table_3": "Site and tracking fixes",
    "table_4": "Data sources: status and what still needs fixing",
}


def rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def dicts(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def csv_block(table):
    """Render rows as a CSV code block, dropping columns that are empty throughout."""
    if not table:
        return ""
    width = max(len(r) for r in table)
    table = [r + [""] * (width - len(r)) for r in table]
    keep = [i for i in range(width) if any(r[i].strip() for r in table[1:])] or list(range(width))
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    for r in table:
        w.writerow([r[i] for i in keep])
    return "```csv\n" + out.getvalue() + "```\n"


def archive():
    src = (ROOT / "js" / "archive.js").read_text(encoding="utf-8")
    end = re.search(r'ARCHIVE_END\s*=\s*"([^"]+)"', src).group(1)
    months = json.loads(re.search(r"ARCHIVE_MONTHS\s*=\s*(\{.*?\});", src, re.S).group(1))
    posts = json.loads(re.search(r"ARCHIVE_POSTS\s*=\s*(\[.*?\]);", src, re.S).group(1))
    return end, months, posts


def main():
    L = []
    add = L.append
    A = dicts(D / "analysis.csv")
    by = lambda k: [r for r in A if r["kind"] == k]
    one = lambda k: (by(k) or [{"text": ""}])[0]["text"]
    pt = {r["key"]: r["text"] for r in dicts(SC / "page_text.csv")}
    end, months, posts = archive()
    built = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    add("# ATM Audience Dashboard: full data file")
    add("")
    add(f"Built {built}. Dashboard: {SITE}. This file holds every figure the dashboard cites, so questions can be answered from all of it.")
    add("")
    add("## How to read this file")
    add("")
    add("- **Daily figures** (LinkedIn, Instagram, YouTube, site) come from a Google Sheet that the dashboard reads live each time it opens. The question that brought you here includes the latest of those figures, and any posts newer than this file. Prefer those for anything recent.")
    add(f"- **Post history** below runs from May 2026 to {end}. Newer posts are in the question.")
    add("- **Monthly figures** come from the monthly audience scorecard. Each chart below states its own date range and source.")
    add("- Name sources by platform (LinkedIn, Instagram, beehiiv, GA4), not by person. Call a baseline by its month (\"September baseline\").")
    add("- \"At The Moment\" is a separate LinkedIn page with a similar name, watched as a peer. It is not an ATM page; never add its figures to ATM's.")
    add("- Say plainly when the data cannot answer a question, and what data would.")
    add("")

    add("## Current analysis")
    add("")
    add(f"**{one('header_title')}**")
    add("")
    add(one("header_lede"))
    add("")
    add(f"Window: {one('read_eyebrow')}")
    add("")
    add("### Findings")
    add("")
    for r in by("finding"):
        add(f"- **{r['title']}** {r['text']}")
    add("")
    for kind, head in [("action", "Priorities"), ("action_tag", "Stopping mis-tags to \"At The Moment\""),
                       ("setup", "Setup tasks"), ("tracking", "Tracking issues"), ("note", "How to read the numbers")]:
        items = by(kind)
        if not items:
            continue
        add(f"### {head}")
        add("")
        for r in items:
            add(f"- **{r['title']}** {r['text']}")
        add("")

    add("## Monthly scorecard tiles")
    add("")
    add(csv_block(rows(SC / "stat_tiles.csv")))

    add("## Monthly report: section summaries")
    add("")
    secs = []
    for k in pt:
        m = re.match(r"^([^.]+)\.headline$", k)
        if m:
            secs.append(m.group(1))
    for s in secs:
        add(f"- **{pt.get(s + '.eyebrow', s)}**: {pt[s + '.headline']} {pt.get(s + '.lede', '')}".rstrip())
    add("")
    wa = rows(SC / "written_analysis.csv")
    if len(wa) > 1:
        add("### Written verdicts")
        add("")
        add(csv_block(wa))

    add("## Charts")
    add("")
    add("Each chart's title, takeaway, date range, source and data. Values are as published.")
    add("")
    for c in dicts(SC / "chart_index.csv"):
        add(f"### {c['card_title']} ({c['section']})")
        add("")
        if c.get("card_subtitle_as_published"):
            add(c["card_subtitle_as_published"])
            add("")
        if c.get("commentary_as_published"):
            add(f"Takeaway: {c['commentary_as_published']}")
            add("")
        add(f"Data: {c.get('data_vintage', '')}. Source: {c.get('source_platform_and_window', '')}.")
        add("")
        p = SC / "charts" / c["data_file"]
        if p.exists():
            add(csv_block(rows(p)))

    add("## Tables")
    add("")
    for p in sorted((SC / "tables").glob("table_*.csv")):
        add(f"### {TABLE_TITLES.get(p.stem, p.stem)}")
        add("")
        add(csv_block(rows(p)))

    add("## LinkedIn by month")
    add("")
    add("Organic impressions, engagements and followers at the start and end of each month (May counts from May 11).")
    add("")
    t = [["month", "days", "organic_impressions", "engagements", "followers_start", "followers_end"]]
    for k in sorted(months):
        m = months[k]
        t.append([k, m["days"], m["org"], m["eng"], m["follStart"], m["follEnd"]])
    add(csv_block([[str(x) for x in r] for r in t]))

    add(f"## Post history, May 2026 to {end}")
    add("")
    add("One row per post, newest first. Columns: date, channel, format, person featured, their company, series, client, title, "
        "reach (LinkedIn impressions / Instagram reach), views, engagement rate %, reactions or likes, comments, "
        "reposts or shares, clicks. Blank means not reported. Series is blank on most posts until tagging is finished.")
    add("")
    cols = ["date", "ch", "fmt", "person", "company", "series", "client", "title", "reach", "views", "er", "reactions", "comments", "amp", "clicks"]
    head = ["date", "channel", "format", "person", "company", "series", "client", "title", "reach", "views", "eng_rate", "reactions", "comments", "reposts", "clicks"]
    t = [head] + [["" if p.get(k) is None else str(p.get(k)) for k in cols]
                  for p in sorted(posts, key=lambda p: p["date"], reverse=True)]
    add(csv_block(t))

    out = D / "ask.md"
    out.write_text("\n".join(L).rstrip() + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size:,} bytes, {len(posts)} posts, {len(dicts(SC / 'chart_index.csv'))} charts)")


if __name__ == "__main__":
    main()
