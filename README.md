# ATM Unified Dashboard

Live at https://atm.mattbecher.com (also https://tohomito.github.io/atm-dashboard/), embedded in the Notion "Unified Dashboard" page. Team use only; search engines are blocked.

The root page has two tabs, each loading its own page in a frame:

| Tab | Folder | Data | Refresh |
|---|---|---|---|
| Daily social | `daily/` | Reads the ATM Daily Social Pulse Google Sheet live every time the page opens | Whenever Hannah's daily run writes to the sheet |
| Monthly audience scorecard | `scorecard/` | Reads the files in `scorecard/data/` | When new files from Rob's monthly run are copied in |

## daily/

- `index.html`: layout, from Hannah's dashboard design
- `live.js`: reads the Daily Pulse, Creative and Flat Feed tabs and computes every number
- `archive.js`: fixed history the sheet doesn't hold (posts through Oct 5, 2026; LinkedIn monthly totals May to Sep 2026)

The sheet must stay shared as "Anyone with the link can view" (or edit). If the sheet's column layout changes, `live.js` needs a matching update.

## scorecard/

- `index.html`: Rob's Audience Scorecard design and chart code. Every number and text block is filled from `data/`.
- `data/`: the monthly files. The pilot uses Rob's Oct 7, 2026 handoff export (Sep 29 run, plus the Sep 19 baseline).
- `data/chart_style.json`: how each chart is drawn (type, colours, scale, benchmark lines). This belongs to the dashboard, not to the monthly run.
- `DATA_SPEC.md`: the exact files Rob's run must save to SharePoint for the scorecard to update.

To refresh by hand, replace the files in `scorecard/data/` with a new set that follows `DATA_SPEC.md` and commit.
