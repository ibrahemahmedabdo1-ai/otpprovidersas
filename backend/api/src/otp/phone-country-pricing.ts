// Country-specific WhatsApp prices currently configured in production. The country is
// derived from the E.164 calling code, never trusted from a client-supplied country field.
const PRICED_CALLING_CODES: ReadonlyArray<readonly [string,string]> = [
  ["+971","AE"],
  ["+966","SA"],
  ["+49","DE"],
  ["+44","GB"],
  ["+20","EG"],
];

export function countryForE164(value: string): string {
  const normalized = "+" + value.replace(/\D/g, "");
  return PRICED_CALLING_CODES.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? "*";
}
