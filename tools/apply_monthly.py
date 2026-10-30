#!/usr/bin/env python3
"""Layer the latest monthly report (data/monthly/) over data/scorecard/.

Run from the repo root after changing anything in data/monthly/:  python3 tools/apply_monthly.py
build_unified.py also calls it. Safe to run more than once."""
import csv, json, os, shutil, sys

def apply(OUT="."):
    MON = os.path.join(OUT, "data", "monthly")
    SC = os.path.join(OUT, "data", "scorecard")
    if not os.path.isdir(MON):
        return
    def _rd(p): return list(csv.DictReader(open(p, encoding="utf-8")))
    def _wr(p, fields, rows):
        with open(p, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)
    mp = os.path.join(MON, "page_text.csv")
    if os.path.exists(mp):
        over = {r["key"]: r["text"] for r in _rd(mp)}
        base = _rd(os.path.join(SC, "page_text.csv"))
        for r in base:
            if r["key"] in over: r["text"] = over.pop(r["key"])
        base += [{"key": k, "text": v} for k, v in over.items()]
        _wr(os.path.join(SC, "page_text.csv"), ["key", "text"], base)
    mp = os.path.join(MON, "stat_tiles.csv")
    if os.path.exists(mp):
        new = _rd(mp); secs = {r["section"] for r in new}
        base = [r for r in _rd(os.path.join(SC, "stat_tiles.csv")) if r["section"] not in secs]
        _wr(os.path.join(SC, "stat_tiles.csv"), ["section", "group", "data_vintage", "value_as_published", "label", "detail"], new + base)
    mp = os.path.join(MON, "flags.csv")
    if os.path.exists(mp):
        base = [r for r in _rd(os.path.join(SC, "written_analysis.csv")) if "flag for the team" not in r["block"].lower()]
        _wr(os.path.join(SC, "written_analysis.csv"), ["block", "group", "text_as_published"], base + _rd(mp))
    mp = os.path.join(MON, "chart_index.json")
    if os.path.exists(mp):
        over = json.load(open(mp, encoding="utf-8"))
        base = _rd(os.path.join(SC, "chart_index.csv")); fields = list(base[0].keys())
        for r in base: r.update({k: v for k, v in over.get(r["chart_id"], {}).items() if k in fields})
        _wr(os.path.join(SC, "chart_index.csv"), fields, base)
    mp = os.path.join(MON, "chart_style.json")
    if os.path.exists(mp):
        st = json.load(open(os.path.join(SC, "chart_style.json"), encoding="utf-8"))
        for k, v in json.load(open(mp, encoding="utf-8")).items(): st.setdefault(k, {}).setdefault("opts", {}).update(v)
        json.dump(st, open(os.path.join(SC, "chart_style.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for sub in ("charts", "tables"):
        d = os.path.join(MON, sub)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.endswith(".csv"): shutil.copy(os.path.join(d, f), os.path.join(SC, sub, f))



if __name__ == "__main__":
    apply(sys.argv[1] if len(sys.argv) > 1 else ".")
    print("monthly layer applied")
