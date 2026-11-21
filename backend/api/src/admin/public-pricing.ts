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
 * the engine reads them). WhatsApp is listed only for countries with their own approved price: no default is invented.
 */
export function buildPublicPricing(prices: PriceRow[], providers: ChannelLive[]): PublicPricing {
  const live = (ch: string) => providers.some((p) => p.channel === ch && p.live);
  const email = live("email"), whatsapp = live("whatsapp");
  const m = new Map<string, string>();
  for (const p of prices) m.set(`${p.channel}:${p.country}`, String(p.micro));
  const countries = SELLABLE_COUNTRIES.map((code) => ({
    code,
    email: email ? (m.get("email:*") ?? null) : null,
    whatsapp: whatsapp ? (m.get(`whatsapp:${code}`) ?? null) : null,
  })).filter((c) => c.email !== null || c.whatsapp !== null);
  return { currency: "USD", channels: { email, whatsapp }, countries };
}
