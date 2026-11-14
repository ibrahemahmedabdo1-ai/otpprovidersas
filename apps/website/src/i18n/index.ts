import type { Locale } from "./config";
import type { Dict } from "./en";
import en from "./en";
import ar from "./ar";
import ru from "./ru";
import es from "./es";
import de from "./de";
import zh from "./zh";

const dictionaries: Record<Locale, Dict> = { en, ar, ru, es, de, zh };
export const getDict = (l: Locale): Dict => dictionaries[l];
export type { Dict };
