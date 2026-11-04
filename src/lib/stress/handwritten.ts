import type { Grade } from "@/types";
import type { StressList, Truth } from "@/lib/stress/types";

// Lists written by hand the way people send them: emails, chat messages, trader shorthand, copied PDFs.
// Names and numbers are made up.

const m = (model: string, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, storage, grade, qty });
const pc = (model: string, cpu: string | undefined, ram: string | undefined, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, cpu, ram, storage, grade, qty });
const no = (qty = 1): Truth => ({ qty });

const lists: [family: string, name: string, text: string, truth: Truth[]][] = [
  ["Emails", "French email with greeting and signature", `Bonjour Tom,

Voici ce qu'on a en stock cette semaine :

- 12 x iPhone 13 128Go noir grade A
- 8 x iPhone 12 64Go blanc grade B
- 25 x Samsung S21 128Go grade B
- 3 x Pixel 7 128Go grade C

Prix sur demande, dispo sous 48h.

Cordialement,
Marc Durand
Tel : 06 12 34 56 78`, [m("iPhone 13", "128GB", "A", 12), m("iPhone 12", "64GB", "B", 8), m("Galaxy S21", "128GB", "B", 25), m("Pixel 7", "128GB", "C", 3)]],

  ["Emails", "English offer with terms", `Hi team,

Please find below our offer for this week, all units tested and wiped:

40 pcs iPhone 11 64GB Grade B
15 pcs iPhone 12 Pro 128GB Grade A
22 pcs Galaxy S22 128GB Grade B
10 pcs Galaxy A53 128GB Grade C

Payment: bank transfer before shipping.
Delivery: 3-5 working days.

Best regards,
Sarah`, [m("iPhone 11", "64GB", "B", 40), m("iPhone 12 Pro", "128GB", "A", 15), m("Galaxy S22", "128GB", "B", 22), m("Galaxy A53", "128GB", "C", 10)]],

  ["Emails", "German offer", `Guten Tag,

anbei unser aktuelles Angebot:

14 Stück Dell Latitude 5490 i5-8350U 8GB 256GB SSD Zustand B
6 Stück HP EliteBook 840 G5 i5-8250U 16GB 512GB SSD Zustand A
20 Stück Lenovo ThinkPad T480 i5-8350U 8GB 256GB SSD Zustand C

Mit freundlichen Grüßen
Klaus Weber`, [pc("Latitude 5490", "i5-8350U", "8GB", "256GB", "B", 14), pc("EliteBook 840 G5", "i5-8250U", "16GB", "512GB", "A", 6), pc("ThinkPad T480", "i5-8350U", "8GB", "256GB", "C", 20)]],

  ["Emails", "Spanish lot", `Hola,

Tenemos disponible este lote:

40 unidades iPhone XR 64GB grado B
25 unidades iPhone 12 128GB grado A
12 unidades Galaxy S20 128GB grado C

Un saludo`, [m("iPhone XR", "64GB", "B", 40), m("iPhone 12", "128GB", "A", 25), m("Galaxy S20", "128GB", "C", 12)]],

  ["Emails", "Italian lot", `Buongiorno,
disponibilità di questa settimana:
20 pz iPhone 11 64GB grado A
15 pz iPhone SE 2020 64GB grado B
8 pz Galaxy S21 Ultra 256GB grado B
Cordiali saluti`, [m("iPhone 11", "64GB", "A", 20), m("iPhone SE (2020)", "64GB", "B", 15), m("Galaxy S21 Ultra", "256GB", "B", 8)]],

  ["Emails", "Dutch lot", `Goedemiddag,

15 stuks Galaxy A52 128GB klasse B
30 stuks iPhone 13 128GB klasse A
5 stuks iPad 9th Gen 64GB klasse B

Met vriendelijke groet`, [m("Galaxy A52", "128GB", "B", 15), m("iPhone 13", "128GB", "A", 30), m("iPad 10.2 (2021)", "64GB", "B", 5)]],

  ["Emails", "forwarded email with headers", `---------- Forwarded message ---------
From: Stock Team <stock@example.com>
Date: Mon, 2 Nov 2026 at 09:14
Subject: Stock list week 45
To: Sales <sales@example.com>

10x iPhone 14 128GB A
10x iPhone 14 Pro 256GB A
5x iPhone 15 128GB B

Thanks`, [m("iPhone 14", "128GB", "A", 10), m("iPhone 14 Pro", "256GB", "A", 10), m("iPhone 15", "128GB", "B", 5)]],

  ["Chat messages", "WhatsApp export with timestamps", `[14:02, 03/11/2026] Karim: 20 iphone 11 64 gb grade b
[14:02, 03/11/2026] Karim: 15 iphone 12 128 gb grade a
[14:03, 03/11/2026] Karim: 7 samsung s22 ultra 256 gb grade b`, [m("iPhone 11", "64GB", "B", 20), m("iPhone 12", "128GB", "A", 15), m("Galaxy S22 Ultra", "256GB", "B", 7)]],

  ["Chat messages", "chat in lower case, no units", `salut voila ce que jai
iphone 12 128 grade a 10
iphone 13 pro 256 grade b 4
s21 ultra 256 grade b 6
tu me dis`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13 Pro", "256GB", "B", 4), m("Galaxy S21 Ultra", "256GB", "B", 6)]],

  ["Chat messages", "chat with emojis", `🔥 STOCK DU JOUR 🔥
📱 iPhone 14 Pro 128GB grade A x12
📱 iPhone 13 128GB grade B x30
💻 MacBook Air M1 8GB 256GB grade A x5
✅ Dispo immédiate`, [m("iPhone 14 Pro", "128GB", "A", 12), m("iPhone 13", "128GB", "B", 30), pc("MacBook Air M1 2020", undefined, "8GB", "256GB", "A", 5)]],

  ["Trader shorthand", "iP codes with P and PM", `IP13 128 A 10PCS
IP13P 256 B 5PCS
IP13PM 256 A 8PCS
IP12 64 B 20PCS
IP14PM 512 A 3PCS`, [m("iPhone 13", "128GB", "A", 10), m("iPhone 13 Pro", "256GB", "B", 5), m("iPhone 13 Pro Max", "256GB", "A", 8), m("iPhone 12", "64GB", "B", 20), m("iPhone 14 Pro Max", "512GB", "A", 3)]],

  ["Trader shorthand", "model numbers alone", `14 Pro Max 256GB A x30
13 Mini 128GB B x12
12 Pro 128GB A x7
XS Max 64GB B x5
11 Pro 256GB C x4`, [m("iPhone 14 Pro Max", "256GB", "A", 30), m("iPhone 13 Mini", "128GB", "B", 12), m("iPhone 12 Pro", "128GB", "A", 7), m("iPhone XS Max", "64GB", "B", 5), m("iPhone 11 Pro", "256GB", "C", 4)]],

  ["Trader shorthand", "Samsung without Galaxy", `S23 Ultra 256GB A 12
S22+ 128GB B 8
S21 FE 128GB B 15
A54 128GB A 20
Z Flip 4 128GB B 6
Note 20 Ultra 256GB B 4`, [m("Galaxy S23 Ultra", "256GB", "A", 12), m("Galaxy S22+", "128GB", "B", 8), m("Galaxy S21 FE", "128GB", "B", 15), m("Galaxy A54", "128GB", "A", 20), m("Galaxy Z Flip 4", "128GB", "B", 6), m("Galaxy Note 20 Ultra", "256GB", "B", 4)]],

  ["Trader shorthand", "Samsung model codes", `SM-G991B 128GB Grade A 10
SM-G996B 256GB Grade B 5
SM-S911B 128GB Grade A 8
SM-A536B 128GB Grade B 12
SM-S918B/DS 256GB Grade A 4`, [m("Galaxy S21", "128GB", "A", 10), m("Galaxy S21+", "256GB", "B", 5), m("Galaxy S23", "128GB", "A", 8), m("Galaxy A53", "128GB", "B", 12), m("Galaxy S23 Ultra", "256GB", "A", 4)]],

  ["Trader shorthand", "brackets around grade and count", `[A] iPhone 12 128GB (x10)
[B] iPhone 12 128GB (x25)
[C] iPhone 11 64GB (x14)
[A] Galaxy S21 128GB (x6)`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 12", "128GB", "B", 25), m("iPhone 11", "64GB", "C", 14), m("Galaxy S21", "128GB", "A", 6)]],

  ["Trader shorthand", "at-price offers", `iPhone 13 128GB grade A 10 pcs @ 350€
5 x Latitude 7420 i5-1145G7 16GB 256GB grade B @ 290 EUR
iPhone 12 64GB grade B 30 pcs @ 210 €`, [m("iPhone 13", "128GB", "A", 10), pc("Latitude 7420", "i5-1145G7", "16GB", "256GB", "B", 5), m("iPhone 12", "64GB", "B", 30)]],

  ["Trader shorthand", "colon quantity", `iPhone 12 128GB A: 10
iPhone 12 128GB B: 25
Galaxy S21 128GB A: 6
Pixel 6 128GB B: 3`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 12", "128GB", "B", 25), m("Galaxy S21", "128GB", "A", 6), m("Pixel 6", "128GB", "B", 3)]],

  ["Shared lines", "grades as section titles", `GRADE A
10 x iPhone 12 128GB
5 x iPhone 13 128GB

GRADE B
20 x iPhone 12 128GB
8 x Galaxy S21 128GB

GRADE C
4 x iPhone 11 64GB`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "A", 5), m("iPhone 12", "128GB", "B", 20), m("Galaxy S21", "128GB", "B", 8), m("iPhone 11", "64GB", "C", 4)]],

  ["Shared lines", "brand titles, then short lines", `APPLE
iPhone 12 128GB - 10
iPhone 13 128GB - 5

SAMSUNG
S21 128GB - 7
A52 128GB - 12`, [m("iPhone 12", "128GB", undefined, 10), m("iPhone 13", "128GB", undefined, 5), m("Galaxy S21", "128GB", undefined, 7), m("Galaxy A52", "128GB", undefined, 12)]],

  ["Shared lines", "several capacities on one line", `iPhone 12: 64GB x10, 128GB x5, 256GB x2
iPhone 13: 128GB x20, 256GB x4`, [m("iPhone 12", "64GB", undefined, 10), m("iPhone 12", "128GB", undefined, 5), m("iPhone 12", "256GB", undefined, 2), m("iPhone 13", "128GB", undefined, 20), m("iPhone 13", "256GB", undefined, 4)]],

  ["Shared lines", "several grades on one line", `iPhone 12 128GB A:10 B:20 C:5
Galaxy S21 128GB A:4 B:9`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 12", "128GB", "B", 20), m("iPhone 12", "128GB", "C", 5), m("Galaxy S21", "128GB", "A", 4), m("Galaxy S21", "128GB", "B", 9)]],

  ["Shared lines", "one grade for the whole list", `All units Grade B, tested and wiped:

iPhone 12 128GB x10
iPhone 13 128GB x5
Galaxy S21 128GB x8`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "B", 8)]],

  ["Laptops", "bare numbers for RAM and SSD", `Latitude 5420 i5-1145G7 16 256 Grade A 10
ThinkPad T14 Gen 2 i5-1135G7 16 512 Grade B 8
EliteBook 840 G8 i5-1135G7 8 256 Grade B 12`, [pc("Latitude 5420", "i5-1145G7", "16GB", "256GB", "A", 10), pc("ThinkPad T14 Gen 2", "i5-1135G7", "16GB", "512GB", "B", 8), pc("EliteBook 840 G8", "i5-1135G7", "8GB", "256GB", "B", 12)]],

  ["Laptops", "Lenovo spellings", `Lenovo T14 G2 i5-1135G7 16GB 256GB
Thinkpad X1 Carbon G9 i7-1165G7 16GB 512GB
TP L15 Gen 1 i5-10210U 8GB 256GB
T14s Gen 2 i5-1135G7 16GB 512GB`, [pc("ThinkPad T14 Gen 2", "i5-1135G7", "16GB", "256GB", undefined, 1), pc("ThinkPad X1 Carbon Gen 9", "i7-1165G7", "16GB", "512GB", undefined, 1), pc("ThinkPad L15 Gen 1", "i5-10210U", "8GB", "256GB", undefined, 1), pc("ThinkPad T14s Gen 2", "i5-1135G7", "16GB", "512GB", undefined, 1)]],

  ["Laptops", "HP spellings", `HP 840 G6 i5-8265U 8GB 256GB grade B x10
HP 840G5 i5-8350U 16GB 512GB grade A x4
Elitebook 830 G7 i5-10310U 16GB 256GB grade B x6
ProBook 450 G8 i5-1135G7 8GB 256GB grade C x5`, [pc("EliteBook 840 G6", "i5-8265U", "8GB", "256GB", "B", 10), pc("EliteBook 840 G5", "i5-8350U", "16GB", "512GB", "A", 4), pc("EliteBook 830 G7", "i5-10310U", "16GB", "256GB", "B", 6), pc("ProBook 450 G8", "i5-1135G7", "8GB", "256GB", "C", 5)]],

  ["Laptops", "Dell spellings", `DELL LAT 5420 I5-1145G7 16/256 x8
Lat. 7490 i5-8350U 8/256 x12
Latitude 7420 i7-1185G7 32GB 1TB x2
Precision 3550 i7-10610U 16GB 512GB x3`, [pc("Latitude 5420", "i5-1145G7", "16GB", "256GB", undefined, 8), pc("Latitude 7490", "i5-8350U", "8GB", "256GB", undefined, 12), pc("Latitude 7420", "i7-1185G7", "32GB", "1TB", undefined, 2), pc("Precision 3550", "i7-10610U", "16GB", "512GB", undefined, 3)]],

  ["Laptops", "Macs in every spelling", `MacBook Air M1 8GB 256GB Space Gray grade A x10
MBA M2 8/256 grade A x5
MBP 14 M1 Pro 16/512 grade B x4
MacBook Pro 13 M1 16GB 512GB grade B x3
MacBook Pro 16 2019 i7-9750H 16GB 512GB grade C x2`, [pc("MacBook Air M1 2020", "Apple M1", "8GB", "256GB", "A", 10), pc("MacBook Air M2 2022", "Apple M2", "8GB", "256GB", "A", 5), pc("MacBook Pro 14 2021", "Apple M1 Pro", "16GB", "512GB", "B", 4), pc("MacBook Pro 13 M1 2020", "Apple M1", "16GB", "512GB", "B", 3), pc("MacBook Pro 16 2019 Intel", "i7-9750H", "16GB", "512GB", "C", 2)]],

  ["Laptops", "Surface", `Surface Pro 7 i5-1035G4 8GB 128GB x10
Surface Laptop 3 i5-1035G7 8GB 256GB x5
Microsoft Surface Pro 8 i5-1135G7 16GB 256GB x2`, [pc("Surface Pro 7", "i5-1035G4", "8GB", "128GB", undefined, 10), pc("Surface Laptop 3", "i5-1035G7", "8GB", "256GB", undefined, 5), pc("Surface Pro 8", "i5-1135G7", "16GB", "256GB", undefined, 2)]],

  ["Laptops", "Portuguese and Spanish words", `Portátil Dell Latitude 5400 i5-8365U 8GB 256GB SSD estado B 12
Ordenador portátil HP ProBook 640 G5 i5-8365U 16GB 512GB SSD estado A 3`, [pc("Latitude 5400", "i5-8365U", "8GB", "256GB", "B", 12), pc("ProBook 640 G5", "i5-8365U", "16GB", "512GB", "A", 3)]],

  ["Tablets", "iPads by generation and chip", `iPad 9 64GB WiFi grade B x20
iPad 10.2 9th gen 64GB grade A x5
iPad Air 5 256GB Cellular grade A x3
iPad Pro 11 M2 128GB grade B x2
iPad Mini 6 64GB grade A x4`, [m("iPad 10.2 (2021)", "64GB", "B", 20), m("iPad 10.2 (2021)", "64GB", "A", 5), m("iPad Air (2022)", "256GB", "A", 3), m("iPad Pro 11 (2022)", "128GB", "B", 2), m("iPad Mini (2021)", "64GB", "A", 4)]],

  ["Tablets", "Galaxy Tabs", `Galaxy Tab S9 128GB grade A x6
Tab A8 32GB LTE grade B x10
Samsung Tab S7 128GB wifi grade B x4`, [m("Galaxy Tab S9", "128GB", "A", 6), m("Galaxy Tab A8 10.5 (2021)", "32GB", "B", 10), m("Galaxy Tab S7", "128GB", "B", 4)]],

  ["Typos and glue", "misspelt names", `Iphnoe 12 128GB grade A x5
Lattitude 5420 i5-1145G7 16GB 256GB grade B x3
Elitbook 840 G5 i5-8350U 8GB 256GB grade B x4
Galxy S21 128GB grade A x6
Thinkpd T480 i5-8350U 8GB 256GB grade C x2`, [m("iPhone 12", "128GB", "A", 5), pc("Latitude 5420", "i5-1145G7", "16GB", "256GB", "B", 3), pc("EliteBook 840 G5", "i5-8350U", "8GB", "256GB", "B", 4), m("Galaxy S21", "128GB", "A", 6), pc("ThinkPad T480", "i5-8350U", "8GB", "256GB", "C", 2)]],

  ["Typos and glue", "everything glued", `iphone12pro256gb gradeA x5
iPhone13-128GB-GradeB x10
GalaxyS21Ultra256GB x4
Latitude5420 i5-1145G7 16GB256GB x2`, [m("iPhone 12 Pro", "256GB", "A", 5), m("iPhone 13", "128GB", "B", 10), m("Galaxy S21 Ultra", "256GB", undefined, 4), pc("Latitude 5420", "i5-1145G7", "16GB", "256GB", undefined, 2)]],

  ["Typos and glue", "terabytes and odd capacities", `iPhone 13 Pro 1TB grade A x2
iPhone 14 Pro Max 1 To grade B x1
iPhone 15 Pro Max 1000GB grade A x3
Latitude 7420 i7-1185G7 16GB 1024GB grade B x2`, [m("iPhone 13 Pro", "1TB", "A", 2), m("iPhone 14 Pro Max", "1TB", "B", 1), m("iPhone 15 Pro Max", "1TB", "A", 3), pc("Latitude 7420", "i7-1185G7", "16GB", "1TB", "B", 2)]],

  ["Traps", "accessories among the phones", `iPhone 13 128GB grade A x10
Apple Watch Series 7 45mm x5
AirPods Pro 2 x20
Chargeur USB-C 65W x15
Galaxy S21 128GB grade B x6
Dell WD19 Dock x8
Coque iPhone 13 x100`, [m("iPhone 13", "128GB", "A", 10), m("Galaxy S21", "128GB", "B", 6), no(5), no(20), no(15), no(8), no(100)]],

  ["Traps", "shipping and totals lines", `iPhone 12 128GB grade B x10
iPhone 13 128GB grade A x5
Total: 15 pcs
Frais de port 50 €
TOTAL HT 4 200,00 €
TVA sur marge`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "128GB", "A", 5)]],

  ["Traps", "models outside the catalogue", `iPhone 13 128GB grade A x5
Nokia 3310 x10
Blackberry Key2 64GB x4
Acer Chromebook 314 x6
Huawei Watch GT3 x3`, [m("iPhone 13", "128GB", "A", 5), no(10), no(4), no(6), no(3)]],

  ["Traps", "an invoice, no devices", `FACTURE N° 2026-1187
Date : 03/11/2026
Client : ACME SAS
Prestation de transport : 120,00 €
Assurance : 15,00 €
Total TTC : 162,00 €`, []],

  ["Traps", "spare parts for real models", `Ecran iPhone 12 x20
Batterie iPhone 11 x30
Clavier Latitude 5420 AZERTY x10
Carte mère ThinkPad T480 x2`, [no(20), no(30), no(10), no(2)]],

  ["Tables", "N/A and dash cells", `Brand;Model;Storage;Grade;Qty
Apple;iPhone 12;128GB;A;10
Apple;iPhone 13;N/A;B;5
Samsung;Galaxy S21;-;B;7
Google;Pixel 7;128GB;n/a;3`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", undefined, "B", 5), m("Galaxy S21", undefined, "B", 7), m("Pixel 7", "128GB", undefined, 3)]],

  ["Tables", "empty rows and trailing separators", `Model;Grade;Qty;;;

iPhone 12 128GB;A;10;;;
;;;;;
iPhone 13 128GB;B;5;;;
;;;;;
;;;;;`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5)]],

  ["Tables", "the model split over two columns", `Family;Variant;Capacity;Grade;Stock
iPhone;13 Pro;128GB;A;10
iPhone;12 Mini;64GB;B;7
Galaxy;S21 Ultra;256GB;B;4`, [m("iPhone 13 Pro", "128GB", "A", 10), m("iPhone 12 Mini", "64GB", "B", 7), m("Galaxy S21 Ultra", "256GB", "B", 4)]],

  ["Tables", "new, sealed and open box", `Item,Status,Qty
iPhone 15 128GB,New sealed,10
iPhone 14 128GB,Open box,5
Galaxy S23 128GB,Neuf,3`, [m("iPhone 15", "128GB", "A", 10), m("iPhone 14", "128GB", "A", 5), m("Galaxy S23", "128GB", "A", 3)]],

  ["Tables", "prices with thousands next to the quantity", `Désignation;Prix unitaire;Qté;Total
MacBook Pro 14 2021 Apple M1 Pro 16GB 512GB;1 200,00 €;3;3 600,00 €
iPhone 15 Pro 256GB;849,00 €;12;10 188,00 €`, [pc("MacBook Pro 14 2021", "Apple M1 Pro", "16GB", "512GB", undefined, 3), m("iPhone 15 Pro", "256GB", undefined, 12)]],

  ["Tables", "only serial numbers next to names, no grades", `Serial,Device
C02X600AJHCC,iPhone 12 128GB
FFWH22800F0X,iPhone 12 128GB
DX3G14JZ0F0N,iPhone 12 128GB
G6TZK8QXN70K,iPhone 13 128GB`, [m("iPhone 12", "128GB", undefined, 3), m("iPhone 13", "128GB", undefined, 1)]],
];

export const handwrittenLists: StressList[] = lists.map(([family, name, text, truth], i) => ({ family, name: `H${String(i + 1).padStart(2, "0")} ${name}`, text, truth }));
