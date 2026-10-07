# ATM Social Dashboard

Live at https://tohomito.github.io/atm-dashboard/ and embedded in the Notion "Unified Dashboard" page.

The page reads the **ATM Daily Social Pulse** Google Sheet every time it opens, so it stays current with no uploads.
Whatever Hannah's daily run writes to the sheet shows up on the next page load.

- `index.html` - layout (from Hannah's dashboard design)
- `live.js` - reads the Daily Pulse, Creative and Flat Feed tabs and computes every number
- `archive.js` - fixed history the sheet doesn't hold: posts through Oct 5, 2026, and LinkedIn monthly totals May to Sep 2026

The sheet must stay shared as "Anyone with the link can view" (or edit) for the page to read it.
If the sheet's column layout changes, `live.js` needs a matching update.
