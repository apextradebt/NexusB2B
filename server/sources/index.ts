import type { Source } from "../types.ts";
import { REFURBED } from "./refurbed.ts";
import { REBUY } from "./rebuy.ts";
import { certideal, compareandrecycle, greenpanda, itjustgood, sellbroke } from "./others.ts";

export const SOURCES: Source[] = [...REBUY, ...REFURBED, greenpanda, certideal, itjustgood, sellbroke, compareandrecycle];
