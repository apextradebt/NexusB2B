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

### Price agents (price server)

```bash
npm run server   # price agents API on http://localhost:8787
npm run dev      # the app (calls VITE_PRICE_API_URL, default http://localhost:8787)
npm run probe -- phone Apple "iPhone 13" 128GB B
npm run probe -- laptop Dell "Latitude 5420" i5-1145G7 16GB 256GB B
```

`server/` runs every source in parallel for a quote line and returns one price per source and side (buyback = what the site pays, resale = what it sells for), after checking the listing is the same device (model, generation, CPU, capacity) and picking the requested grade or the nearest worse one.

Rules followed by every source: robots.txt respected (wildcards included), sites behind anti-bot protection are reported as "blocked" and never worked around, one request per second per site, responses cached 6 h, USD/GBP converted with ECB rates.

| Source | Countries | Buyback | Resale | Phones | Laptops |
|---|---|:-:|:-:|:-:|:-:|
| rebuy (product pages via sitemaps) | FR, DE, NL, ES, IT | ✓ | ✓ | ✓ | Apple only |
| refurbed (search) | FR, DE, AT, IT, NL, ES, BE | | ✓ | ✓ | ✓ |
| greenpanda | DE | | ✓ | ✓ | ✓ |
| Certideal | FR | | ✓ | ✓ | |
| ITJustGood | FR | | ✓ | | ✓ |
| SellBroke | US | ✓ | | | ✓ |
| Compare and Recycle (best of all UK buyers) | UK | ✓ | | ✓ | |

Checked and left out: Back Market, CeX, Swappie, ZOXS, Largo, Amazon, eBay, idealo, Decluttr, musicMagpie, Gadget Salvation, BuyBackWorld (anti-bot protection); SellYourMac, Boulanger / ecodair search (robots.txt); mySWOOOP, Easycash, ItsWorthMore, Fast Device, refurbed trade-in (price only after an interactive questionnaire); SellMyLaptops (same catalogue and prices as SellBroke).

The PhoneP2C backend phone scraper can be added as one more phone source by setting `VITE_API_URL`.

### Reference data

`src/data/laptops.json`: 37 business laptop models, options verified against manufacturer spec sheets (link per model).
`src/data/laptops-extra.json`: 209 more laptops (Dell, HP, Lenovo, Fujitsu, Apple, Microsoft). ThinkPads are checked against Lenovo PSREF; the others use their platform's standard CPU list and are marked "indicative".
`src/data/phones-extra.json`: storage options per phone, plus 135 phones without a reference price (priced by the agents only).
`src/data/phones.json`: copied from [PhoneP2C](https://github.com/apextradebt/PhoneP2C) `src/data/phones.json` — keep the two in sync when phone reference prices change.
