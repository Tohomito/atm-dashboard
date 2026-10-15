# ATM Audience Dashboard

Live at https://atm.mattbecher.com (also https://tohomito.github.io/atm-dashboard/), embedded in the Notion "Unified Dashboard" page. Team use only; search engines are blocked.

One page, in the Audience Scorecard's design, built from two data sources:

| Sections | Data | Refresh |
|---|---|---|
| Now (daily social), the benchmark row in A, YouTube watch hours in B, F (every post) | The ATM Daily Social Pulse Google Sheet, read live each time the page opens, plus `js/archive.js` | Whenever Hannah's daily run writes to the sheet |
| A–E, Sep 19 baseline (01–08), footer | The files in `data/scorecard/` | When new files from Rob's monthly run are copied in |
| Header, "The read" (findings) and the Actions view (priorities, tagging steps) | `data/analysis.csv`, written across every source with the optimization log as context | Rewritten each month after the monthly files arrive |
| "At a glance" and the key measures | Computed in the page from both sources | Every time the page opens |

The header shows the date of each source.

## Files

- `index.html`: the page. Layout and chart code come from Rob's scorecard. Every scorecard number and text block is filled from `data/scorecard/`.
- `data/scorecard/`: the monthly files (pilot: Rob's Oct 7, 2026 handoff export). `chart_style.json` holds how each chart is drawn and belongs to the dashboard, not the monthly run.
- `js/daily_data.js`: reads the Daily Pulse, Creative and Flat Feed tabs and builds the daily series.
- `js/daily_view.js`: draws the daily sections with the scorecard's chart code.
- `js/glance.js`: the toolbar (Data & insights / Actions switch, Refresh, the "Ask Claude" box), the "At a glance" insights for 7 days / 14 days / 30 days / All, and the key-measures panel.
- `js/archive.js`: history the sheet doesn't hold (posts through Oct 5, 2026; LinkedIn monthly totals May to Sep 2026).
- `docs/DATA_SPEC.md`: the files Rob's monthly run must save to SharePoint.

## Rules that keep it working

- The Google Sheet must stay shared as "Anyone with the link can view" (or edit). If its column layout changes, `js/daily_data.js` needs a matching update.
- Monthly files must follow `docs/DATA_SPEC.md`. To refresh by hand, replace the files in `data/scorecard/` and commit.
