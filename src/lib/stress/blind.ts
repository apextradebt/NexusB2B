import type { Grade } from "@/types";
import type { StressList, Truth } from "@/lib/stress/types";

// The last batch: written once every other list passed, and measured before any fix.

const m = (model: string, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, storage, grade, qty });
const pc = (model: string, cpu: string | undefined, ram: string | undefined, storage: string | undefined, grade: Grade | undefined, qty: number): Truth => ({ model, cpu, ram, storage, grade, qty });
const no = (qty = 1): Truth => ({ qty });

const lists: [name: string, text: string, truth: Truth[]][] = [
  ["key and value pairs on one line", `Model: iPhone 12, Storage: 128GB, Grade: B, Qty: 10
Model: iPhone 13 Pro, Storage: 256GB, Grade: A, Qty: 4
Model: Galaxy S21, Storage: 128GB, Grade: C, Qty: 6`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13 Pro", "256GB", "A", 4), m("Galaxy S21", "128GB", "C", 6)]],

  ["brackets holding capacity and grade", `50x iPhone 11 (64GB, Grade B)
20x iPhone 12 (128GB, Grade A)
8x Galaxy S20 (128GB, Grade C)`, [m("iPhone 11", "64GB", "B", 50), m("iPhone 12", "128GB", "A", 20), m("Galaxy S20", "128GB", "C", 8)]],

  ["lot of N", `Lot of 50 iPhone 11 64GB grade B
Lot of 20 iPhone XR 64GB grade C
Lot de 15 Galaxy A71 128GB grade B`, [m("iPhone 11", "64GB", "B", 50), m("iPhone XR", "64GB", "C", 20), m("Galaxy A71", "128GB", "B", 15)]],

  ["each and ea", `iPhone X 64GB grade B 12 ea
iPhone XS Max 256GB grade A 3 each
Galaxy S10e 128GB grade B 7 ea`, [m("iPhone X", "64GB", "B", 12), m("iPhone XS Max", "256GB", "A", 3), m("Galaxy S10e", "128GB", "B", 7)]],

  ["Apple A numbers beside the name", `iPhone 12 A2403 128GB Grade B 10
iPhone 13 A2633 128GB Grade A 6
iPhone SE A2296 64GB 2020 Grade B 9`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "128GB", "A", 6), m("iPhone SE (2020)", "64GB", "B", 9)]],

  ["glued Samsung and Xiaomi names", `Note20 Ultra 256GB grade A x5
S10+ 128GB grade B x9
S10 Plus 512GB grade A x2
Mi 11 Lite 128GB grade B x6
Redmi Note 10 Pro 128GB grade C x4`, [m("Galaxy Note 20 Ultra", "256GB", "A", 5), m("Galaxy S10+", "128GB", "B", 9), m("Galaxy S10+", "512GB", "A", 2), m("Mi 11 Lite", "128GB", "B", 6), m("Redmi Note 10 Pro", "128GB", "C", 4)]],

  ["laptops labelled inline", `Latitude 5490 | CPU: i5-8350U | RAM: 8GB | SSD: 256GB | Grade: B | Qty: 14
ThinkPad T470s | CPU: i5-7300U | RAM: 8GB | SSD: 256GB | Grade: C | Qty: 9`, [pc("Latitude 5490", "i5-8350U", "8GB", "256GB", "B", 14), pc("ThinkPad T470s", "i5-7300U", "8GB", "256GB", "C", 9)]],

  ["only the CPU tier and generation", `Dell Latitude 5490 i5 8th gen 8GB 256GB SSD Grade B x10
HP EliteBook 840 G6 i7 8th gen 16GB 512GB SSD Grade A x4`, [pc("Latitude 5490", undefined, "8GB", "256GB", "B", 10), pc("EliteBook 840 G6", undefined, "16GB", "512GB", "A", 4)]],

  ["premium laptops", `Dell XPS 13 9310 i7-1185G7 16GB 512GB grade A x3
HP Elite Dragonfly G2 i5-1135G7 16GB 256GB grade B x2
Lenovo X1 Yoga Gen 6 i7-1185G7 16GB 512GB grade A x5`, [pc("XPS 13 9310", "i7-1185G7", "16GB", "512GB", "A", 3), pc("Elite Dragonfly G2", "i5-1135G7", "16GB", "256GB", "B", 2), pc("ThinkPad X1 Yoga Gen 6", "i7-1185G7", "16GB", "512GB", "A", 5)]],

  ["storage words without GB", `Latitude 5300 i5-8365U 8GB 256 SSD grade B x6
ThinkPad T470 i5-7300U 8GB 512 SSD grade C x8
EliteBook 840 G5 i5-8350U 16GB 1T SSD grade A x2`, [pc("Latitude 5300", "i5-8365U", "8GB", "256GB", "B", 6), pc("ThinkPad T470", "i5-7300U", "8GB", "512GB", "C", 8), pc("EliteBook 840 G5", "i5-8350U", "16GB", "1TB", "A", 2)]],

  ["reply with quoted lines", `> 10x iPhone 12 128GB grade A
> 5x iPhone 13 128GB grade B
> 8x Galaxy S21 128GB grade B`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "B", 8)]],

  ["page header repeated in the middle", `Model;Grade;Qty
iPhone 12 128GB;A;10
iPhone 13 128GB;B;5
Model;Grade;Qty
Galaxy S21 128GB;B;7
Page 2/2;;`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "B", 7)]],

  ["two tables with different columns", `PHONES
Model;Capacity;Grade;Qty
iPhone 12;128GB;A;10
Galaxy S21;128GB;B;7

LAPTOPS
Model;CPU;RAM;SSD;Grade;Qty
Latitude 5420;i5-1145G7;16GB;256GB;B;4
ThinkPad T480;i5-8350U;8GB;256GB;C;9`, [m("iPhone 12", "128GB", "A", 10), m("Galaxy S21", "128GB", "B", 7), pc("Latitude 5420", "i5-1145G7", "16GB", "256GB", "B", 4), pc("ThinkPad T480", "i5-8350U", "8GB", "256GB", "C", 9)]],

  ["subtotal rows per family", `Device;Grade;Qty
iPhone 12 128GB;A;10
iPhone 12 128GB;B;20
Sous-total iPhone 12;;30
Galaxy S21 128GB;B;7
Sous-total Galaxy S21;;7`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 12", "128GB", "B", 20), m("Galaxy S21", "128GB", "B", 7)]],

  ["grade inside the product column", `Product;Qty
iPhone 12 128GB Grade A;10
iPhone 13 128GB Grade B;5
Galaxy S21 128GB Grade C;7`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "C", 7)]],

  ["capacity column with spaces and a colour", `Model,Capacity,Colour,Condition,Available
iPhone 12,128 GB,Black,Excellent,14
iPhone 12,64 GB,Red,Good,31
Pixel 7,128 GB,Snow,Very good,5`, [m("iPhone 12", "128GB", "A", 14), m("iPhone 12", "64GB", "C", 31), m("Pixel 7", "128GB", "B", 5)]],

  ["thousands in a quoted quantity", `Model,Grade,Qty
iPhone 11 64GB,B,"1,200"
iPhone 12 128GB,A,"2,450"
Galaxy S21 128GB,C,850`, [m("iPhone 11", "64GB", "B", 1200), m("iPhone 12", "128GB", "A", 2450), m("Galaxy S21", "128GB", "C", 850)]],

  ["French all capitals with labels", `IPHONE 12 128GO ETAT: B QTE: 10
IPHONE 13 PRO 256GO ETAT: A QTE: 4
SAMSUNG S21 128GO ETAT: B QTE: 6`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13 Pro", "256GB", "A", 4), m("Galaxy S21", "128GB", "B", 6)]],

  ["pasted JSON", `[{"model":"iPhone 12","storage":"128GB","grade":"B","qty":10},
{"model":"iPhone 13","storage":"128GB","grade":"A","qty":4}]`, [m("iPhone 12", "128GB", "B", 10), m("iPhone 13", "128GB", "A", 4)]],

  ["mixed spaces and tabs", `iPhone 12 128GB    A    10
iPhone 13 128GB\tB\t5
Galaxy S21 128GB   C   7`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "C", 7)]],

  ["grade before the device", `Grade A iPhone 12 128GB x10
Grade B iPhone 13 128GB x5
A-grade Galaxy S21 128GB x7`, [m("iPhone 12", "128GB", "A", 10), m("iPhone 13", "128GB", "B", 5), m("Galaxy S21", "128GB", "A", 7)]],

  ["devices without a capacity", `iPhone 12 x10 grade B
iPhone 13 Pro x4 grade A
Galaxy S21 x7 grade B`, [m("iPhone 12", undefined, "B", 10), m("iPhone 13 Pro", undefined, "A", 4), m("Galaxy S21", undefined, "B", 7)]],

  ["consoles and TVs among phones", `iPhone 12 128GB grade A x10
PlayStation 5 x8
Samsung TV 55 pouces x3
Nintendo Switch OLED x12
Galaxy S21 128GB grade B x6`, [m("iPhone 12", "128GB", "A", 10), m("Galaxy S21", "128GB", "B", 6), no(8), no(3), no(12)]],

  ["a stock note in prose", `Salut, on vient de recevoir 12 iPhone 13 en 128Go, tous grade A, plus 30 iPhone 12 64Go grade B. Tu en veux ?`, [m("iPhone 13", "128GB", "A", 12), m("iPhone 12", "64GB", "B", 30)]],
];

export const blindLists: StressList[] = lists.map(([name, text, truth], i) => ({ family: "Blind batch", name: `B${String(i + 1).padStart(2, "0")} ${name}`, text, truth }));
