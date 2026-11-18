import type { Locale } from "../config";
import en, { type Landing } from "./en";
import ar from "./ar";
import ru from "./ru";
import es from "./es";
import de from "./de";
import zh from "./zh";

const all: Record<Locale, Landing> = { en, ar, ru, es, de, zh };
export const getLanding = (l: Locale): Landing => all[l];
export type { Landing };
