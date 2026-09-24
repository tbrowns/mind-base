import { describe, expect, it } from "vitest";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { mergeChunks, passageRanges } from "@/lib/chunks";

/** Same settings ingestDocument uses. */
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const paragraph = (n: number) =>
  `Section ${n}. ` +
  Array.from(
    { length: 12 },
    (_, i) => `Clause ${n}.${i} sets out rule number ${i} for team ${n}.`,
  ).join(" ");

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("mergeChunks", () => {
  it("rebuilds a document from the splitter's overlapping chunks", async () => {
    const original = Array.from({ length: 6 }, (_, i) => paragraph(i + 1)).join("\n\n");
    const chunks = await splitter.splitText(original);
    expect(chunks.length).toBeGreaterThan(3);
    // The splitter drops the whitespace it split on, so compare the words.
    expect(squash(mergeChunks(chunks))).toBe(squash(original));
  });

  it("does not repeat the overlapping text", async () => {
    const original = paragraph(1) + " " + paragraph(2) + " " + paragraph(3);
    const merged = mergeChunks(await splitter.splitText(original));
    expect(merged.match(/Clause 2\.5 /g)).toHaveLength(1);
  });

  it("joins chunks with no real overlap as separate paragraphs", () => {
    expect(mergeChunks(["First part ends with e", "every new part"])).toBe(
      "First part ends with e\n\nevery new part",
    );
  });

  it("returns a single chunk unchanged and skips empty ones", () => {
    expect(mergeChunks(["", "Only chunk", ""])).toBe("Only chunk");
  });
});

describe("passageRanges", () => {
  const text = "Alpha beta gamma delta epsilon zeta eta theta";

  it("finds each passage and merges ranges that overlap or touch", () => {
    expect(passageRanges(text, ["beta gamma", "gamma delta", "theta"])).toEqual([
      [6, 22],
      [40, 45],
    ]);
  });

  it("skips passages that are not in the text", () => {
    expect(passageRanges(text, ["omega", "  eta theta  "])).toEqual([[36, 45]]);
  });
});
