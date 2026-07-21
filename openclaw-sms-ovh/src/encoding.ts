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

/** Does this text fit in one standalone SMS, whatever encoding it lands in? */
export function fitsOneSms(text: string): boolean {
  return analyze(text).segments <= 1;
}

/**
 * Split text so that every part is exactly one billed SMS.
 *
 * This is the only splitter the send path may use, because the send path posts
 * one OVH job per part: each part is an independent message, not a slice of a
 * concatenated one. A splitter that counts characters cannot know that. "ê"
 * followed by 152 plain characters is 153 characters and three segments, since
 * one accented character re-encodes the whole message to UCS-2 at 70 units.
 * Counting characters and billing segments is how a six-segment ceiling ends
 * up sending seven messages.
 *
 * So parts are measured the way they are billed: septets under GSM-7 (two for
 * the extension characters), UTF-16 code units under UCS-2, against the
 * STANDALONE capacity of 160 or 70. The concatenated capacities of 153 and 67
 * do not apply here: they exist to make room for a UDH that a standalone
 * message does not carry.
 *
 * `maxChars` still caps a part if one is given, so the configured limit keeps
 * working. It can only make parts shorter, never longer than one SMS.
 */
export function chunkForSms(text: string, maxChars?: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const fits = (candidate: string): boolean =>
    fitsOneSms(candidate) && (maxChars === undefined || candidate.length <= maxChars);

  const parts: string[] = [];
  let rest = trimmed;

  while (rest.length > 0) {
    if (fits(rest)) {
      parts.push(rest);
      break;
    }

    // Longest prefix that still fits, by bisection. Valid because adding
    // characters can only add units and can only push GSM-7 to UCS-2, never
    // back, so "fits" is monotonic in prefix length.
    let low = 1;
    let high = rest.length;
    let best = 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (fits(rest.slice(0, mid))) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Never cut between a surrogate pair: half an emoji is a replacement
    // character on the handset and still costs its unit.
    if (best > 1 && isHighSurrogate(rest.charCodeAt(best - 1))) best -= 1;

    const window = rest.slice(0, best);
    let cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"));
    // A single unbroken token longer than one SMS: hard-cut it.
    if (cut <= 0) cut = best;

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  return parts.filter((part) => part.length > 0);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * How many SMS this text costs to send, which is how many parts it becomes.
 *
 * Use this for anything that spends money. `analyze().segments` answers a
 * different question, the one about a concatenated message, and the send path
 * does not send concatenated messages.
 */
export function smsPartCount(text: string, maxChars?: number): number {
  return chunkForSms(text, maxChars).length;
}

/**
 * Split text on character count alone.
 *
 * Kept for callers that genuinely want a character limit and are not paying
 * per part. It does NOT guarantee that a part is one SMS: it counts UTF-16
 * length, while billing counts septets or code units. Anything on the send
 * path wants `chunkForSms`.
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
 * Marker appended to a reply that was cut short.
 *
 * Three ASCII dots rather than an ellipsis character on purpose. `…` is absent
 * from GSM 03.38, so using it would re-encode the entire message as UCS-2 and
 * halve its capacity, in order to make room for the sign that we had run out of
 * room. The leading space keeps it off the end of the last word.
 */
export const TRUNCATION_MARKER = " [...]";

/**
 * Cut text down until it fits inside `maxSegments`, marking that it was cut.
 *
 * This is a spend ceiling, not a formatting nicety. An agent that answers a
 * one-line question with nine paragraphs is a real and recurring failure mode,
 * and on a metered channel it is charged to the user per segment rather than
 * merely being annoying to read.
 *
 * Segment count is monotonic in prefix length: appending characters can only
 * add units, and can only push the encoding from GSM-7 to UCS-2, never back.
 * So the longest prefix that fits can be found by bisection.
 */
/**
 * Cut text down until it costs at most `maxParts` messages, marking the cut.
 *
 * The ceiling the send path actually needs. `truncateToSegments` bounds the
 * segments of one concatenated message; this bounds the number of separate
 * messages that `chunkForSms` will produce, which is what gets billed.
 *
 * Part count is monotonic in prefix length for the same reason segment count
 * is, so the longest prefix that fits is found by bisection.
 */
export function truncateToSmsParts(
  text: string,
  maxParts: number,
  options: { maxChars?: number; marker?: string } = {},
): string {
  if (maxParts <= 0) throw new RangeError("maxParts must be positive");
  const marker = options.marker ?? TRUNCATION_MARKER;

  const trimmed = text.trim();
  if (smsPartCount(trimmed, options.maxChars) <= maxParts) return trimmed;

  const fits = (length: number): boolean =>
    smsPartCount(trimmed.slice(0, length).trimEnd() + marker, options.maxChars) <= maxParts;

  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }

  const prefix = trimmed.slice(0, low).trimEnd();
  const lastSpace = prefix.lastIndexOf(" ");
  const body = lastSpace >= 0 && prefix.length - lastSpace <= 40 ? prefix.slice(0, lastSpace) : prefix;

  return (body + marker).trim();
}

export function truncateToSegments(
  text: string,
  maxSegments: number,
  marker: string = TRUNCATION_MARKER,
): string {
  if (maxSegments <= 0) throw new RangeError("maxSegments must be positive");

  const trimmed = text.trim();
  if (analyze(trimmed).segments <= maxSegments) return trimmed;

  const fits = (length: number): boolean =>
    analyze(trimmed.slice(0, length).trimEnd() + marker).segments <= maxSegments;

  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }

  const prefix = trimmed.slice(0, low).trimEnd();
  // Back off to a word boundary only when one is close by. A distant space
  // means the tail is a single long token, and discarding it to reach that
  // space would throw away far more than the half-word it saves.
  const lastSpace = prefix.lastIndexOf(" ");
  const body = lastSpace >= 0 && prefix.length - lastSpace <= 40 ? prefix.slice(0, lastSpace) : prefix;

  return (body + marker).trim();
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
