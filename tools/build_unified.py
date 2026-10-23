"""Split Rob's published scorecard into a layout template plus the data files it reads.

usage: python3 -I build_unified.py <rob_handoff_dir> <out_dir>
"""
import csv, json, os, re, shutil, sys
from bs4 import BeautifulSoup, NavigableString

SRC, OUT = sys.argv[1], sys.argv[2]
HTML = os.path.join(SRC, "01_dashboard_source", "ATM_Audience_Scorecard_v7_published_2026-09-29.html")
DATA = os.path.join(SRC, "02_data")
os.makedirs(os.path.join(OUT, "data", "scorecard", "charts"), exist_ok=True)
os.makedirs(os.path.join(OUT, "data", "scorecard", "tables"), exist_ok=True)

raw = open(HTML, encoding="utf-8").read()
soup = BeautifulSoup(raw, "html.parser")
page_text = []  # (key, html)

def inner(el):
    return "".join(str(c) for c in el.contents).strip()

def bind(el, key):
    page_text.append((key, inner(el)))
    el["data-k"] = key
    el.clear()

# ---------- header ----------
hdr = soup.find("header")
bind(hdr.find(class_="eyebrow"), "header.eyebrow")
bind(hdr.find("h1"), "header.title")
bind(hdr.find(class_="lede"), "header.lede")
bind(hdr.find(class_="meta"), "header.meta")

# ---------- sections ----------
tile_groups = {}   # section label -> list of group sizes, in order
table_n = 0
for sec in soup.find_all("section"):
    head = sec.find(class_="sec-head")
    if sec.get("id") == "audit":
        key = "audit"
        label = "Baseline"
        bind(sec.find(class_="eyebrow", recursive=False), "audit.eyebrow")
        bind(sec.find("h2", recursive=False), "audit.headline")
        bind(sec.find(class_="lede", recursive=False), "audit.lede")
        bind(sec.find(class_="meta", recursive=False), "audit.meta")
    else:
        label = head.find(class_="eyebrow").get_text()
        key = label.split(" · ")[0].strip()
        bind(head.find(class_="eyebrow"), f"{key}.eyebrow")
        bind(head.find("h2"), f"{key}.headline")
        if head.find("p"):
            bind(head.find("p"), f"{key}.lede")
    sec["data-sec"] = key

    # tiles
    for gi, tg in enumerate(sec.find_all(class_="tiles"), start=1):
        tile_groups.setdefault(label, []).append(len(tg.find_all(class_="tile")))
        tg["data-tiles"] = f"{label}|{gi}"
        tg.clear()

    # verdicts (baseline)
    v = sec.find(class_="verdicts")
    if v:
        v["data-verdicts"] = "Sep 19 baseline verdict"
        v.clear()

    # team flags
    p = sec.find(class_="plays")
    if p:
        p["data-plays"] = "flag for the team"
        p.clear()

    # cards
    n_title = n_note = n_sub = n_leg = 0
    for card in sec.find_all(class_="card"):
        figs = card.find_all("figure")
        if figs:
            card["data-chart-card"] = figs[0]["id"]
            for el in card.find_all("h3", recursive=False):
                el["data-chart-text"] = "card_title"; el.clear()
            for el in card.find_all(class_="sub", recursive=False):
                el["data-chart-text"] = "card_subtitle_as_published"; el.clear()
            for el in card.find_all(class_="sowhat", recursive=False):
                el["data-chart-text"] = "commentary_as_published"; el.clear()
            for el in card.find_all(class_="legend", recursive=False):
                n_leg += 1; bind(el, f"{key}.legend{n_leg}")
        else:
            h3 = card.find("h3", recursive=False)
            if h3:
                n_title += 1; bind(h3, f"{key}.card{n_title}.title")
            sub = card.find(class_="sub", recursive=False)
            if sub:
                n_sub += 1; bind(sub, f"{key}.card{n_title}.sub")
            for el in card.find_all(class_="sowhat", recursive=False):
                n_note += 1; bind(el, f"{key}.note{n_note}")
        t = card.find("table")
        if t:
            table_n += 1
            rows = t.find_all("tr")
            ths = rows[0].find_all("th")
            t["data-table"] = f"table_{table_n}"
            t["data-th-style"] = json.dumps([th.get("style", "") for th in ths])
            first = rows[1].find_all("td") if len(rows) > 1 else []
            t["data-td-class"] = json.dumps([" ".join(td.get("class", [])) for td in first])
            t.clear()
    # stand-alone sub-headings
    for i, h3 in enumerate([h for h in sec.find_all("h3", recursive=False)], start=1):
        bind(h3, f"{key}.subhead{i}")

# ---------- footer ----------
for i, span in enumerate(soup.find("footer").find_all("span", recursive=False), start=1):
    bind(span, f"footer.{i}")

# ---------- script: keep Rob's chart functions, drop his data block ----------
script = soup.find_all("script")[-1]
code = script.string
fn_part = code.split("/* ================= DATA & CHARTS ================= */")[0]
fn_part = fn_part.replace("(function(){", "", 1)
script.decompose()

# ---------- data files ----------
# charts: Rob's CSVs unchanged, plus his chart index
for f in os.listdir(os.path.join(DATA, "scorecard_charts")):
    if f.endswith(".csv") and not f.startswith("_"):
        shutil.copy(os.path.join(DATA, "scorecard_charts", f), os.path.join(OUT, "data", "scorecard", "charts", f))
shutil.copy(os.path.join(DATA, "scorecard_charts", "_chart_index.csv"), os.path.join(OUT, "data", "scorecard", "chart_index.csv"))

# tables, renamed table_1 .. table_4 in page order
for f in sorted(os.listdir(os.path.join(DATA, "scorecard_tables"))):
    n = re.match(r"table_(\d+)_", f).group(1)
    shutil.copy(os.path.join(DATA, "scorecard_tables", f), os.path.join(OUT, "data", "scorecard", "tables", f"table_{n}.csv"))

shutil.copy(os.path.join(DATA, "scorecard_written_analysis.csv"), os.path.join(OUT, "data", "scorecard", "written_analysis.csv"))

