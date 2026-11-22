# Surgical Log Book

A personal, offline logbook for **Plastic, Reconstructive & Burns Surgery and Wound Care**. It covers invasive, minimally invasive and non-invasive procedures that you performed, assisted or supervised. It produces:

- **Dashboard:** totals, role split, activity over time (monthly/yearly with a cumulative curve), case mix by domain and role, approach and complexity, top procedures, a domain × year heat-map, 12-month domain trends, and Clavien–Dindo complication rates with 95% confidence intervals.
- **Privileging report:** counts per domain and procedure, split by role (P / PS / ST / SU / A / O), with the last date each procedure was done, for any period or facility. An optional appendix lists every case with patient name, NRIC and HRN for verification. Prints to PDF with a declaration and HOD sign-off block, or downloads as CSV.
- **CV / portfolio summary:** plain-text operative experience statement you can paste into a CV or appraisal.
- **Records:** search, sort, edit and delete. Export any filtered view to CSV.
- **Import / export:** full JSON backup, CSV/Excel export, and bulk CSV import from existing spreadsheets.

## Privacy first
This repository is public, so it contains **code only**. Your records stay in your own browser (IndexedDB) and are never uploaded anywhere. Entries can hold patient name, NRIC and HRN for verification by credentialing authorities, so backups and exports are confidential medical data. Read [docs/PRIVACY.md](docs/PRIVACY.md) before your first entry.

## How to use
**Option A: open locally.** Download the repository (Code → Download ZIP), unzip it, and open `index.html` in Chrome, Edge, Firefox or Safari. No installation or internet connection is needed.

**Option B: GitHub Pages.** In the repo, go to Settings → Pages → Deploy from branch → `main` / root. Open the resulting URL on your phone or PC. Records are still stored only in the browser of the device you use.

First steps:
1. Go to **Data & settings** and enter your name, MMC number and position. These appear on reports.
2. Optional: **Load demo data** to explore the dashboards, then **Remove demo entries**.
3. To migrate an existing logbook, copy your spreadsheet into the columns of [`templates/import-template.csv`](templates/import-template.csv) (delete the example rows) and import it. Each rejected row is listed with the reason.
4. Log new cases under **+ New entry**. **Save & add similar** keeps the date, facility, domain and role for a quick run of cases from the same list.
5. Export a **JSON backup** regularly, for example monthly.

## Data model
See [docs/DATA-DICTIONARY.md](docs/DATA-DICTIONARY.md) for the fields, role definitions, domains and how each statistic is calculated. To extend the procedure list, edit [`js/taxonomy.js`](js/taxonomy.js).

## Project structure
```
index.html            app shell
css/styles.css        styles (light/dark, print layout for the privileging report)
js/taxonomy.js        domains, procedures, roles, Clavien–Dindo, options
js/io.js              schema, validation, CSV/JSON import & export
js/analytics.js       filtering, series, cross-tabs, trends, Wilson CI, summaries
js/charts.js          dependency-free SVG charts
js/store.js           IndexedDB persistence (localStorage fallback)
js/demo.js            synthetic demo data generator
js/app.js             UI
tests/                node tests/analytics.test.js
templates/            CSV import template
```

## Development
No build step and no dependencies. Run the tests with `node tests/analytics.test.js`. GitHub Actions runs them on every push.

## Limitations (stated plainly)
- Data is per browser and per device. There is no automatic sync between devices, which is deliberate so that patient data never touches a server. Move data between devices with JSON export and import.
- Counts are self-reported. Credentialing committees may require verification against hospital OT registers.
- The complexity grading and procedure list are pragmatic defaults. They do not represent an official MOH, MMC or College classification. Match role and procedure definitions to your credentialing committee's requirements.
