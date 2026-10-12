# Audience Scorecard: files the monthly run should save

For Rob. The ATM Unified Dashboard draws the Audience Scorecard sections from data files instead of typed-in HTML. The pilot uses the files from your Oct 7 handoff. To make it live, the monthly run should save the files below to SharePoint after each run. A scheduled task in Matt's account copies them to the dashboard.

The run no longer needs to edit or republish the scorecard HTML for the dashboard. It only writes these files.

## Where

One folder on SharePoint, shared with matt@atm.media, for example `ATM Monthly Audience Reports/dashboard_data/`. Overwrite the files each month, keeping these exact names and the same folder layout:

```
dashboard_data/
  page_text.csv
  stat_tiles.csv
  chart_index.csv
  written_analysis.csv
  charts/<chart_id>.csv      (one per chart, 41 today)
  tables/table_1.csv … table_4.csv
```

All files are UTF-8 CSV with a header row. Numbers can include thousands commas.

## The files

**`charts/<chart_id>.csv`**: the same per-chart files as in your handoff (`02_data/scorecard_charts/`), with the same names and columns. The column layout depends on the chart type:

| Chart type | Columns | Example |
|---|---|---|
| vbar | `category,value,note` | `s-li`, `c-li`, `c-gausers` |
| vstack, line | `series,category,value` | `s-yt`, `s-syn`, `c-issues` |
| hbar, stack100 | `label,value,source_note,note,flag` | `c-gachan`, `s-sect`, `c-acq` |
| bullet | `metric,series,value,unit,source_note` | `c-bullet-news` |

- Rows appear in the order they are written. Categories and series appear in order of first use.
- For bullet charts, the row whose series is `ATM` is the bar. Rows whose series starts with `Benchmark:` are the ticks.
- `note` on a vbar row shows in that bar's tooltip.
- In hbar files, `flag` = `benchmark/peer` greys out the bar if the label has no set colour.
- New months, rows and series appear on their own. Colours, scale limits and benchmark lines live in the dashboard's settings (`chart_style.json`) and stay as they are.

**`chart_index.csv`**: same as `_chart_index.csv` in your handoff. The page uses `card_title`, `card_subtitle_as_published` and `commentary_as_published` for each chart's heading, sub-line and "so what" line. It uses `source_platform_and_window` and `data_vintage` for the source line under each chart. Update the text and dates each run.

**`stat_tiles.csv`**: your `scorecard_stat_tiles.csv` with one added column, `group`. Columns: `section,group,data_vintage,value_as_published,label,detail`.
- `section` must match the section label exactly, for example `A · September at a glance`.
- `group` is the tile row inside the section (1, or 2 for the second row). Only `02 · Newsletter` uses 2 today (the Optin cohort row).
- Tiles show in file order.

**`written_analysis.csv`**: same as your handoff. Columns: `block,group,text_as_published`.
- Verdicts: block `Sep 19 baseline verdict`, group `Champion`, `Yellow flag` or `Red flag`, one row per bullet.
- Team flags: any block containing `flag for the team`, group = flag number. The first sentence shows in bold.

**`tables/table_1.csv` … `table_4.csv`**: your four tables, renamed by position on the page. The first row holds the headers.
- A row whose first cell is exactly `ATM` shows in bold.
- In table 4, the `Status` column is coloured by its words: "Blocked" shows red; "Removed", "Not …" and "dormant" show amber; anything else shows green.

**`page_text.csv`**: new. Columns `key,text`. This holds the text that isn't in the other files: the page header, each section's label, headline and intro, the legends, standalone notes and the footer. The pilot version is extracted from your Sep 29 page, so the keys and current wording are all in it. Update the text each run and keep the keys. Simple HTML (`<b>`, `<span>`) is allowed.

| Key pattern | What it is |
|---|---|
| `header.eyebrow`, `header.title`, `header.lede`, `header.meta` | Kept for the record. The dashboard's header now shows the combined analysis, which is written across all sources each month (see below). |
| `<section>.eyebrow`, `.headline`, `.lede` | Each section's label, headline and intro. Section keys are `A`–`E`, `01`–`08`, and `audit` for the baseline block |
| `<section>.legend<n>`, `.note<n>`, `.subhead<n>`, `.card<n>.title` | Legends, notes under tables, sub-headings, titles of cards without a chart |
| `footer.1`, `footer.2` | Footer lines |

## Wording

Name sources by platform and date, not by person or by dashboard. Write "read from LinkedIn admin (Sep 29)", not "read in Rob's Chrome". The page is one dashboard and should read as one.

## The combined analysis

The header and "The read" section at the top of the page come from `data/analysis.csv`. That file is not part of the monthly run's output. It is rewritten each month after the run's files arrive, reading the run's figures together with the daily figures, so its findings and recommendations cover every source on the page.

## What still needs a dashboard change

Moving charts, tiles or sections around on the page, adding a new chart or section, or changing a chart's colours or scale. Send Matt the new chart ID and type, and its data file can follow the same rules.

## If a file is missing or malformed

The affected chart or table shows "data unavailable" with the file name, and the rest of the page loads normally. Nothing shows wrong numbers silently.
