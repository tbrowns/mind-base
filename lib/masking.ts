export function maskSensitiveData(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[masked email]")
    .replace(/(?<!\w)(?:\+?\d[\s().-]?){8,15}(?!\w)/g, "[masked phone number]")
    .replace(/\b[A-Z]\d{9}[A-Z]\b/g, "[masked KRA PIN]")
    .replace(/\b(?:ID|National ID|Passport)(?:\s*(?:No\.?|Number|#))?\s*[:\-]?\s*[A-Z0-9-]{5,}\b/gi, "[masked ID number]");
}
