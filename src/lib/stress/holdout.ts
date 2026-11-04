import type { Grade } from "@/types";
import type { StressList, Truth } from "@/lib/stress/types";

// Written after the matcher was tuned on the other lists: new wording, to measure what it does on lists it has not seen.

const m = (model: string, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, storage, grade, qty });
const pc = (model: string, cpu: string | undefined, ram: string | undefined, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, cpu, ram, storage, grade, qty });
const no = (qty = 1): Truth => ({ qty });

const lists: [name: string, text: string, truth: Truth[]][] = [
  ["broker offer with MOQ and terms", `OFFER 118 - MIXED SMARTPHONES
MOQ 50 units, EXW Amsterdam

iPhone 12 Mini 64GB Grade A - 35 units
iPhone 13 Pro Max 128GB Grade B - 18 units
Samsung Galaxy S22 Ultra 128GB Grade A - 22 units
Google Pixel 6 Pro 128GB Grade B - 9 units

Valid until Friday.`, [m("iPhone 12 Mini", "64GB", "A", 35), m("iPhone 13 Pro Max", "128GB", "B", 18), m("Galaxy S22 Ultra", "128GB", "A", 22), m("Pixel 6 Pro", "128GB", "B", 9)]],

  ["French with Grade after a dash and en stock", `Disponible en stock :
iPhone 14 Plus 128 Go – Grade A – 6 pièces
iPhone SE 2022 64 Go – Grade B – 14 pièces
Galaxy A34 128 Go – Grade A – 9 pièces`, [m("iPhone 14 Plus", "128GB", "A", 6), m("iPhone SE (2022)", "64GB", "B", 14), m("Galaxy A34", "128GB", "A", 9)]],

  ["semicolon-free tabs from a web page", `Apple iPhone 11\t128GB\tGrade B\t44
Apple iPhone 11 Pro Max\t256GB\tGrade A\t3
Samsung Galaxy Note 10+\t256GB\tGrade C\t7`, [m("iPhone 11", "128GB", "B", 44), m("iPhone 11 Pro Max", "256GB", "A", 3), m("Galaxy Note 10+", "256GB", "C", 7)]],

  ["grade in brackets at the end", `iPhone 13 mini 128GB (Grade B) 11pcs
iPhone 12 Pro Max 256GB (Grade A) 4pcs
Xiaomi 13T 256GB (Grade A) 2pcs`, [m("iPhone 13 Mini", "128GB", "B", 11), m("iPhone 12 Pro Max", "256GB", "A", 4), m("Xiaomi 13T", "256GB", "A", 2)]],

  ["quantity then colon", `30: iPhone 11 64GB grade B
12: iPhone 13 128GB grade A
5: Galaxy S20 FE 128GB grade C`, [m("iPhone 11", "64GB", "B", 30), m("iPhone 13", "128GB", "A", 12), m("Galaxy S20 FE", "128GB", "C", 5)]],

  ["hash and qty words", `#1 iPhone 12 64GB - Qty 15 - Grade B
#2 iPhone 12 128GB - Qty 8 - Grade A
#3 Galaxy S21+ 256GB - Qty 3 - Grade B`, [m("iPhone 12", "64GB", "B", 15), m("iPhone 12", "128GB", "A", 8), m("Galaxy S21+", "256GB", "B", 3)]],

  ["laptops with screen sizes and touch", `HP EliteBook 840 G7 14" Touch i5-10310U 16GB 512GB SSD Grade A (12)
Dell Latitude 7410 14" i7-10610U 16GB 512GB SSD Grade B (6)
Lenovo ThinkPad T490 14" i5-8265U 8GB 256GB SSD Grade B (20)`, [pc("EliteBook 840 G7", "i5-10310U", "16GB", "512GB", "A", 12), pc("Latitude 7410", "i7-10610U", "16GB", "512GB", "B", 6), pc("ThinkPad T490", "i5-8265U", "8GB", "256GB", "B", 20)]],

  ["French laptops with Go and SSD first", `Lenovo ThinkPad T14 Gen 1 - Core i5-10310U - 16 Go - SSD 512 Go - Grade B - 7 unités
HP ProBook 650 G5 - Core i5-8365U - 8 Go - SSD 256 Go - Grade C - 10 unités`, [pc("ThinkPad T14 Gen 1", "i5-10310U", "16GB", "512GB", "B", 7), pc("ProBook 650 G5", "i5-8365U", "8GB", "256GB", "C", 10)]],

  ["German table with Stück column", `Artikel;Zustand;Stück
Apple iPhone 13 128GB;Sehr gut;12
Apple iPhone 12 64GB;Gut;30
Samsung Galaxy S21 128GB;Wie neu;5`, [m("iPhone 13", "128GB", "B", 12), m("iPhone 12", "64GB", "C", 30), m("Galaxy S21", "128GB", "A", 5)]],

  ["UK supplier with pounds and VAT words", `Item,Grade,Stock,Price (GBP)
iPhone XS 64GB,B,18,£129.00
iPhone XR 128GB,A,6,£149.00
Galaxy S10 128GB,C,25,£79.00`, [m("iPhone XS", "64GB", "B", 18), m("iPhone XR", "128GB", "A", 6), m("Galaxy S10", "128GB", "C", 25)]],

  ["table with a Total column and a Grand Total", `Device;Grade;Units;Unit price;Line total
iPhone 12 128GB;A;10;300;3000
iPhone 13 128GB;B;5;350;1750
Grand Total;;15;;4750`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5)]],

  ["iPads with Wi-Fi and Cellular spelled out", `Apple iPad Air 4 64GB Wi-Fi + Cellular Grade B x4
Apple iPad 8th Generation 32GB Wi-Fi Grade A x9
Apple iPad Pro 12.9 3rd Gen 256GB Wi-Fi Grade B x2`, [m("iPad Air (2020)", "64GB", "B", 4), m("iPad 10.2 (2020)", "32GB", "A", 9), m("iPad Pro 12.9 (2018)", "256GB", "B", 2)]],

  ["colours in French and a network word", `iPhone 13 128Go Bleu Nuit 5G grade A 8
iPhone 12 64Go Mauve 5G grade B 12
Samsung Galaxy S23 256Go Crème grade A 3`, [m("iPhone 13", "128GB", "A", 8), m("iPhone 12", "64GB", "B", 12), m("Galaxy S23", "256GB", "A", 3)]],

  ["Xiaomi, OnePlus and Huawei", `Xiaomi Redmi Note 12 Pro 128GB grade B x20
Xiaomi 12T Pro 256GB grade A x5
OnePlus Nord 2 128GB grade B x7
Huawei P30 Pro 128GB grade C x10
Poco F4 256GB grade B x4`, [m("Redmi Note 12 Pro", "128GB", "B", 20), m("Xiaomi 12T Pro", "256GB", "A", 5), m("OnePlus Nord 2", "128GB", "B", 7), m("P30 Pro", "128GB", "C", 10), m("POCO F4", "256GB", "B", 4)]],

  ["accessories and desktops in a laptop list", `Dell Latitude 5520 i5-1145G7 16GB 512GB Grade B x12
Dell OptiPlex 7090 i5-10500 16GB 256GB x20
HP USB-C Dock G5 x30
Dell P2419H monitor x40
Lenovo ThinkPad T15 Gen 2 i5-1135G7 16GB 256GB Grade A x5`, [pc("Latitude 5520", "i5-1145G7", "16GB", "512GB", "B", 12), pc("ThinkPad T15 Gen 2", "i5-1135G7", "16GB", "256GB", "A", 5), no(20), no(30), no(40)]],

  ["phone with a part word in the notes", `Model;Grade;Qty;Notes
iPhone 12 128GB;B;10;new battery
iPhone 13 128GB;A;5;screen replaced
Galaxy S21 128GB;B;7;no charger`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "128GB", "A", 5), m("Galaxy S21", "128GB", "B", 7)]],

  ["grades as columns with words", `Modèle;Comme neuf;Très bon;Bon
iPhone 12 128GB;4;10;6
iPhone 13 128GB;2;;8`, [m("iPhone 12", "128GB", "A", 4), m("iPhone 12", "128GB", "B", 10), m("iPhone 12", "128GB", "C", 6), m("iPhone 13", "128GB", "A", 2), m("iPhone 13", "128GB", "C", 8)]],

  ["grades as columns, prefixed", `Model,Grade A,Grade B,Grade C,Total
Galaxy S22 128GB,5,12,,17
Galaxy S23 128GB,,4,3,7`, [m("Galaxy S22", "128GB", "A", 5), m("Galaxy S22", "128GB", "B", 12), m("Galaxy S23", "128GB", "B", 4), m("Galaxy S23", "128GB", "C", 3)]],

  ["section titles in French", `Grade A :
iPhone 13 128Go x6
iPhone 14 128Go x2
Grade B :
iPhone 12 64Go x15`, [m("iPhone 13", "128GB", "A", 6), m("iPhone 14", "128GB", "A", 2), m("iPhone 12", "64GB", "B", 15)]],

  ["section titles by model, capacities below", `iPhone 12
64GB - 10
128GB - 5
iPhone 13
128GB - 7`, [m("iPhone 12", "64GB", undefined, 10), m("iPhone 12", "128GB", undefined, 5), m("iPhone 13", "128GB", undefined, 7)]],

  ["model once, then grades below", `iPhone 13 128GB
Grade A: 10
Grade B: 25
Grade C: 3`, [m("iPhone 13", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 25), m("iPhone 13", "128GB", "C", 3)]],

  ["slashes between all fields", `iPhone 12/128GB/B/10
iPhone 13/256GB/A/4
Galaxy S21/128GB/C/6`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "256GB", "A", 4), m("Galaxy S21", "128GB", "C", 6)]],

  ["dashes between all fields", `iPhone 12 - 128GB - B - 10
iPhone 13 - 256GB - A - 4
Galaxy S21 - 128GB - C - 6`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "256GB", "A", 4), m("Galaxy S21", "128GB", "C", 6)]],

  ["typed fast, all lower, abbreviated grades", `ip 12 128 gr a 10
ip 13 pro 256 gr b 5
sgs21 128 gr b 6`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13 Pro", "256GB", "B", 5), m("Galaxy S21", "128GB", "B", 6)]],

  ["MacBooks by year and size", `MacBook Pro 13" 2020 M1 8GB 256GB Grade A 5 pcs
MacBook Air 13" M2 2022 16GB 512GB Grade A 2 pcs
MacBook Pro 16" 2021 M1 Max 32GB 1TB Grade B 1 pcs`, [pc("MacBook Pro 13 M1 2020", "Apple M1", "8GB", "256GB", "A", 5), pc("MacBook Air M2 2022", "Apple M2", "16GB", "512GB", "A", 2), pc("MacBook Pro 16 2021", "Apple M1 Max", "32GB", "1TB", "B", 1)]],

  ["refurbisher's sentence style", `We can offer you 25 iPhone 13 128GB in grade A, 40 iPhone 12 64GB in grade B and 10 Galaxy S21 128GB in grade B.`, [m("iPhone 13", "128GB", "A", 25), m("iPhone 12", "64GB", "B", 40), m("Galaxy S21", "128GB", "B", 10)]],

  ["two devices on one line with a plus", `10x iPhone 12 128GB + 5x iPhone 13 128GB, all grade A
8x Galaxy S21 128GB + 2x Galaxy S22 128GB, all grade B`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "A", 5), m("Galaxy S21", "128GB", "B", 8), m("Galaxy S22", "128GB", "B", 2)]],

  ["Excel paste with a blank first column", `\tBrand\tModel\tCapacity\tGrade\tQty
\tApple\tiPhone 12\t64GB\tB\t10
\tSamsung\tGalaxy S21\t128GB\tA\t4`, [m("iPhone 12", "64GB", "B", 10), m("Galaxy S21", "128GB", "A", 4)]],
];

export const holdoutLists: StressList[] = lists.map(([name, text, truth], i) => ({ family: "Unseen hand-written", name: `U${String(i + 1).padStart(2, "0")} ${name}`, text, truth }));
