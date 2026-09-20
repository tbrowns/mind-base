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

  it("handles several kinds at once", () => {
    const masked = maskSensitiveData(
      "Ann (ann@acme.co.ke, 0712345678) paid with 4111 1111 1111 1111",
    );
    expect(masked).toContain("[masked email]");
    expect(masked).toContain("[masked phone number]");
    expect(masked).toContain("[masked card number]");
  });
});
