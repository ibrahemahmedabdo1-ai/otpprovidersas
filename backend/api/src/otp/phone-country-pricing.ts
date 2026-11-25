// Country-specific WhatsApp prices are selected from the E.164 calling code,
// never from a client-supplied country field. +1 is intentionally left on the
// global rate because it is shared by the US, Canada and several territories.
const PRICED_CALLING_CODES: ReadonlyArray<readonly [string,string]> = [
  ["+971","AE"],
  ["+966","SA"],
  ["+49","DE"],
  ["+44","GB"],
  ["+20","EG"],
  ["+91","IN"],
  ["+90","TR"],
  ["+27","ZA"],
];

export function countryForE164(value: string): string {
  const normalized = "+" + value.replace(/\D/g, "");
  return PRICED_CALLING_CODES.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? "*";
}