# stat tiles: add a `group` column (which tile row in the section)
rows = list(csv.DictReader(open(os.path.join(DATA, "scorecard_stat_tiles.csv"), encoding="utf-8")))
seen = {}
for r in rows:
    sizes = tile_groups[r["section"]]
    i = seen.get(r["section"], 0); seen[r["section"]] = i + 1
    acc, g = 0, 1
    for gi, s in enumerate(sizes, start=1):
        acc += s
        if i < acc: g = gi; break
    r["group"] = g
with open(os.path.join(OUT, "data", "scorecard", "stat_tiles.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=["section", "group", "data_vintage", "value_as_published", "label", "detail"])
    w.writeheader(); w.writerows(rows)

# page text
with open(os.path.join(OUT, "data", "scorecard", "page_text.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh); w.writerow(["key", "text"]); w.writerows(page_text)

# chart style: everything about how a chart is drawn that is not its data
CUSTOM = {"c-issues": "pct0", "c-issues2": "pct1", "c-lier": "pct1", "c-ytconv": "dec1", "c-optin": "pct_small2", "c-yt28": "pct0"}
style = {}
for c in json.load(open(os.path.join(DATA, "scorecard_charts", "_all_charts.json"), encoding="utf-8")):
    cid, t, args = c["chart_id"], c["chart_type"], c["args"]
    s = {"type": t}
    opts = dict(args[-1])
    if opts.get("fmt") == "custom_format": opts["fmt"] = CUSTOM[cid]
    if t == "bullet":
        s["rows"] = {r["label"]: {"max": r["max"], "fmt": r["fmt"], "marks": {m["label"]: m.get("short", m["label"]) for m in r.get("marks", [])}} for r in args[0]}
    elif t in ("hbar", "stack100"):
        s["colors"] = {r["label"]: r["color"] for r in args[0] if r.get("color")}
    elif t == "vbar":
        if opts.get("colors"): opts["colors"] = dict(zip(args[0], opts["colors"]))
        opts.pop("notes", None)  # notes come from the CSV
    elif t in ("vstack", "line"):
        s["colors"] = {sr["name"]: sr["color"] for sr in args[1]}
    s["opts"] = opts
    style[cid] = s
json.dump(style, open(os.path.join(OUT, "data", "scorecard", "chart_style.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# ---------- daily sections (Hannah's data, Rob's markup style) ----------
def frag(h):
    return BeautifulSoup(h, "html.parser")

def segbtns(key, opts, default):
    return f'<div class="seg" data-for="{key}" role="group">' + "".join(
        f'<button type="button" data-v="{v}" aria-pressed="{"true" if v == default else "false"}">{l}</button>' for v, l in opts) + '</div>'
RANGE = [("7", "7d"), ("14", "14d"), ("30", "30d"), ("all", "All")]

hdr.find(attrs={"data-k": "header.meta"}).insert_after(frag(
    '<div class="meta status-strip" data-added><span id="st-daily">Daily social: loading…</span><span id="st-monthly"></span></div>'))

def chart_card(cid, title, sub, seg_key=None, legend=None, sub_id=None, src="LinkedIn page analytics, daily"):
    head = f'<div class="head"><h3>{title}</h3>{segbtns(seg_key, RANGE, "7") if seg_key else ""}</div>'
    return (f'<div class="card">{head}<p class="sub"{f" id={chr(34)}{sub_id}{chr(34)}" if sub_id else ""}>{sub}</p>'
            f'<figure id="{cid}"></figure>{legend or ""}<p class="src">Source: {src}</p></div>')

now = f"""
<section id="now" data-added>
  <div class="sec-head"><span class="eyebrow" id="now-eyebrow">Daily</span><h2>Social over the last 7, 14 and 30 days</h2><p id="now-lede">Loading the latest numbers from the daily sheet…</p></div>
  <div class="grid two">
    {chart_card("d-liimpr", "LinkedIn organic impressions per day", "Paid excluded. LinkedIn reports a day or two late.", "liimpr")}
    {chart_card("d-lifoll", "LinkedIn followers", "Running organic follower count.", "lifoll")}
    {chart_card("d-igreach", "Instagram reach and views, 28-day rolling", "Meta's 28-day rolling figures.", "igreach", '<div class="legend"><span class="line" style="--c:var(--s2)">Reach</span><span class="line" style="--c:var(--s4)">Views</span></div>', "d-igreach-sub", "Meta Business Suite, daily reads")}
    {chart_card("d-igfoll", "Instagram followers", "Lifetime follower total.", "igfoll", None, "d-igfoll-sub", "Instagram profile, daily reads")}
  </div>
  <h3 style="margin:26px 0 10px">Engagement on posts published in the last 30 days, against the 30 before</h3>
  <div class="tiles" id="now-delta"></div>
  <details class="fnote"><summary>How these figures are worked out</summary><p id="now-delta-note"></p></details>
  <div class="card-row-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:26px 0 10px"><h3 style="margin:0">Trailing 30-day engagement</h3>{segbtns("eng", [("LinkedIn", "LinkedIn"), ("Instagram", "Instagram")], "LinkedIn")}</div>
  <div class="grid two">
    <div class="card"><h3 id="d-eng-t1">Reactions</h3><p class="sub">Total for posts published in the 30 days up to each date.</p><figure id="d-eng-rx"></figure><div class="legend" id="d-eng-legend1"></div><p class="src">Source: LinkedIn page analytics and Meta Business Suite, per post</p></div>
    <div class="card"><h3 id="d-eng-t2">Comments and reposts</h3><p class="sub">Same window, on their own scale.</p><figure id="d-eng-cm"></figure><div class="legend" id="d-eng-legend2"></div><p class="src">Source: LinkedIn page analytics and Meta Business Suite, per post</p></div>
  </div>
</section>
"""
READ = """
<section id="read" class="actions-view" data-added>
  <div class="sec-head"><span class="eyebrow" id="read-eyebrow"></span><h2 id="read-headline"></h2><p id="read-lede"></p></div>
  <div class="card"><h3>What happened</h3><ol class="findings two-col" id="read-findings"></ol></div>
</section>
"""
BRIEF = """
<section id="briefings" class="brief-view" data-added>
  <div class="sec-head"><span class="eyebrow" id="brief-eyebrow">Briefings</span><h2>Two short reads, one for each job</h2><p>Each briefing keeps to what its reader needs. The editorial briefing is rewritten every Monday; proof points update when the page opens.</p></div>
  <div class="brief-tabs" id="brief-tabs" role="tablist" aria-label="Briefings">
    <button type="button" role="tab" data-b="editorial" aria-selected="true">This week's editorial decisions<span class="who">For Hannah</span></button>
    <button type="button" role="tab" data-b="proof" aria-selected="false">Client and partner proof<span class="who">For Rob and Christine</span></button>
  </div>
  <div class="brief-panel" id="brief-editorial" role="tabpanel">
    <p class="brief-intro" id="brief-editorial-meta"></p>
    <h3 class="brief-h">Three patterns worth acting on</h3>
    <div class="brief-list" id="brief-patterns"></div>
    <h3 class="brief-h">Two experiments for next week</h3>
    <div class="grid two" id="brief-experiments"></div>
    <p class="sub" id="brief-editorial-note" style="margin-top:12px;max-width:80ch"></p>
  </div>
  <div class="brief-panel" id="brief-proof" role="tabpanel" hidden>
    <p class="brief-intro">Proof points for a pitch or renewal. With no filter, three for ATM as a whole: who the audience is, a piece of content that worked, and what partners add when they share it. Pick a partner, series or industry to get a profile of it instead. Each point names its source and can be copied as written.</p>
    <div class="pf-row">
      <label>Partner<select id="pf-partner"></select></label>
      <label>Series<select id="pf-series"></select></label>
      <label>Industry<select id="pf-industry"></select></label>
      <button type="button" id="pf-clear">Clear</button>
    </div>
    <p class="sub" id="pf-scope"></p>
    <div class="grid three proof-grid"><div class="card proof" id="pp-audience"></div><div class="card proof" id="pp-content"></div><div class="card proof" id="pp-amp"></div></div>
    <details class="fnote"><summary>How these are worked out</summary><p>Posts from May 21 on, LinkedIn and Instagram. Partner and industry come from data/companies.csv, which maps each company named in a post to its parent partner and an industry; edit it to regroup. Series comes from the post's tag where Hannah has set one, otherwise from series names in the post text, until the confirmed series list replaces it. The strongest example is the post with the highest reach against its channel's median, among posts at or above the median engagement rate (a post that reached far with little engagement is usually boosted). Repost lift is from September's repost tracking, the only month recorded so far. A partner profile shows who appeared (titles from the ATM Kitchen board and post copy), how many of its posts beat ATM's median, and its posts by month. A series profile shows the run, whether reach is rising (later half against earlier half), and how it compares with all other posts. An industry profile shows its share of posts, its top partners and the seniority of its guests. When more than one filter is set, the partner profile wins, then the series profile.</p></details>
  </div>
</section>
"""
TOOLBAR = """
<div class="toolbar" data-added>
  <div class="seg viewsw" data-for="view" role="group" aria-label="View"><button type="button" data-v="data" aria-pressed="true">Data &amp; insights</button><button type="button" data-v="briefings" aria-pressed="false">Briefings</button><button type="button" data-v="actions" aria-pressed="false">Actions</button></div>
  <form class="ask" id="ask-form" autocomplete="off"><input id="ask-q" type="text" placeholder="Ask for a custom insight, e.g. Which guests drive the most comments?" aria-label="Ask for a custom insight"><button type="submit">Ask Claude</button></form>
  <div class="refresh"><button type="button" id="refresh-btn" title="Reload the latest data">&#8635; Refresh</button><span class="dim" id="loaded-at"></span></div>
  <button type="button" id="guide-btn" class="guide-btn" aria-haspopup="dialog">How to use</button>
  <p class="ask-note dim" id="ask-note" hidden></p>
  <dialog id="guide" aria-labelledby="guide-title">
    <div class="guide-head"><h2 id="guide-title">How to use this dashboard</h2><button type="button" class="guide-close" aria-label="Close the guide">&times;</button></div>
    <div class="guide-body">
      <h3>Three views</h3>
      <p><b>Data &amp; insights</b> (the default) shows the numbers. <b>Briefings</b> holds two short reads: this week's editorial decisions (patterns, supporting posts and two experiments) and client and partner proof (proof points you can filter by partner, series or industry and copy into a pitch). <b>Actions</b> shows what to do: ranked priorities, steps to catch posts tagged to the wrong page, setup tasks, and tracking and site fixes. Switch with the buttons at the top left. Links ending #actions or #briefings/proof open a view directly.</p>
      <h3>Reading the page, top to bottom</h3>
      <ul>
        <li><b>Overview:</b> total audience, site traffic, new against returning visitors, and the scorecards. Each scorecard compares the last full month with the three months before it: <span class="chg up">&#9650; green</span> is better, <span class="chg down">&#9660; red</span> is worse.</li>
        <li><b>September baseline:</b> the audit's verdicts. The detail behind them is at the bottom of the page (sections 01 to 06).</li>
        <li><b>At a glance:</b> pick a channel and a time frame. The headline, bullets, chart and measures all follow your choice, and the month's headline numbers sit underneath.</li>
        <li><b>Social over the last 7, 14 and 30 days:</b> daily charts. Each chart has its own time buttons.</li>
        <li><b>B to F:</b> the year by month, partner reposts, executives featured, what worked, and the top posts of the last 30 days.</li>
        <li><b>Sections 01 to 06:</b> the baseline detail. Charts in 02 to 05 sit in carousels: use the arrows to page through.</li>
      </ul>
      <h3>When the numbers change</h3>
      <ul>
        <li><b>Daily social</b> (LinkedIn, Instagram, YouTube): read from the daily sheet each time the page opens. LinkedIn reports a day or two late.</li>
        <li><b>Site traffic from GA4:</b> every Monday morning.</li>
        <li><b>Monthly scorecard and analysis:</b> after each monthly run, around the end of the month.</li>
      </ul>
      <p>The lines under the page title show how current each source is. <b>Refresh</b> reloads the latest figures.</p>
      <h3>Notes worth knowing</h3>
      <ul>
        <li>Grey "How these figures are worked out" lines open to explain a calculation. Grey "What changed and when" lines give the context behind a move, such as a paused ad flight or a new kind of tracking.</li>
        <li>"At The Moment" is a separate LinkedIn page with a similar name. It is watched as a peer, never counted as ATM.</li>
        <li>Newsletter list size includes imported addresses, so verified clicks are the better measure of readers.</li>
      </ul>
      <h3>Ask Claude</h3>
      <p>Type a question in the box at the top and press <b>Ask Claude</b>. A new Claude chat opens with the latest figures and links to the full data. For full answers, connect Google Drive in Claude and make sure you can open the "ATM Dashboard: Claude data" folder. Without that, Claude answers from the figures it was sent and says so. Check any number it gives against the page before you use it.</p>
      <h3>Questions or ideas</h3>
      <p>Tell Matt.</p>
    </div>
  </dialog>
</div>
"""
OVERVIEW = """
<section id="overview" data-added>
  <div class="sec-head"><span class="eyebrow">Overview</span><h2>Where ATM stands</h2></div>
  <div class="overview">
    <div class="measure ov-wide" id="ov-audience"><div class="mk">Total audience</div><div class="mp dim">Loading…</div></div>
    <div class="measure" id="ov-site"><div class="mk">Site traffic</div></div>
    <div class="measure" id="ov-newret"><div class="mk">New vs returning visitors</div></div>
    <div class="measure" id="ov-yoy"><div class="mk">Year over year</div></div>
  </div>
  <h3 style="margin:22px 0 10px">Scorecards: the last full month against the three before</h3>
  <div class="tiles" id="a-bench-tiles"></div>
  <details class="fnote"><summary>How these figures are worked out</summary><p id="a-bench-note"></p></details>
</section>
"""
GLANCE = """
<section id="glance" data-added>
  <div class="glance-head"><div><span class="eyebrow">At a glance</span><h2 id="glance-title">The latest</h2></div>
    <div class="glance-tabs">
      <div class="seg" data-for="channel" role="group" aria-label="Channel"><button type="button" data-v="all" aria-pressed="true">All</button><button type="button" data-v="li" aria-pressed="false">LinkedIn</button><button type="button" data-v="ig" aria-pressed="false">Instagram</button><button type="button" data-v="yt" aria-pressed="false">YouTube</button><button type="button" data-v="nl" aria-pressed="false">Newsletter</button><button type="button" data-v="site" aria-pressed="false">Site</button></div>
      <div class="seg" data-for="glance" role="group" aria-label="Time frame"><button type="button" data-v="7" aria-pressed="true">7 days</button><button type="button" data-v="14" aria-pressed="false">14 days</button><button type="button" data-v="30" aria-pressed="false">30 days</button><button type="button" data-v="all" aria-pressed="false">All</button></div>
    </div></div>
  <div class="glance-body">
    <div><p class="glance-headline" id="glance-headline"></p><ul class="glance" id="glance-list"><li class="dim">Loading…</li></ul></div>
    <div class="card"><figure id="glance-chart"></figure><p class="sub" id="glance-chart-cap"></p></div>
  </div>
  <h3 style="margin:22px 0 10px">The measures that matter most</h3>
  <div class="measures" id="measures"></div>
  <div id="headline-tiles"></div>
  <p class="sub" id="measures-note" style="margin-top:10px;max-width:80ch"></p>
</section>
"""
ACTIONS = """
<section id="actions" class="actions-view" data-added>
  <div class="sec-head"><span class="eyebrow" id="actions-eyebrow">Actions</span><h2>What to do next</h2><p>Ranked suggestions from the latest analysis, which reads every source on the dashboard together with the optimization log.</p></div>
  <div class="grid two" id="actions-grid">
    <div class="card"><h3>Priorities</h3><div class="plays" id="read-actions"></div></div>
    <div class="card"><h3>Catch posts tagged to the wrong page</h3><p class="sub">"At The Moment" is a separate LinkedIn page with a similar name. These steps catch follows and tags meant for ATM that land there.</p><p class="sub" id="peer-watch"></p><div class="plays" id="tag-actions"></div></div>
    <div class="card"><h3>Setup tasks</h3><p class="sub">Access and tracking work that unlocks parts of the dashboard. Each names an owner.</p><div class="plays" id="setup-actions"></div></div>
    <div class="card"><h3>Tracking and site fixes</h3><p class="sub">Known measurement and setup problems that skew the numbers or cost readers until they are fixed.</p><div class="plays" id="tracking-actions"></div></div>
  </div>
</section>
"""
hdr.insert_before(frag(TOOLBAR))
hdr.insert_after(frag(GLANCE))
hdr.insert_after(frag(OVERVIEW))
hdr.find_next_sibling("section", id="glance").insert_after(frag(ACTIONS))
soup.find("section", id="actions").insert_after(frag(BRIEF))
secA = soup.find("section", attrs={"data-sec": "A"})
secA.insert_before(frag(now))
secA.decompose()  # its headline numbers now live in the At a glance measures
# the September baseline summary sits between the Overview and At a glance
_audit = soup.find("section", id="audit").extract()
_audit.find(attrs={"data-verdicts": True}).insert_after(frag('<p class="sub" data-added style="margin-top:12px">The detail behind each verdict is in sections 01 to 06 further down the page.</p>'))
soup.find("section", id="glance").insert_before(_audit)
# 08 (data plumbing) is folded into Tracking and site fixes in the analysis, so the section goes
soup.find("section", attrs={"data-sec": "08"}).decompose()
# baseline charts that repeat section B or the live GA4 data, and the 05 fixes table (now under Tracking and site fixes)
for _cid in ("c-li", "c-ytpaid", "c-gausers", "c-igmonthly", "c-gachan"):
    _f = soup.find("figure", id=_cid)
    if _f: _f.find_parent(class_="card").decompose()
_t3 = soup.find(attrs={"data-table": "table_3"})
if _t3: _t3.find_parent(class_="card").decompose()
# chart carousels for the LinkedIn, Instagram & YouTube, and site sections
for k in ("02", "03", "04", "05"):
    sec = soup.find("section", attrs={"data-sec": k})
    for g in sec.find_all("div", class_="grid", recursive=False):
        n = len(g.find_all(class_="card", recursive=False))
        if not g.find("figure") or n < 3: continue
        g["class"] = ["carousel-track"]; g["tabindex"] = "0"; g["aria-label"] = f"{n} charts; use the arrows to page through"
        wrap = soup.new_tag("div", attrs={"class": "carousel", "data-added": ""})
        g.wrap(wrap)
        wrap.insert(0, frag('<div class="carousel-ctl"><button type="button" class="cprev" aria-label="Previous charts">&#8249;</button><span class="ccount dim"></span><button type="button" class="cnext" aria-label="Next charts">&#8250;</button></div>'))


secB = soup.find("section", attrs={"data-sec": "B"})
secB.find(class_="grid").append(frag('<div class="card" data-added><h3>YouTube watch hours per month</h3><p class="sub">Account level. Faded bars are pre-launch or partial months.</p><figure id="d-ytwatch"></figure><p class="sowhat">Watch time follows views: it fell away when the paid flight ended in August.</p><p class="src">Source: YouTube Studio, monthly</p></div>'))

ctrl = ('<div class="ctrl">' + segbtns("posts", [("all", "All"), ("LinkedIn", "LinkedIn"), ("Instagram", "Instagram")], "all") +
        '<input id="p-search" type="search" placeholder="Search person, company or post" aria-label="Search posts">'
        '<select id="p-month" aria-label="Month"></select>'
        '<select id="p-field" aria-label="Search in"><option value="any">Search: anything</option><option value="person">Person only</option><option value="company">Company only</option><option value="title">Post copy only</option></select>'
        '<span class="dim" id="p-count"></span></div>')
F = f"""
<section id="posts" data-added>
  <div class="sec-head"><span class="eyebrow" id="f-eyebrow">F · Posts</span><h2>Post by post, ranked</h2><p id="f-lede"></p></div>
  <div class="grid two">
    <div class="card"><h3>Running benchmarks, all posts</h3><p class="sub">Median is the typical post; the average is pulled up by a few outliers, so set targets on the median.</p><div class="tblwrap"><table id="d-bench"></table></div><p class="src">Source: LinkedIn page analytics and Meta Business Suite, per post</p></div>
    <div class="card"><h3>Comments by post, LinkedIn</h3><p class="sub" id="d-cmt-sub"></p><figure id="d-cmt"></figure><p class="src">Source: LinkedIn page analytics and Meta Business Suite, per post</p></div>
  </div>
  <div class="card" style="margin-top:18px"><div class="head"><h3>Top content, last 30 days</h3>{segbtns("top", [("all", "All"), ("LinkedIn", "LinkedIn"), ("Instagram", "Instagram")], "all")}</div><p class="sub" id="d-top-sub"></p><div class="tblwrap tall"><table id="d-top" class="posts"></table></div></div>
</section>
"""
soup.find("section", attrs={"data-sec": "E"}).insert_after(frag(F))
soup.find("footer").insert(0, frag('<span id="foot-daily" data-added></span>'))
_flags = soup.find("section", attrs={"data-sec": "D"}).find(attrs={"data-plays": True}).find_parent(class_="card")
_flags.extract()
soup.find(id="actions-grid").append(_flags)
# section D: the tally tiles give way to CEOs featured, the month's executives and the month's top executives
_secD = soup.find("section", attrs={"data-sec": "D"})
_secD.find(attrs={"data-tiles": True}).decompose()
_SRC_EX = '<p class="src">Source: titles from the ATM Kitchen board and post copy; appearances from LinkedIn and Instagram posts</p>'
_secD.find("div", class_="grid").insert_before(frag(f'''<div class="grid two" data-added style="align-items:start">
  <div class="card"><h3>CEOs featured</h3><p class="sub" id="d-ceo-sub"></p><div id="d-ceo"><p class="dim">Loading…</p></div>{_SRC_EX}</div>
  <div class="card"><h3 id="d-execs-title">Executives featured last month</h3><p class="sub" id="d-execs-sub"></p><div id="d-execs"></div>{_SRC_EX}</div>
</div>'''))
_sect = _secD.find("figure", id="s-sect").find_parent(class_="card")
_sect.insert_before(frag(f'''<div class="card" data-added><h3 id="d-topx-title">Top executives by engagement</h3><p class="sub" id="d-topx-sub"></p><figure id="d-topx"></figure>{_SRC_EX}</div>'''))


# ---------- neutral source wording (sources named by platform, not by person) ----------
NEUTRAL = {
 'page_text.csv': [('read in Rob\'s ""reporting"" Chrome (Sep 29)', 'read directly (Sep 29)'), ("read directly in Rob's Chrome (Sep 19)", 'read directly (Sep 19)'), ("· Hannah's monthly pre-reads ", '· monthly pre-reads '), ("Rob's seat assigned", 'a second seat assigned'), ("The native dashboards were read directly in Rob's Chrome.", 'The native dashboards were read directly.')],
 'chart_index.csv': [("Rob's custom channel group", 'A custom channel group'), ("Browser read in a signed-in Chrome on Rob's Mac.", "Read directly from the platform's own dashboard."), ("plus Hannah's August read of the", 'plus an August read of the'), ("plus Hannah Noll's August read of the", 'plus an August read of the')],
 'tables/table_3.csv': [("not just Rob's custom group", 'not just one custom report')],
 'tables/table_4.csv': [('ask Hannah/Amanda for the Slack channel history', 'ask the team for the Slack channel history')],
 'charts/c-lictr.csv': [('(Aug, Hannah)', '(Aug)')],
 'chart_style.json': [('(Aug, Hannah)', '(Aug)')],
}
# name the baseline by its month, not its day
BASELINE_MONTH = [('Baseline · Sep 19 internal audience audit', 'Baseline · September internal audience audit'), ('· pulled Sep 19, 2026 ·', '· pulled September 2026 ·'),
                  ('Sep 19 baseline: ', 'September baseline: '), ('baseline sections prepared Sep 19, 2026', 'baseline sections prepared September 2026'),
                  ('read directly (Sep 19)', 'read directly (September)'), ('via Supermetrics (Sep 19)', 'via Supermetrics (September)'),
                  ('Sep 19 2026 baseline audit (not refreshed since)', 'September 2026 baseline (not refreshed since)')]
for f in ('page_text.csv', 'chart_index.csv', 'stat_tiles.csv'):
    NEUTRAL.setdefault(f, [])
for f in ('page_text.csv', 'chart_index.csv', 'stat_tiles.csv'):
    NEUTRAL[f] = NEUTRAL[f] + BASELINE_MONTH
SEPARATE_PAGE = {
 'page_text.csv': [(', on a 3,806-follower base that is also split in two', ', on a 3,806-follower base'),
                   ('A second ATM page (""At The Moment"", 1,803 followers) sits in LinkedIn\'s own competitor table.', '""At The Moment"", a separate page with a similar name (1,803 followers), sits in LinkedIn\'s own competitor table and is watched as a peer.')],
 'chart_index.csv': [(', on a 3,806-follower base that is also split in two', ', on a 3,806-follower base'),
                     (" Add the duplicate page's 113/month and ATM is leaving two-fifths of its follower growth on a page nobody posts to.", ' ""At The Moment"", a separate page with a similar name, added 113 in the same 30 days on two posts, so watch it for follows and tags meant for ATM.')],
 'stat_tiles.csv': [('Followers on the duplicate ""At The Moment"" page"', 'Followers on ""At The Moment"" (separate page, similar name)"'), ('+113 in 30 days; 2 posts; merge it', '+113 in 30 days on 2 posts; watch for mis-tags')],
 'tables/table_2.csv': [('(ATM duplicate)', '(separate page)')],
 'tables/table_3.csv': [('"Merge ""At The Moment"" into the ATM page",LinkedIn page-merge request,+113 followers/month stop landing on a page nobody posts to', '"Catch tags and follows meant for ATM that land on ""At The Moment""",LinkedIn mentions and the competitor table,Mis-tagged posts get fixed while they are fresh')],
 'tables/table_4.csv': [(' Fix: merge the duplicate ""At The Moment"" page', ' Watch: ""At The Moment"" is a separate page with a similar name; catch mis-tags')],
}
SEPARATE_PAGE['page_text.csv'] = SEPARATE_PAGE['page_text.csv'] + [
    ('06.headline,Incumbents lead on scale. The fast growers grow through people and rooms.', '06.headline,Incumbents lead on scale.'),
    ('Every peer that grew in 2025–26 did it with mechanics ATM has not yet run: guests sharing their own interviews (FOS), events (Semafor, Marketecture), writer-as-franchise (Puck), awards (Digiday).', 'Newsletter list size for ATM and its peers, from media kits and public statements, 2025–26.'),
    ('08.headline,Everything is connected. Three instruments are mis-configured.', '08.headline,Data sources: what is connected and what still needs fixing'),
    ('Supermetrics has all seven sources on the plan as of 5:00pm Sep 19 (AI Chats destination swapped in, a second seat assigned, GA4 property shared, Search Console swapped in for Meta Ads). The native dashboards were read directly. What remains is configuration, not access.', 'Each source as of the September baseline, with the fix it still needs. Open items also appear under Setup tasks and Tracking issues above.'),
]
for f, pairs in SEPARATE_PAGE.items():
    NEUTRAL[f] = NEUTRAL.get(f, []) + pairs
for f, pairs in NEUTRAL.items():
    fp = os.path.join(OUT, "data", "scorecard", f)
    t = open(fp, encoding="utf-8").read()
    for a, b in pairs:
        t = t.replace(a, b)
    open(fp, "w", encoding="utf-8").write(t)

# ---------- write the template ----------
import time
BUILD = time.strftime("%Y%m%d%H%M%S")
EXTRA_CSS = """.card .src{color:var(--muted);font-size:11.5px;margin-top:2px}
.card .head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px 12px;flex-wrap:wrap}
.seg{display:inline-flex;border:1px solid var(--ring);border-radius:999px;overflow:hidden;flex:none}
.seg button{font:500 12px "IBM Plex Sans",system-ui,sans-serif;padding:4px 11px;border:0;background:var(--surface);color:var(--ink2);cursor:pointer}
.seg button+button{border-left:1px solid var(--ring)}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--plane)}
.seg button:focus-visible{outline:2px solid var(--s1);outline-offset:-2px}
.ctrl{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:6px 0 10px}
.ctrl input,.ctrl select{font:13px "IBM Plex Sans",system-ui,sans-serif;padding:5px 8px;border:1px solid var(--ring);border-radius:4px;background:var(--surface);color:var(--ink);max-width:100%}
.ctrl input{flex:1 1 220px}
.tblwrap.tall{max-height:560px;overflow:auto}
.tblwrap.tall th{position:sticky;top:0;background:var(--surface);z-index:1}
th.sortable{cursor:pointer;white-space:nowrap}
td.beat{color:var(--goodtext);font-weight:600}
.dim{color:var(--muted)}
.findings{margin:6px 0 0;padding-left:20px;display:grid;gap:12px;font-size:14px}
.findings b{display:block;margin-bottom:2px}
.notes{margin:6px 0 0;padding-left:18px;display:grid;gap:6px;font-size:13.5px;color:var(--ink2)}
table.posts td{white-space:nowrap}
table.posts td.post{white-space:normal;min-width:260px;max-width:440px}
.toolbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:10px 0;background:var(--plane);border-bottom:1px solid var(--grid)}
.toolbar .ask{display:flex;flex:1 1 320px;gap:6px;min-width:0}
.toolbar .ask input{flex:1;min-width:0;font:13.5px "IBM Plex Sans",system-ui,sans-serif;padding:6px 10px;border:1px solid var(--ring);border-radius:6px;background:var(--surface);color:var(--ink)}
.toolbar button{font:600 12.5px "IBM Plex Sans",system-ui,sans-serif;padding:6px 12px;border:1px solid var(--ring);border-radius:6px;background:var(--surface);color:var(--ink);cursor:pointer;white-space:nowrap}
.toolbar .ask button{background:var(--ink);color:var(--plane);border-color:var(--ink)}
.toolbar .refresh{display:flex;align-items:center;gap:8px;font-size:12px}
.toolbar .ask-note{flex-basis:100%;margin:0;font-size:12.5px}
#guide{width:min(720px,calc(100vw - 32px));max-height:min(86vh,900px);padding:0;border:1px solid var(--ring);border-radius:10px;background:var(--surface);color:var(--ink);box-shadow:0 12px 40px rgba(0,0,0,.18)}
#guide::backdrop{background:rgba(0,0,0,.35)}
#guide .guide-head{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--grid)}
#guide .guide-head h2{margin:0;font-size:20px}
#guide .guide-close{font:400 26px/1 "IBM Plex Sans",system-ui,sans-serif;width:36px;height:36px;border:1px solid var(--ring);border-radius:50%;background:var(--surface);color:var(--muted);cursor:pointer;padding:0 0 3px}
#guide .guide-body{padding:6px 20px 20px;font-size:14px;line-height:1.55;color:var(--ink2);overflow:auto}
#guide .guide-body h3{margin:16px 0 4px;font-size:14.5px;color:var(--ink)}
#guide .guide-body p{margin:4px 0}
#guide .guide-body ul{margin:4px 0;padding-left:18px;display:grid;gap:5px}
#guide b{color:var(--ink)}
.toolbar button:focus-visible,.toolbar input:focus-visible{outline:2px solid var(--s1);outline-offset:1px}
@media (max-width:600px){.toolbar{position:static}}
body[data-view="actions"] .wrap>:not(.toolbar):not(.actions-view):not(#tip){display:none}
body[data-view="briefings"] .wrap>:not(.toolbar):not(.brief-view):not(#tip){display:none}
body:not([data-view="briefings"]) .brief-view{display:none}
.brief-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 18px;border-bottom:1px solid var(--ring)}
.brief-tabs button{font:inherit;font-weight:600;font-size:14px;background:none;border:0;border-bottom:3px solid transparent;color:var(--ink2);padding:8px 4px 10px;margin-right:14px;cursor:pointer;text-align:left}
.brief-tabs button .who{display:block;font-weight:400;font-size:12px;color:var(--muted)}
.brief-tabs button .count{font:600 11px "IBM Plex Mono",monospace;margin-left:6px;padding:1px 6px;border-radius:999px;background:var(--wash-crit);color:var(--crit)}
.brief-tabs button .count:empty{display:none}
.brief-tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--s1)}
.brief-tabs button:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.brief-intro{max-width:80ch;color:var(--ink2);margin:0 0 14px}
.brief-h{margin:22px 0 10px;font-size:16px}
.brief-list{display:grid;gap:14px}
.brief-card{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;align-items:start}
.brief-card h3{margin:0 0 6px}
.brief-card p{margin:8px 0 0;max-width:80ch}
.brief-num{font:800 20px "Archivo",sans-serif;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--grid);color:var(--ink)}
.brief-card.exp .brief-num{background:var(--wash-good);color:var(--goodtext)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font:600 11px "IBM Plex Mono",monospace;padding:2px 8px;border-radius:999px;background:var(--grid);color:var(--ink2)}
.brief-card .brief-measure{color:var(--ink2);font-size:13.5px;border-left:3px solid var(--s1);padding-left:10px}
table.mini .nw{white-space:nowrap}
.brief-card .owner{font-size:13px;color:var(--muted)}
.tbl-wrap{overflow-x:auto;margin-top:6px}
table.mini{border-collapse:collapse;font-size:12.5px;width:100%;min-width:520px}
table.mini th,table.mini td{padding:5px 8px;border-bottom:1px solid var(--ring);text-align:left;vertical-align:top}
table.mini th{font-weight:600;color:var(--muted);font-size:11.5px}
table.mini .num{text-align:right;font-family:"IBM Plex Mono",monospace;white-space:nowrap}
.pf-row{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:10px}
.pf-row label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--ink2)}
.pf-row select{font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--ring);border-radius:8px;background:var(--surface);color:var(--ink);max-width:260px}
.pf-row button,.copy-btn{font:inherit;font-size:13px;padding:7px 12px;border:1px solid var(--ring);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer}
.grid.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
@media (max-width:900px){.grid.three{grid-template-columns:1fr}}
.card.proof{display:flex;flex-direction:column;gap:6px}
.card.proof .mk{font-size:12px;color:var(--ink2);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.card.proof .mv{font-family:"Archivo",sans-serif;font-size:34px;font-weight:800;line-height:1.05}
.card.proof p{margin:0}
.plist{margin:4px 0 0;padding-left:18px;font-size:13.5px}
.plist li{margin:3px 0}
.mbars{display:flex;align-items:flex-end;gap:6px;height:84px;margin:4px 0 6px}
.mb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0}
.mb i{display:block;width:100%;max-width:26px;background:var(--s1);border-radius:3px 3px 0 0}
.mbv{font:600 11px "IBM Plex Mono",monospace;color:var(--ink2);margin-bottom:2px}
.mbl{font-size:11px;color:var(--muted);margin-top:4px}
.card.proof .copy-btn{align-self:start;margin-top:auto}
.att-head{margin:20px 0 8px;font-size:16px}
.att-row{display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid var(--ring)}
.att-row .pill{justify-self:start;align-self:start;height:auto;white-space:nowrap}
.att-body p{margin:4px 0 8px;max-width:80ch;color:var(--ink2)}
.att-body dl{display:flex;gap:18px;flex-wrap:wrap;margin:0;font-size:13px}
.att-body dt{color:var(--muted);font-size:11.5px;font-weight:600}
.att-body dd{margin:0}
.pill.new i{background:var(--s1)}
@media (max-width:640px){.brief-tabs{flex-wrap:nowrap;overflow-x:auto}.brief-tabs button{flex:0 0 auto}.att-row{grid-template-columns:minmax(0,1fr)}.pf-row label,.pf-row select{width:100%;max-width:none}.pf-row{display:grid}.brief-tabs button{margin-right:6px}}
body:not([data-view="actions"]) .actions-view{display:none}
.fnote{margin-top:10px;max-width:80ch;color:var(--muted);font-size:12.5px}
.fnote ul{margin:6px 0 0;padding-left:18px}.fnote li{margin:3px 0}
.fnote summary{cursor:pointer;font-weight:600;color:var(--ink2);width:max-content;max-width:100%}
.fnote summary:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.fnote p{margin:6px 0 0}
.verdict{align-content:start}
.verdict .pill{justify-self:start}
.exec-n{font-family:"Archivo",sans-serif;font-size:36px;font-weight:800;line-height:1;margin:2px 0 8px}
.exec-list{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px;font-size:13px;color:var(--ink2)}
.exec-list b{color:var(--ink);font-weight:600}
.exec-list .when{color:var(--muted);font-size:12px}
.exec-cols{display:block;columns:2 210px;column-gap:18px}
.exec-cols li{break-inside:avoid;margin-bottom:6px}
.chg{font-weight:600}
.chg.up{color:var(--goodtext)}
.chg.down{color:var(--crit)}
.hl-head{margin:22px 0 10px;font-size:14px}
.hl-head .dim{font-weight:400}
.hl-tiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
.hl{border:1px solid var(--ring);border-radius:6px;padding:10px 12px;background:var(--surface);display:grid;gap:3px;align-content:start}
.hl .hv{font-family:"Archivo",sans-serif;font-size:22px;font-weight:800;line-height:1.1}
.hl .hk{font-size:12px;font-weight:600;color:var(--ink2)}
.hl .hd{font-size:11.5px;color:var(--muted)}
.carousel{margin-top:18px}
.carousel-ctl{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin:0 0 18px;font-size:15px;font-weight:600;color:var(--ink2)}
.carousel-ctl .ccount{min-width:5.5em;text-align:center}
.carousel-ctl button{font:600 24px/1 "IBM Plex Sans",system-ui,sans-serif;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 0 3px;border:1px solid var(--ring);border-radius:50%;background:#fff;color:var(--muted);cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.carousel-ctl button:not(:disabled):hover{color:var(--ink2);border-color:var(--muted)}
.carousel-ctl button:disabled{opacity:.35;cursor:default}
.carousel-ctl button:focus-visible,.carousel-track:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.carousel-track{display:flex;align-items:flex-start;gap:18px;overflow:hidden;scroll-behavior:smooth;overscroll-behavior-x:contain}
.carousel-track>.card{flex:0 0 calc(50% - 9px);min-width:0}
@media (max-width:860px){.carousel-track>.card{flex-basis:100%}}
#glance{padding-top:28px}
.glance-head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.glance{margin:0;padding-left:20px;display:grid;gap:7px;font-size:14.5px;line-height:1.5}
.glance-headline{font-family:"Archivo",sans-serif;font-size:19px;font-weight:700;line-height:1.3;margin:0 0 10px}
.glance-tabs{display:flex;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%}
@media (max-width:600px){.glance-head{flex-wrap:wrap}.glance-tabs{width:100%}.glance-tabs .seg{max-width:100%;overflow-x:auto;scrollbar-width:none}.glance-tabs .seg button{flex:none}}
.glance-body{display:grid;gap:18px;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}
@media (max-width:860px){.glance-body{grid-template-columns:1fr}}
#overview{padding-top:28px}
.overview{display:grid;gap:12px;grid-template-columns:minmax(0,1.7fr) repeat(3,minmax(0,1fr))}
@media (max-width:980px){.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.overview .ov-wide{grid-column:span 2}}
@media (max-width:600px){.overview{grid-template-columns:1fr}.overview .ov-wide{grid-column:auto}}
.aud{display:grid;gap:5px;margin:4px 0}
.audrow{display:grid;grid-template-columns:78px 1fr 60px;align-items:center;gap:8px;font-size:12px;color:var(--ink2)}
.audrow i{display:block;height:8px;border-radius:4px}
.audrow b{text-align:right;font-weight:600;color:var(--ink)}
.measures{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.measure{background:var(--surface);border:1px solid var(--ring);border-radius:6px;padding:14px 16px;display:grid;gap:6px;align-content:start}
.measure .mk{font-size:12px;color:var(--ink2);font-weight:600}
.measure .mv{font-family:"Archivo",sans-serif;font-size:30px;font-weight:800;line-height:1}
.measure .mp{font-size:11.5px;color:var(--muted)}
.measure .chip{justify-self:start;font:600 11.5px "IBM Plex Mono",monospace;padding:2px 8px;border-radius:999px;background:var(--grid);color:var(--ink2)}
.measure .chip.up{background:var(--wash-good);color:var(--goodtext)}
.measure .chip.down{background:var(--wash-crit);color:var(--crit)}
.measure .bars{display:grid;gap:3px;margin-top:2px}
.measure .bar{display:grid;grid-template-columns:62px 1fr;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.measure .bar i{display:block;height:7px;border-radius:4px;background:var(--s1)}
.measure .bar.prev i{background:var(--axis)}
.measure .mn{font-size:12.5px;color:var(--ink2)}
.findings.two-col{columns:2 420px;column-gap:28px;display:block}
.findings.two-col li{break-inside:avoid;margin-bottom:12px}
.status-strip span{display:inline-flex;align-items:center;gap:6px}
.status-strip span::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--good)}
"""
html = str(soup)
loader = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scorecard_loader.js"), encoding="utf-8").read()
html = html.replace("</body>", "") if "</body>" in html else html
html += "\n<script>\n(function(){\n" + fn_part.strip() + "\n\n" + loader + "\nwindow.ATMChart = { el, css, hover, showTip, hideTip, bullet, hbar, vbar, vstack, line, stack100, fmtPct, fmtInt, fmtK };\n})();\n</script>\n<script src=\"js/archive.js?v=" + BUILD + "\"></script>\n<script src=\"js/daily_data.js?v=" + BUILD + "\"></script>\n<script src=\"js/daily_view.js?v=" + BUILD + "\"></script>\n<script src=\"js/glance.js?v=" + BUILD + "\"></script>\n<script src=\"js/carousel.js?v=" + BUILD + "\"></script>\n<script src=\"js/briefings.js?v=" + BUILD + "\"></script>\n"
html = html.replace("</style>", EXTRA_CSS + "</style>", 1)
html = html.replace("<title>ATM Audience Scorecard</title>", '<title>ATM Audience Dashboard</title><meta name="robots" content="noindex,nofollow">')
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)
print("page_text keys:", len(page_text), "tile groups:", tile_groups, "tables:", table_n, "charts styled:", len(style))
