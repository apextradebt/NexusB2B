"""Random supplier lots and price lists in many formats, built from the real catalog.

Run from nexusb2b/:
    python test-data/random/generate.py [seed]
    node test-data/random/gen-xlsx.mjs        # the two .xlsx files
"""
import codecs
import json
import os
import random
import sys

seed = int(sys.argv[1]) if len(sys.argv) > 1 else random.randint(1, 99999)
rnd = random.Random(seed)
here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, "..", "..", "src", "data")

laptops = [m for m in json.load(open(os.path.join(data, "laptops.json"), encoding="utf-8"))["models"] if m.get("cpu") and m.get("ram") and m.get("storage")]
phones = [p for p in json.load(open(os.path.join(data, "phones-extra.json"), encoding="utf-8"))["phones"] if p.get("storage")]

GRADES = "ABCDE"
GRADE_WORDS = {
    "A": ["Grade A", "A", "Class A", "Comme neuf", "Excellent"],
    "B": ["Grade B", "B", "Class B", "Très bon état", "Very good"],
    "C": ["Grade C", "C", "Class C", "Bon état", "Good"],
    "D": ["Grade D", "D", "Class D", "Correct", "Fair"],
    "E": ["Grade E", "E", "Pour pièces", "Broken"],
}
COEF = {"A": 1, "B": 0.85, "C": 0.7, "D": 0.5, "E": 0.3}


def laptop():
    m = rnd.choice(laptops)
    return {"cat": "laptop", "brand": m["brand"], "model": m["model"], "cpu": rnd.choice(m["cpu"]), "ram": rnd.choice(m["ram"]), "storage": rnd.choice(m["storage"])}


def phone():
    p = rnd.choice(phones)
    return {"cat": "phone", "brand": p["brand"], "model": p["model"], "storage": rnd.choice(p["storage"])}


def device():
    return laptop() if rnd.random() < 0.55 else phone()


def grade():
    return rnd.choices(GRADES, weights=[3, 5, 4, 2, 1])[0]


def gword(g):
    return rnd.choice(GRADE_WORDS[g])


def price(d, g):
    base = rnd.randint(350, 900) if d["cat"] == "laptop" else rnd.randint(150, 1100)
    return round(base * COEF[g] + rnd.choice([0, 0.9, 0.99, 0.5]), 2)


def euro_fr(v):
    return f"{v:,.2f}".replace(",", " ").replace(".", ",") + " €"


def euro_en(v):
    return f"€{v:,.2f}"


def serial():
    return "".join(rnd.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(rnd.choice([7, 8, 10])))


def imei():
    return "35" + "".join(str(rnd.randint(0, 9)) for _ in range(13))


def go(s):
    return s.replace("GB", " Go").replace("TB", " To")


def config(d):
    """A configuration written the way suppliers do."""
    if d["cat"] == "phone":
        return d["storage"]
    ram, sto = d["ram"][:-2], d["storage"][:-2]
    return rnd.choice([
        f'{d["cpu"]} {d["ram"]} {d["storage"]} SSD',
        f'{d["cpu"]}/{ram}/{sto if d["storage"].endswith("GB") else d["storage"]}',
        f'{d["cpu"]} {go(d["ram"])} {go(d["storage"])}',
        f'{d["cpu"]} {ram}G {sto}{"G" if d["storage"].endswith("GB") else "T"}',
    ])


def rows(n, maker):
    return [maker() for _ in range(n)]


def write(name, text, enc="utf-8"):
    with open(os.path.join(here, name), "w", encoding=enc, newline="") as f:
        f.write(text)
    print(f"  {name}")


print(f"seed {seed}")

# --- Supplier lots (to quote) --------------------------------------------------------------------

# 1. English CSV (comma), one device per row with serials: identical devices to group.
pool = rows(6, device)
lines = ["Serial Number,Manufacturer,Model,Processor,Memory,Storage,Cosmetic Grade"]
for _ in range(40):
    d = rnd.choice(pool)
    lines.append(",".join([serial(), d["brand"], d["model"], d.get("cpu", ""), d.get("ram", ""), d["storage"], gword(grade())]))
write("lot-01-serials-en.csv", "\n".join(lines) + "\n")

# 2. French CSV (semicolon), quantities, "Go", grades in words.
lines = ["Marque;Désignation;Configuration;État;Qté"]
for d in rows(15, device):
    lines.append(";".join([d["brand"], d["model"], go(config(d)), gword(grade()), str(rnd.randint(1, 60))]))
write("lot-02-fr-point-virgule.csv", "\n".join(lines) + "\n")

# 3. Pivot export: models × Class A–E counts, title row, blanks and totals.
lines = ["Count of Model for Supply,Column Labels,,,,,", "Row Labels,Class A,Class B,Class C,Class D,Class E,Grand Total"]
tot = [0] * 5
for d in rows(8, device):
    counts = [rnd.choice([0, 0, rnd.randint(1, 400)]) for _ in GRADES]
    tot = [a + b for a, b in zip(tot, counts)]
    label = f'{d["model"]} {d["storage"]}' if d["cat"] == "phone" else d["model"]
    lines.append(",".join([label] + [str(c) if c else "" for c in counts] + [str(sum(counts))]))
lines.append(",".join(["Grand Total"] + [str(t) for t in tot] + [str(sum(tot))]))
write("lot-03-tableau-croise.csv", "\n".join(lines) + "\n")

