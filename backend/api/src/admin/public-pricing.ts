import { SELLABLE_COUNTRIES } from "../common/countries";

export type PriceRow = { channel: string; country: string; micro: string | number | bigint };
export type ChannelLive = { channel: string; live: boolean };
export type PublicPricing = {
  currency: "USD";
  channels: { email: boolean; whatsapp: boolean };
  countries: { code: string; email: string | null; whatsapp: string | null }[];
};

/**
 * Builds the public table from approved prices and provider state only. A price is shown for a channel only when an
 * enabled, non-maintenance provider exists for it. Email uses the approved default ('*') for every country unless the
 * country has its own approved price (the live email path charges the default today, so country overrides apply once
 * the engine reads them). WhatsApp is listed for every sellable country: the country's own approved price, otherwise
 * the approved default ('*') from the prices table. It does not depend on the WhatsApp provider state (that is
 * managed separately and left untouched); with no approved WhatsApp price at all it is "not available".
 */
export function buildPublicPricing(prices: PriceRow[], providers: ChannelLive[]): PublicPricing {
  const live = (ch: string) => providers.some((p) => p.channel === ch && p.live);
  const m = new Map<string, string>();
  for (const p of prices) m.set(`${p.channel}:${p.country}`, String(p.micro));
  const email = live("email"), whatsapp = [...m.keys()].some((k) => k.startsWith("whatsapp:"));
  const countries = SELLABLE_COUNTRIES.map((code) => ({
    code,
    email: email ? (m.get("email:*") ?? null) : null,
    whatsapp: m.get(`whatsapp:${code}`) ?? m.get("whatsapp:*") ?? null,
  })).filter((c) => c.email !== null || c.whatsapp !== null);
  return { currency: "USD", channels: { email, whatsapp }, countries };
}
