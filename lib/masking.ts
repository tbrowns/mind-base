/**
 * Redact personal data before anything is stored or sent to a model.
 *
 * The rules are applied in order, and the order is the whole design: each
 * pattern consumes the text it matches, so a greedy general rule running early
 * will eat the input a specific rule was meant to catch.
 *
 * The phone pattern is the greedy one - it accepts spaces, dots and dashes as
 * separators and any run of 8 to 15 digits. Left first, it swallows the leading
 * twelve digits of a spaced card number (leaving the last four in storage) and
 * relabels an 8-digit national ID as a phone number. So it goes last, and
 * anything with a recognisable shape of its own goes before it.
 *
 * The rules are deliberately greedy about what counts as sensitive.
 * Over-masking costs a little retrieval quality; under-masking puts someone's
 * card number in a vector database.
 */

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
  // An ID or passport number that announced itself with a label.
  {
    pattern:
      /\b(?:ID|National ID|Passport)(?:\s*(?:No\.?|Number|#))?\s*[:\-]?\s*[A-Z0-9-]{5,}\b/gi,
    replace: "[masked ID number]",
  },
  // Greediest, therefore last.
  { pattern: /(?<!\w)(?:\+?\d[\s().-]?){8,15}(?!\w)/g, replace: "[masked phone number]" },
];

export function maskSensitiveData(text: string) {
  return RULES.reduce(
    (value, rule) =>
      value.replace(rule.pattern, rule.replace as string & ((m: string) => string)),
    text,
  );
}