# 4. Free text (copied from an email or a PDF): quantity and grade inside the description.
lines = ["Bonjour, voici notre stock disponible :", ""]
for d in rows(12, device):
    q, g = rnd.randint(1, 30), grade()
    desc = f'{d["brand"]} {d["model"]} {config(d)}'
    lines.append(rnd.choice([f"{q}x {desc} Grade {g}", f"{desc} - grade {g} - qty {q}", f"{desc} Class {g} x {q}", f"{q} pcs {desc} grade {g}"]))
write("lot-04-texte-libre.txt", "\n".join(lines) + "\n")

# 5. Tab-separated, no header row, IMEIs (phones).
lines = ["\t".join([imei(), f'{d["brand"]} {d["model"]} {d["storage"]}', grade()]) for d in rows(20, phone)]
write("lot-05-imei-sans-entetes.tsv", "\n".join(lines) + "\n")

# 6. Pipe-separated, German headers.
lines = ["Hersteller|Modell|Prozessor|Arbeitsspeicher|Festplatte|Zustand|Menge"]
for d in rows(10, laptop):
    lines.append("|".join([d["brand"], d["model"], d["cpu"], d["ram"].replace("GB", " GB"), d["storage"].replace("GB", " GB SSD"), grade(), str(rnd.randint(1, 25))]))
write("lot-06-allemand-pipe.csv", "\n".join(lines) + "\n")

# 7. Windows-1252 French Excel export: SKU/EAN/colour noise columns, a section title per category.
lines = ["Réf. article;EAN;Libellé;Catégorie;État;Quantité dispo;Couleur"]
for cat, maker in (("ORDINATEURS PORTABLES", laptop), ("SMARTPHONES", phone)):
    lines.append(f"{cat};;;;;;")
    for d in rows(6, maker):
        lines.append(";".join([
            f"ART-{rnd.randint(10000, 99999)}", str(rnd.randint(10**12, 10**13 - 1)), f'{d["brand"]} {d["model"]} {config(d)}',
            "PC" if d["cat"] == "laptop" else "Téléphone", gword(grade()), str(rnd.randint(1, 50)), rnd.choice(["Noir", "Argent", "Gris", "Bleu"]),
        ]))
write("lot-07-excel-fr-cp1252.csv", "\r\n".join(lines) + "\r\n", enc="cp1252")

# 8. Excel "Unicode text" (UTF-16, tab-separated), Spanish headers.
lines = ["Marca\tModelo\tProcesador\tMemoria\tAlmacenamiento\tEstado\tCantidad"]
for d in rows(8, laptop):
    lines.append("\t".join([d["brand"], d["model"], d["cpu"], d["ram"], d["storage"], grade(), str(rnd.randint(1, 15))]))
with codecs.open(os.path.join(here, "lot-08-unicode-utf16.txt"), "w", encoding="utf-16") as f:
    f.write("\r\n".join(lines) + "\r\n")
print("  lot-08-unicode-utf16.txt")

# --- Price lists (Mes prix) ----------------------------------------------------------------------

# 9. French, one row per model + config + grade, "449,00 €".
lines = ["Marque;Modèle;Processeur;RAM;Stockage;Grade;Prix de vente TTC"]
for d in rows(10, device):
    for g in sorted(rnd.sample("ABC", rnd.randint(1, 3))):
        lines.append(";".join([d["brand"], d["model"], d.get("cpu", ""), d.get("ram", ""), d["storage"], g, euro_fr(price(d, g))]))
write("prix-09-grille-fr.csv", "\n".join(lines) + "\n")

# 10. English, one price column per grade, "€1,049.00", title rows, some empty cells.
lines = ["Retail price list", "", "Product,Capacity,Grade A,Grade B,Grade C"]
for d in rows(10, phone):
    cells = [f'"{euro_en(price(d, g))}"' if rnd.random() < 0.85 else "" for g in "ABC"]
    lines.append(",".join([f'{d["brand"]} {d["model"]}', d["storage"]] + cells))
write("prix-10-grades-en-colonnes.csv", "\n".join(lines) + "\n")

# 11. Free text (email), plus one USD line and one unknown model that must be rejected.
lines = ["Nos tarifs revendeurs :"]
for d in rows(8, device):
    g = grade()
    v = price(d, g)
    lines.append(rnd.choice([
        f'{d["model"]} {config(d)} grade {g} - {euro_fr(v)}',
        f'{d["brand"]} {d["model"]} {config(d)} Grade {g} : {round(v)} €',
        f'{d["model"]} {config(d)} Grade {g} {round(v)} EUR HT',
    ]))
lines += ["Samsung Galaxy S23 Ultra 256GB Grade A $899.00", "Nokia 3310 classic - 29 €"]
write("prix-11-texte-libre.txt", "\n".join(lines) + "\n")

# 12. No header row, plain amounts.
lines = []
for d in rows(10, device):
    g = grade()
    lines.append(f'{d["brand"]} {d["model"]} {config(d)};{g};{round(price(d, g))}')
write("prix-12-sans-entetes.csv", "\n".join(lines) + "\n")

# Data for gen-xlsx.mjs.
json.dump({
    "lot": [dict(d, grade=grade(), qty=rnd.randint(1, 40)) for d in rows(15, device)],
    "prices": [dict(d, grade=g, price=price(d, g)) for d in rows(10, device) for g in sorted(rnd.sample("ABCD", 2))],
}, open(os.path.join(here, "xlsx-data.json"), "w", encoding="utf-8"), ensure_ascii=False)
