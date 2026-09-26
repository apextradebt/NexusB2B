# Test data

Dummy customer files used by `src/lib/priceList.test.ts` (and handy for trying the app by hand).

| File | What it exercises |
|---|---|
| `prix-simple.csv` | French headers, one row per model + configuration + grade, `449,00 €` prices |
| `price-list-en.csv` | English headers, `€1,049.00` thousands, one USD row (flagged), one unknown model (Nokia 3310) |
| `grille-grades.csv` | Title rows, one price column per grade (`Prix A`, `Prix B`…), empty cells |
| `liste-libre.txt` | Free text: model, config, grade and price on one line (`… Grade A : 1 189 €`, `8/256 … 289 EUR HT`) |
| `sans-entetes.csv` | No header row, plain amounts |
| `prix-excel-cp1252.csv` | Windows-1252 export from French Excel, grades in words (`Très bon état`) |
| `prix-revendeur.xlsx` | Excel file with a title row, AMD configs, decimal prices |
| `devis-fournisseur.csv` | A supplier lot to quote against the price lists above (end-to-end test) |

Import the price lists on **Mes prix**, then import `devis-fournisseur.csv` as a new quote: lines covered by
the lists are priced from your selling price (tag "Votre prix"), the others from the market.
