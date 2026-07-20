/**
 * GSM-7 / UCS-2 segmentation.
 *
 * Every segment is billed, so this module decides what a message costs before
 * it is sent. The trap it exists to catch: a single character outside the
 * GSM 03.38 alphabet silently re-encodes the whole message as UCS-2 and drops
 * capacity from 160 characters to 70. One stray accent can double the bill.
 *
 * Reference: 3GPP TS 23.038, GSM 03.38 default alphabet + extension table.
 */

export type SmsEncoding = "GSM7" | "UCS2";

/** GSM 03.38 default alphabet. One septet each. */
const GSM7_BASIC = new Set(
  [
    "@£$¥èéùìòÇ\nØø\rÅå",
    "Δ_ΦΓΛΩΠΨΣΘΞ",
    "ÆæßÉ",
    " !\"#¤%&'()*+,-./",
    "0123456789:;<=>?",
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§",
    "¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ]
    .join("")
    .split(""),
);

/**
 * GSM 03.38 extension table. Each of these is ESC + char, so it costs TWO
 * septets, not one. The euro sign is the one that bites in practice.
 */
const GSM7_EXTENDED = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

const GSM7_SINGLE_SEGMENT = 160;
const GSM7_CONCATENATED = 153; // 7 septets go to the UDH
const UCS2_SINGLE_SEGMENT = 70;
const UCS2_CONCATENATED = 67; // 3 code units go to the UDH

/**
 * Characters that look innocent in French but are absent from GSM-7 entirely.
 * Kept as an explicit list because these are the ones that actually appear in
 * agent output: prêt, août, s'il vous plaît, être, contrôle, Noël, naïf.
 *
 * Note `ç` (lowercase): only uppercase `Ç` is in the alphabet. Some gateways
 * silently fold it to `Ç`, others re-encode the whole message. Treated as
 * unsafe here because we cannot rely on which one OVH does.
 */
export const FRENCH_UCS2_TRAPS = ["ê", "î", "ô", "û", "â", "ë", "ï", "ç", "œ", "Œ"] as const;

/** Transliterations that preserve meaning and stay inside GSM-7. */
const GSM7_FALLBACKS: Record<string, string> = {
  ê: "e",
  ë: "e",
  î: "i",
  ï: "i",
  ô: "o",
  û: "u",
  â: "a",
  ç: "c",
  œ: "oe",
  Œ: "OE",
  Ê: "E",
  Ë: "E",
  Î: "I",
  Ï: "I",
  Ô: "O",
  Û: "U",
  Â: "A",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "–": "-",
  "—": "-",
  " ": " ", // non-breaking space
};

export function isGsm7Char(char: string): boolean {
  return GSM7_BASIC.has(char) || GSM7_EXTENDED.has(char);
}

export function isGsm7(text: string): boolean {
  return [...text].every(isGsm7Char);
}

/**
 * Unique characters that force the message to UCS-2, in order of appearance.
 * This is what you show a developer (or an agent's system prompt) to explain
 * why a reply suddenly costs three segments instead of one.
 */
export function ucs2Offenders(text: string): string[] {
  const seen = new Set<string>();
  for (const char of text) {
    if (!isGsm7Char(char) && !seen.has(char)) seen.add(char);
  }
  return [...seen];
}

/** Septet count under GSM-7, accounting for the 2-septet extension chars. */
function gsm7Septets(text: string): number {
  let septets = 0;
  for (const char of text) {
    septets += GSM7_EXTENDED.has(char) ? 2 : 1;
  }
  return septets;
}

/**
 * UTF-16 code units, NOT codepoints. An emoji outside the BMP is a surrogate
 * pair and therefore costs 2 units, so a 35-emoji message is already 2 segments.
 */
function ucs2Units(text: string): number {
  return text.length;
}

export interface SegmentInfo {
  encoding: SmsEncoding;
  /** Septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Capacity of each segment at this encoding and segment count. */
  capacity: number;
  /** Characters responsible for forcing UCS-2. Empty when encoding is GSM7. */
  offenders: string[];
}

export function analyze(text: string): SegmentInfo {
  const offenders = ucs2Offenders(text);
  const encoding: SmsEncoding = offenders.length === 0 ? "GSM7" : "UCS2";

  const units = encoding === "GSM7" ? gsm7Septets(text) : ucs2Units(text);
  const single = encoding === "GSM7" ? GSM7_SINGLE_SEGMENT : UCS2_SINGLE_SEGMENT;
  const concatenated = encoding === "GSM7" ? GSM7_CONCATENATED : UCS2_CONCATENATED;

  if (units === 0) {
    return { encoding, units: 0, segments: 0, capacity: single, offenders };
  }
  if (units <= single) {
    return { encoding, units, segments: 1, capacity: single, offenders };
  }
  return {
    encoding,
    units,
    segments: Math.ceil(units / concatenated),
    capacity: concatenated,
    offenders,
  };
}

/**
 * Rewrite text so it fits GSM-7, without changing what it says.
 *
 * Deliberately lossy on accents: "prêt" becomes "pret". That is the right
 * trade when the alternative is paying double to preserve a circumflex, but it
 * is the caller's decision, so this is never applied automatically on the send
 * path. `é è à ù ì ò` survive untouched because GSM-7 has them.
 */
export function toGsm7(text: string): string {
  let out = "";
  for (const char of text) {
    if (isGsm7Char(char)) {
      out += char;
      continue;
    }
    const fallback = GSM7_FALLBACKS[char];
    // Unmapped and non-GSM7 (emoji, CJK): drop it rather than smuggle in a
    // character that would silently re-encode the whole message to UCS-2.
    out += fallback ?? "";
  }
  return out;
}

/**
 * Split text into segment-aligned chunks that each survive as an independent
 * SMS. Splits on whitespace where possible so words are not cut in half.
 *
 * `maxChars` is measured in the units of the chosen encoding, so a chunk that
 * is valid GSM-7 will not overflow once a later chunk forces UCS-2: each chunk
 * is analysed on its own.
 */
export function chunk(text: string, maxCharsPerPart: number): string[] {
  if (maxCharsPerPart <= 0) throw new RangeError("maxCharsPerPart must be positive");

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxCharsPerPart) return [trimmed];

  const parts: string[] = [];
  let remaining = trimmed;

  while (remaining.length > maxCharsPerPart) {
    const window = remaining.slice(0, maxCharsPerPart + 1);
    let cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"));
    // A single unbroken token longer than the window: hard-cut it.
    if (cut <= 0) cut = maxCharsPerPart;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) parts.push(remaining);

  return parts;
}

/**
 * What a message will actually cost to deliver.
 *
 * The notification filter needs this to decide whether an alert is worth
 * interrupting someone for: at OVH's ~0.06 EUR per segment, a chatty group
 * thread is genuinely expensive, so "is this worth 12 cents" is a real
 * question the filter has to answer.
 */
export function estimateCost(text: string, pricePerSegment: number): number {
  return analyze(text).segments * pricePerSegment;
}
