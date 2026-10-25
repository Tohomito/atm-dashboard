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

## LinkedIn, Instagram and YouTube (daily)

`data/sm/` holds the platform figures read through Supermetrics (LinkedIn Pages account 105562357, Instagram Insights 17841471383675991, YouTube channel UCWvL_mFJEBQBEtnT5INEgIQ). A scheduled task adds the newest days every morning with `tools/sm_upsert.py`, which merges new rows by key and never drops old ones.

| File | Key | Columns |
|---|---|---|
| `li_daily.csv` | date | impressions, clicks, likes, comments, shares, page_views, new_followers (organic) |
| `li_posts.csv` | post_id | post date, media, lifetime impressions, clicks, likes, comments, shares, first 160 characters of the text |
| `ig_posts.csv` | media_id | post date, type, url, views, reach, likes, comments, shares, saves, interactions, first 160 characters of the caption |
| `ig_28d.csv` | end_date | reach and views for the 28 days ending that date |
| `yt_daily.csv` | date | views, minutes watched, subscribers gained and lost |
| `yt_monthly.csv` | month | the same by month, with the last day covered for the current month |
| `totals.csv` | date | LinkedIn followers, Instagram followers, YouTube subscribers |

Where these overlap the daily sheet they win. The sheet still supplies the LinkedIn peer set and the hand-tagged person, company and series on each post; posts without a tag get the guest's name and company from the post text. Posts before Oct 6, 2026 stay in `js/archive.js`.

## Briefings (weekly)

The Briefings view has two tabs. `data/briefings.csv` holds the written parts of the editorial briefing, rewritten every Monday by a scheduled task:

- `meta`: the week's label and what the briefing covers.
- `pattern` (three) and `experiment` (two): this week's editorial decisions for Hannah. `posts` lists supporting posts as `li:<post_id>` or `ig:<media_id>` from `data/sm/`; the page fills in their numbers. `tags` names the dimensions (Topic, Format, Guest participation, Distribution). Experiments carry an `owner` and a `next_step` saying how to measure them.

`data/tests.csv` is the record of past tests and standing practices shown under the editorial briefing: `id`, `name`, `started`, `area` (Topic, Format, Guest participation, Distribution, separated by ;), `verdict` (Running, Keep doing, No clear effect, Not decided, Not measured, Stopped), `evidence` (numbers that support the verdict), `adherence` (whether the team still does it), `next_step` and `source`. The weekly task adds each new experiment as Running and gives it a verdict once the data is in.

Client and partner proof is worked out on the page from the posts. `data/companies.csv` maps each company named in a post to a parent partner and an industry; add a row when a new company appears, or edit one to regroup. Series come from post tags where set, otherwise from series names in the post text.
