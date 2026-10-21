# ATM Audience Dashboard

Live at https://atm.mattbecher.com (also https://tohomito.github.io/atm-dashboard/). Team use only; search engines are blocked.

One page, in the Audience Scorecard's design, built from two data sources:

Page order (Data & insights view): Overview, September baseline summary, At a glance, the 7/14/30-day section, B–E, F (posts), baseline detail 01–06. The Actions view holds "What the numbers say", the actions, and 08 (data sources and fixes).

| Sections | Data | Refresh |
|---|---|---|
| The 7/14/30-day section, the Overview scorecards, YouTube watch hours in B, F (posts) | The ATM Daily Social Pulse Google Sheet, read live each time the page opens, plus `js/archive.js` | Whenever the daily run writes to the sheet |
| Headline numbers (in At a glance), B–E, the September baseline (summary and 01–08), footer | The files in `data/scorecard/` | When new monthly files are copied in |
| Header, "What the numbers say" and the Actions view | `data/analysis.csv`, written across every source with the optimization log as context | Rewritten each month after the monthly files arrive |
| "At a glance" and the key measures | Computed in the page from both sources | Every time the page opens |

The header shows the date of each source.

## Files

- `index.html`: the page. Layout and chart code come from Rob's scorecard. Every scorecard number and text block is filled from `data/scorecard/`.
- `data/scorecard/`: the monthly files (pilot: Rob's Oct 7, 2026 handoff export). `chart_style.json` holds how each chart is drawn and belongs to the dashboard, not the monthly run.
- `js/daily_data.js`: reads the Daily Pulse, Creative and Flat Feed tabs and builds the daily series.
- `js/daily_view.js`: draws the daily sections with the scorecard's chart code.
- `js/glance.js`: the toolbar (Data & insights / Actions switch, Refresh, the "Ask Claude" box), the "At a glance" insights for 7 days / 14 days / 30 days / All, and the key-measures panel.
- `js/archive.js`: history the sheet doesn't hold (posts through Oct 5, 2026; LinkedIn monthly totals May to Sep 2026).
- `data/execs.csv`: executive titles for section D, read from the ATM Kitchen board item names and post copy. Add a row when a new title is known; the section follows the posts on its own.
- `js/carousel.js`: the chart carousels in sections 02 to 05. They page only with the arrow buttons or arrow keys.
- `tools/build_unified.py` and `tools/scorecard_loader.js`: rebuild `index.html` from the scorecard's published page (layout, section order, wording fixes). Run `python3 -I tools/build_unified.py <handoff folder> .`; the build reads `scorecard_loader.js` from its own folder.
- `docs/DATA_SPEC.md`: the files Rob's monthly run must save to SharePoint.
- `tools/build_ask.py`: builds every figure the dashboard cites (analysis, monthly tiles, all chart data, tables, post history) into two private Google Docs in the "ATM Dashboard: Claude data" Drive folder. The "Ask Claude" box links to those Docs, and Claude opens them through the asker's own Google Drive connector, so the full data never sits on the public site. Steps are in the script's header.

## Rules that keep it working

- The Google Sheet must stay shared as "Anyone with the link can view" (or edit). If its column layout changes, `js/daily_data.js` needs a matching update.
- Monthly files must follow `docs/DATA_SPEC.md`. To refresh by hand, replace the files in `data/scorecard/` and commit.
- After any change to `data/` or `js/archive.js`, refresh the two Google Docs (steps in `tools/build_ask.py`), so the ask box reads current figures.
- Keep the Actions view to real, open actions. When a setup task, tracking fix or priority is done, delete its row from `data/analysis.csv` in the same change (and at each monthly rewrite, drop anything finished). Principles and reading notes do not go in the Actions view; notes stay in `analysis.csv` as `note` rows for the Ask Claude data only.
- Date-stamp team flags: they come from the monthly analysis and show the date of the analysis they came from.
- People who use the ask box need Google Drive connected in Claude and access to the Drive folder.
- Use the dashboard from its direct address, https://atm.mattbecher.com. The Notion embed is retired.

## GA4 (weekly)

`data/ga4/` holds the site figures from GA4 (property 489265998, read through Supermetrics): new vs returning users by month (`new_returning.csv`), sessions by channel for the last 30 days (`channels_30d.csv`, grouped from `sources_raw_30d.csv`), top landing pages and event counts, plus `meta.json` with the pull date and window. A scheduled task rewrites these files every Monday morning; the page reads them when it opens. They feed the Overview's new-vs-returning card and the Site tab in At a glance.
