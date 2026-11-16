# Demand Forecasting — static demo

A standalone HTML/CSS/JS build of the Forcesight **Inventory → Demand Forecasting**
module. The sidebar, header and module screens are forked from the React app
(`fs-frontend`); everything behind them — the catalogue, the sales history and
the forecast itself — is computed in the browser from dummy data.

No backend, no build step, no dependencies. Open `index.html` and it runs.

## What actually works

This is not a click-through mockup. The whole process runs:

| Screen | What it does |
| --- | --- |
| **Campaigns** | Sort, page, open, delete. Seeded with four campaigns on first load. |
| **Wizard — Setup** | Name, forecast period, look-back window, base statistic, target selection. |
| **Target picker** | Filters are the selection. Apply runs them against the catalogue and previews the matched SKUs with their real look-back quantities. |
| **Weighted average modelling** | Buckets derived from the look-back itself. Weights are editable, the cells do arithmetic (`11+2` → `13`), and the total has to reach 100%. |
| **Wizard — Reference Data** | Optional target → source SKU mapping, so a new launch can follow the product it replaces. |
| **Wizard — Adjustments** | Ad spend, ticked events, pricing, and custom levers — each one scopeable to a date range and a subset of items. |
| **Generate** | Runs the engine behind a staged progress bar and lands on the result screen. |
| **Result** | Scenario tabs, headline tiles, the per-SKU/per-period table, CSV export, full-screen view, approve. |
| **Edit Constrains** | Re-opens every wizard input against the open scenario. Apply re-runs it; *Generate As New Scenario* forks it and runs the fork. |
| **Constraints** | Capital budget, target DIO and lead time, with an impact preview that re-runs the engine on every slider move. |
| **How this was computed** | The pipeline's own log — what each stage did and to how many rows. |
| **Helix AI** | The right-hand assistant. Opens from the header, collapses the nav to icons, and answers from the campaign on screen. |
| **Restock** | Turns approved forecasts into a purchase order — see below. |
| **B2B PO View** | Every purchase-order line raised against the catalogue, filtered by channel. |
| **Slow Moving Inventory** | Stock whose days-on-hand exceed the ideal, priced at an adjustable cost of capital. |
| **Inventory View** | Stock on hand, in transit and in production per SKU × warehouse, with a combo roll-up. |

Demo data lives in memory for the session: **a reload puts the seeded set back.**
It used to persist, which meant a demo picked up whatever the last person left
behind. Only UI preferences (nav collapsed, Helix open) are stored.

## Restock

The second module, under **Plan Inventory → Restock Plan**. A plan points at one
or more demand-forecasting campaigns and reads the rows those runs already
produced — nothing is forecast twice. It only decides what to buy, from whom,
and what to move between warehouses:

```
Required  = forecast qty + DOI cover − stock on hand
To buy    = Required, rounded up to the MOQ
Transfers = a warehouse holding more than it needs ships to one that is short
```

- **Plan list** — PO name, vendor, status, the forecasts it covers, order value.
- **Wizard** — name and vendor, pick the forecasts (several are summed into one
  order, deduped by SKU), then set target DOI and any MOQ / lead-time overrides.
- **Plan detail** — five tiles, the lead-time insight, and three tables:
  Manufacturer/Supplier view, per-warehouse Restock view, and the Transfer
  table. Each is searchable and exports to CSV, and the whole plan exports too.

## Helix AI

The assistant panel is not a scripted reel — every figure it quotes is read off
the campaign that is open.

- **Try Strategy** runs the engine three more times at different risk stances
  (Conservative 90% of forecast with no buffer, Balanced 100% with 7 days of
  cover, Aggressive 115% with 21 days) and reports the cash, DIO and revenue
  delta of each against the plan on screen. **Apply** forks a scenario at that
  stance and runs it, so the tab that appears matches the card you clicked.
- **Ask What If?** re-runs the plan with one input changed — more ad spend, a
  price cut, no events, a shorter look-back, model-chosen weights — and reports
  the delta. Nothing is saved; it is a comparison run.
