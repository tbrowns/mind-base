import { describe, expect, it } from "vitest";
import { maskSensitiveData } from "@/lib/masking";

describe("maskSensitiveData", () => {
  it("masks email addresses", () => {
    expect(maskSensitiveData("write to ann@acme.co.ke today")).toBe(
      "write to [masked email] today",
    );
  });

  it("masks Kenyan phone numbers", () => {
    expect(maskSensitiveData("call +254712345678")).toContain("[masked phone number]");
    expect(maskSensitiveData("call 0712 345 678")).toContain("[masked phone number]");
  });

  it("masks KRA PINs", () => {
    expect(maskSensitiveData("PIN A123456789Z")).toContain("[masked KRA PIN]");
  });

  it("masks ID and passport numbers", () => {
    expect(maskSensitiveData("National ID No. 29384756")).toContain("[masked ID number]");
    expect(maskSensitiveData("Passport No: AK0123456")).toBe("[masked ID number]");
    expect(maskSensitiveData("national id: 29384756")).toBe("[masked ID number]");
  });

  // Found on a real document: every match of the old rule there was prose.
  it("leaves the word id alone when no number follows it", () => {
    for (const text of [
      "Firebase ID tokens expire hourly.",
      "Set the id field on each record.",
      "Each Id matches exactly one workspace.",
    ]) {
      expect(maskSensitiveData(text)).toBe(text);
    }
  });

  /*
   * The reason this file exists. A knowledge base that ingests invoices and
   * email will meet a card number eventually, and the phone rule used to eat
   * the first twelve digits of one and leave the last four in storage.
   */
  it("masks card numbers, spaced or not", () => {
    expect(maskSensitiveData("card 4111111111111111")).toBe("card [masked card number]");
    expect(maskSensitiveData("card 4111 1111 1111 1111")).toBe("card [masked card number]");
    expect(maskSensitiveData("card 4111-1111-1111-1111")).toBe("card [masked card number]");
  });

  it("leaves no run of card digits behind", () => {
    const masked = maskSensitiveData("Paid with 4111 1111 1111 1111 on Tuesday");
    expect(masked).not.toMatch(/\d{4}/);
    expect(masked).toContain("on Tuesday");
  });

  it("masks a 15-digit Amex", () => {
    expect(maskSensitiveData("amex 3782 822463 10005")).toContain("[masked card number]");
  });

  it("leaves ordinary numbers alone", () => {
    expect(maskSensitiveData("we shipped 42 units in 2026")).toBe(
      "we shipped 42 units in 2026",
    );
  });

  /*
   * Every upload is masked now, so a false positive is no longer confined to
   * email imports: masking a deadline or an amount breaks ordinary answers.
   */
  it("leaves dates, amounts and reference numbers alone", () => {
    for (const text of [
      "Submissions close on 2026-06-28 at 17:00.",
      "The budget is KES 12 500 000 for the year.",
      "Invoice INV-2026-000123 is due.",
      "Reference number 20260628 applies.",
      "Meeting at 08:30, 0.5% fee, versions 1.2.3.",
    ]) {
      expect(maskSensitiveData(text)).toBe(text);
    }
  });

  it("masks phone numbers in the common written forms", () => {
    for (const phone of [
      "0712 345 678",
      "0712345678",
      "+254 712 345 678",
      "254712345678",
      "020 2345678",
      "(020) 234 5678",
      "+1 (415) 555-2671",
      "415-555-2671",
    ]) {
      expect(maskSensitiveData(`call ${phone} today`)).toBe(
        "call [masked phone number] today",
      );
    }
  });

  it("keeps the full stop after a phone number", () => {
    expect(maskSensitiveData("Call +254 712 345 678.")).toBe(
      "Call [masked phone number].",
    );
  });

  it("masks long unbroken digit runs such as account numbers", () => {
    expect(maskSensitiveData("account 1234567890 at the bank")).toBe(
      "account [masked number] at the bank",
    );
  });

  it("is idempotent, so already-masked imports are not changed again", () => {
    const once = maskSensitiveData(
      "Ann (ann@acme.co.ke, 0712345678) paid with 4111 1111 1111 1111",
    );
    expect(maskSensitiveData(once)).toBe(once);
  });

  it("handles several kinds at once", () => {
    const masked = maskSensitiveData(
      "Ann (ann@acme.co.ke, 0712345678) paid with 4111 1111 1111 1111",
    );
    expect(masked).toContain("[masked email]");
    expect(masked).toContain("[masked phone number]");
    expect(masked).toContain("[masked card number]");
  });
});
