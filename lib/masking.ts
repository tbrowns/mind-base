/**
 * Redact personal data before anything is stored or sent to a model.
 *
 * The rules are applied in order, and the order matters: each pattern consumes
 * the text it matches, so a broad rule running early will eat the input a
 * specific rule was meant to catch. Cards therefore go first, and the catch-all
 * for long digit runs goes last.
 *
 * Phone numbers are recognised by shape -- a leading +, a Kenyan 254 or trunk
 * 0, an area code in brackets -- not by digit count. The old "any 8 to 15
 * digits" rule also swallowed ISO dates (2026-06-28), spaced amounts
 * (12 500 000) and reference numbers, which wrecked answers about deadlines
 * and money once every upload went through masking.
 *
 * Masking still leans towards over-masking where a number could identify a
 * person or an account: a stray long digit run is hidden even if it turns out
 * to be harmless, because under-masking puts someone's account number in a
 * vector database.
 */

const PHONE = "[masked phone number]";

/** Keep a +number only if it has a plausible phone length (E.164 allows 15). */
function maskInternational(match: string): string {
  const digits = (match.match(/\d/g) ?? []).length;
  return digits >= 8 && digits <= 15 ? PHONE : match;
}

const RULES: Array<{ pattern: RegExp; replace: string | ((m: string) => string) }> = [
  // Cards first: 13-19 digits, optionally grouped. Checked by digit count so
  // that the separators do not have to be guessed exactly.
  {
    pattern: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    replace: (match) => {
      const digits = (match.match(/\d/g) ?? []).length;
      return digits >= 13 && digits <= 19 ? "[masked card number]" : match;
    },
  },
  { pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, replace: "[masked email]" },
  // KRA PIN: letter, nine digits, letter.
  { pattern: /\b[A-Z]\d{9}[A-Z]\b/g, replace: "[masked KRA PIN]" },
  // An ID or passport number that announced itself with a label. The value
  // must contain a digit: the label is matched case-insensitively, and without
  // that, prose such as "the id field" or "Firebase ID tokens" was masked.
  {
    pattern:
      /\b(?:ID|National ID|Passport)(?:\s*(?:No\.?|Number|#))?\s*[:\-]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,}\b/gi,
    replace: "[masked ID number]",
  },
  // International form: +254 712 345 678, +1 (415) 555-2671. Must end on a
  // digit, so a full stop after the number survives.
  { pattern: /\+\d[\d\s().-]{6,18}\d/g, replace: maskInternational },
  // Kenyan country code without the plus: 254712345678.
  {
    pattern: /(?<![\w-])254[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}(?![\w-])/g,
    replace: PHONE,
  },
  // Trunk 0: mobiles (0712 345 678, 0712345678) and landlines (020 2345678).
  {
    pattern: /(?<![\w-])0\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}(?![\w-])/g,
    replace: PHONE,
  },
  // Area code in brackets: (020) 234 5678.
  { pattern: /\(\d{2,4}\)\s?\d{3,4}[\s-]?\d{3,4}(?![\w-])/g, replace: PHONE },
  // North American grouping: 415-555-2671.
  { pattern: /(?<![\w-])\d{3}[.-]\d{3}[.-]\d{4}(?![\w-])/g, replace: PHONE },
  // Last: any other unbroken run of ten or more digits -- bank accounts,
  // member numbers. Shorter runs are too often years, amounts or references.
  { pattern: /(?<![\w-])\d{10,}(?![\w-])/g, replace: "[masked number]" },
];

export function maskSensitiveData(text: string) {
  return RULES.reduce(
    (value, rule) =>
      value.replace(rule.pattern, rule.replace as string & ((m: string) => string)),
    text,
  );
}