- **The composer** takes free text and matches it on keywords: cash, DIO, risk,
  top SKUs, events, assumptions, summary. The answer is computed each time.
- **Assumptions** lists every input the engine was handed, in the order it used
  them. **Your Actions** logs what you did through the panel.
- **Co-Pilot / Manual** — Manual mutes the assistant entirely.

Opening the panel collapses the left nav to icons so nav, work and assistant fit
side by side. Below 1100px the panel floats over the page with a backdrop
instead of squeezing it.

## The forecast pipeline

`js/engine.js`, in order:

1. Resolve the target set from the campaign's filters.
2. Read each target's reference series over the look-back window.
3. Bucket the look-back into weeks (or days).
4. Take AVG / MIN / MAX of each bucket — whichever base was chosen.
5. Apply the weighted-average model → one baseline daily rate per SKU.
   *Using AI* ramps the weights toward the most recent buckets.
6. Divide out the uplift of any ticked **past** event, so a Diwali spike in the
   history is not read as the new normal.
7. Measure trend across the look-back halves and damp it.
8. Project each forecast day: `baseline × trend-ramp × weekday × adjustments`.
   Adjustments compose multiplicatively, and each one only applies on the days
   and to the items its scope covers.
9. Roll the days into months (or weeks) and price them.
10. Size the restock (`demand + lead-time cover − stock on hand`), then apply the
    capital budget and report what it cost.

## The dummy data

`js/data/catalog.js` holds 30 seed products expanded into ~116 marketplace SKUs
across 8 channels and 8 categories. Each SKU gets **560 days of daily sales**,
built from a seeded PRNG so the history is identical on every reload — two
scenarios run against the same inputs are genuinely comparable.

Each daily figure is the product of five independent shapes: a base rate, a
growth trend, a monthly seasonal profile, a weekday curve, and the uplift of
whichever retail events cover that day (Big Billion Days, Diwali, Prime Day,
Black Friday and nine more, materialised for every year in range).

That layering is the point — a plain average of the look-back would miss the
trend, and ignoring the event factor would read a festive spike as the baseline.

## Layout

```
index.html              entry point; loads the scripts in dependency order
css/app.css             tokens, shell, sidebar, header, shared controls
css/demand-forecasting.css   the module's own screens
css/helix.css           the Helix AI panel, and its three responsive layouts
assets/                 the ForceSight logo and icon, copied from the frontend
js/core.js              namespace, date helpers, formatting, seeded PRNG
js/data/catalog.js      catalogue, sales history, events, purchase orders
js/engine.js            the forecast pipeline
js/store.js             campaigns, scenarios, localStorage, seed data
js/ui.js                DOM builder, modals, toasts, dropdowns, pagers
js/shell.js             sidebar + page header
js/helix.js             the Helix AI assistant panel
js/adjustments.js       the adjustment row types
js/modals.js            target picker, reference mapping, weights, PO, scope
js/view-campaigns.js    the list
js/view-wizard.js       the three-step wizard
js/view-forecast.js     the result screen
js/restock.js           the restock arithmetic (required, MOQ, transfers)
js/view-restock.js      the restock list, wizard and plan detail
js/view-inventory.js    B2B PO View, Slow Moving Inventory, Inventory View
js/app.js               hash router
```

Plain `<script>` tags, not ES modules — the folder has to work opened straight
off disk as well as served over HTTP, and `file://` refuses module imports.

## Running it

Open `index.html`. That is the whole instruction.

For a local server (useful if you want to test it exactly as it will be hosted):

```sh
python3 -m http.server 8777
# http://localhost:8777/
```

## Hosting on GitHub Pages

Every path in the project is relative and routing uses the URL hash, so it works
from a repository sub-path with no configuration and no server rewrites.

1. Push this folder to a repository.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick your branch and `/` (root) — or `/docs` if you put the folder there.

`.nojekyll` is included so Jekyll does not strip anything on the way out.
