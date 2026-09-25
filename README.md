## Nexus B2B — quoting tool

B2B quoting for laptops and phones. Same stack and design system as the B2C app (Vite, React 19, Tailwind 4, Auth0, i18next, soft-UI cards), with the MP131 palette. No stock or order management: import a list, recognise the devices, get a buy price and a resale price, export the quote.

### Run

```bash
npm install
npm run dev      # http://localhost:5174
npm test         # matcher, parser, grouping and pricing tests
```

Uses the same `.env` variables as the PhoneP2C (B2C) app (`VITE_API_URL`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_IDENTIFIER`). Without `VITE_AUTH0_DOMAIN` the app runs in local mode, without login.

### Flow

1. **Import** — `.xlsx` or `.csv`, or rows pasted from Excel. Title rows are skipped; pivot tables (models × `Class A…E` count columns) are detected and expanded.
2. **Columns** — auto-mapped (FR/EN headers), editable.
3. **Matching** — each line is matched to the reference (`src/data/laptops.json` + `src/data/phones.json`), CPU/RAM/storage are resolved against the factory options, identical devices are grouped and sorted. Uncertain lines are flagged *À vérifier* with the reason.
4. **Prices** — the agents run per grouped line, with a limited number running at once. Buy price = resale × (1 − target margin) − refurbishment cost (Settings). Every price can be overridden by hand. Export to Excel/CSV, or save the quote in the browser.

### Price agents and backend contract

| Agent | Endpoint | Status |
|---|---|---|
| Marché téléphones | `POST /api/market/prices` | Existing endpoint used by the B2C flow |
| Marché PC portables | `POST /api/market/laptop-prices` | **To build in the backend** |
| Estimation catalogue | — | Fallback for phones: B2C reference price × grade coefficient, shown as an estimate |

`POST /api/market/laptop-prices`

```json
// request
{ "brand": "Dell", "model": "Latitude 5420", "cpu": "i5-1145G7", "ram": "16GB", "storage": "256GB", "grade": "B" }

// response — "offres" follows the existing phone endpoint
{
  "buyback": { "offres": [{ "source": "mySWOOOP", "prix": 180, "url": "https://…" }] },
  "resale":  { "offres": [{ "source": "Back Market", "prix": 420, "url": "https://…" }] }
}
```

Until this endpoint exists the laptop agent reports "indisponible" and laptop lines stay unpriced (manual price entry still works).

### Reference data

`src/data/laptops.json`: 37 business laptop models, options verified against manufacturer spec sheets (link per model).
`src/data/phones.json`: copied from [PhoneP2C](https://github.com/apextradebt/PhoneP2C) `src/data/phones.json` — keep the two in sync when phone reference prices change.
