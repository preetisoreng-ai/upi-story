# UPI Story

Use these folders as follows:

- `data/raw/`: Original NPCI downloads. Keep these files unchanged.
- `data/processed/`: Cleaned and combined data.
- `analysis/`: Analysis scripts.
- `outputs/`: Final charts and written findings.

All visualizations and UI artifacts in this project must follow the workspace guidance in `../data-viz-theme/README.md`.

## Rebuild the data

From this project directory, run:

```text
python analysis/build_upi_monthly.py
```

The standard-library script reads the raw XLSX files without modifying them, writes `data/processed/upi_monthly.csv`, and refreshes `outputs/data_quality_report.txt`.

## View the web app

Serve the parent `data-visualisation` directory with any static HTTP server, then open `/upi-story/`. No build step is needed.

Pages (switch between them from the top-bar dropdown):

- `index.html` — **Data story** (opens by default): scroll-revealed insights.
- `original.html` — Original story.
- `pressure-tested.html` — Pressure-tested story.
- `upistory-dashboard.html` — Dashboard.

The data story and dashboard also work when opened straight from disk, using `data/processed/upi_monthly_enriched.js` (written by `analysis/enrich_upi_monthly.mjs` next to the CSV).
