import { SELLABLE_COUNTRIES } from "../common/countries";

export type PriceRow = { channel: string; country: string; micro: string | number | bigint };
export type ChannelLive = { channel: string; live: boolean };
export type PublicPricing = {
  currency: "USD";
  channels: { email: boolean; whatsapp: boolean };
  countries: { code: string; email: string | null; whatsapp: string | null }[];
};

/**
 * Builds the public table from approved prices and provider state only.
 * A channel is advertised only when its live delivery path is actually enabled.
 * WhatsApp remains unavailable until customer sending and delivery-receipt billing
 * are implemented in the live delivery service; a database price alone is not availability.
 */
/** Keep WhatsApp hidden until the live send path and delivery-receipt billing are implemented. */
export function applyPublicDeliveryGates(providers: ChannelLive[]): ChannelLive[] {
  return providers.map((provider) => provider.channel === "whatsapp" ? { ...provider, live: false } : provider);
}

export function buildPublicPricing(prices: PriceRow[], providers: ChannelLive[]): PublicPricing {
  const live = (ch: string) => providers.some((p) => p.channel === ch && p.live);
  const m = new Map<string, string>();
  for (const p of prices) m.set(`${p.channel}:${p.country}`, String(p.micro));
  const email = live("email"), whatsapp = live("whatsapp");
  const countries = SELLABLE_COUNTRIES.map((code) => ({
    code,
    email: email ? (m.get("email:*") ?? null) : null,
    whatsapp: whatsapp ? (m.get(`whatsapp:${code}`) ?? m.get("whatsapp:*") ?? null) : null,
  })).filter((c) => c.email !== null || c.whatsapp !== null);
  return { currency: "USD", channels: { email, whatsapp }, countries };
}
