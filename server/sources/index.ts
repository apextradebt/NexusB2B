import type { Source } from "../types.ts";
import { REFURBED } from "./refurbed.ts";
import { REBUY } from "./rebuy.ts";
import { certideal, compareandrecycle, greenpanda, itjustgood, sellbroke } from "./others.ts";
import { AFB } from "./afb.ts";
import { recommerce } from "./recommerce.ts";
import { alternate } from "./alternate.ts";
import { blocket, dba, finn, kleinanzeigen, marktplaats, tori, tweedehands } from "./classifieds.ts";
import { bankmycell, envirofone, o2recycle, sellcell } from "./comparators.ts";

export const SOURCES: Source[] = [...REBUY, ...REFURBED, ...AFB, recommerce, greenpanda, alternate, certideal, itjustgood, sellbroke, compareandrecycle, bankmycell, sellcell, envirofone, o2recycle, kleinanzeigen, marktplaats, tweedehands, blocket, dba, finn, tori];
