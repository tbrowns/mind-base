import { describe, expect, it } from "vitest";
import {
  fallbackQuestion,
  MAX_SUGGESTIONS,
  parseSuggestedQuestions,
  pickSuggestions,
  unaskedSuggestions,
} from "@/lib/suggestions";
import type { AccessScope, DocumentRecord } from "@/lib/types";

const WS = "ws-acme";

function scope(over: Partial<AccessScope> = {}): AccessScope {
  return {
    workspaceId: WS,
    userId: "user-ann",
    role: "member",
    accessLevels: ["all-team"],
    ...over,
  };
}

let uploaded = 0;
function doc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  uploaded++;
  return {
    id: `doc-${uploaded}`,
    workspaceId: WS,
    ownerId: "user-bob",
    ownerEmail: "bob@acme.test",
    visibility: "shared",
    title: `Doc ${uploaded}`,
    description: "",
    accessLevel: "all-team",
    uploadedAt: `2026-09-${String(10 + uploaded).padStart(2, "0")}T00:00:00.000Z`,
    status: "ready",
    chunkCount: 1,
    ...over,
  };
}

describe("parseSuggestedQuestions", () => {
  it("reads the requested JSON shape", () => {
    expect(
      parseSuggestedQuestions('{"questions": ["When is leave approved?", "Who signs off expenses?"]}'),
    ).toEqual(["When is leave approved?", "Who signs off expenses?"]);
  });

  it("finds JSON wrapped in prose or a code fence, or a bare array", () => {
    expect(
      parseSuggestedQuestions('Here you go:\n```json\n{"questions": ["What is the budget?"]}\n```'),
    ).toEqual(["What is the budget?"]);
    expect(parseSuggestedQuestions('["What is the budget?"]')).toEqual([
      "What is the budget?",
    ]);
  });

  it("cleans numbering and quotes, adds a missing question mark, drops duplicates", () => {
    expect(
      parseSuggestedQuestions(
        '{"questions": ["1. \\"How many leave days are there\\"", "how many leave days are there?"]}',
      ),
    ).toEqual(["How many leave days are there?"]);
  });

  it("drops questions that quote masked data or run too long", () => {
    expect(
      parseSuggestedQuestions(
        `{"questions": ["Who is on [masked phone number]?", "${"Why ".repeat(40)}?", "What is the refund window?"]}`,
      ),
    ).toEqual(["What is the refund window?"]);
  });

  it("never returns more than the chat shows", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Question number ${i}?`);
    expect(parseSuggestedQuestions(JSON.stringify({ questions: many }))).toHaveLength(
      MAX_SUGGESTIONS,
    );
  });

  it("returns nothing for replies it cannot use", () => {
    expect(parseSuggestedQuestions("Sorry, I can't help with that.")).toEqual([]);
    expect(parseSuggestedQuestions("{not json}")).toEqual([]);
    expect(parseSuggestedQuestions('{"questions": "What?"}')).toEqual([]);
  });
});

describe("pickSuggestions", () => {
  it("takes one question from each document in turn, newest first", () => {
    const older = doc({ suggestedQuestions: ["Old A?", "Old B?"] });
    const newer = doc({ suggestedQuestions: ["New A?", "New B?"] });
    expect(pickSuggestions(scope(), [older, newer])).toEqual([
      "New A?",
      "Old A?",
      "New B?",
      "Old B?",
    ]);
  });

  it("uses a title-based question for documents stored before suggestions existed", () => {
    const legacy = doc({ title: "Staff handbook" });
    expect(pickSuggestions(scope(), [legacy])).toEqual([fallbackQuestion(legacy)]);
  });

  /*
   * A suggestion is derived from a document's content, so it can reveal what
   * the document says. These are the cases where showing one would leak.
   */
  it("ignores someone else's private document", () => {
    const secret = doc({ visibility: "private", suggestedQuestions: ["What is Bob's salary?"] });
    expect(pickSuggestions(scope(), [secret])).toEqual([]);
  });

  it("includes the user's own private document", () => {
    const mine = doc({
      visibility: "private",
      ownerId: "user-ann",
      suggestedQuestions: ["What did I note about the audit?"],
    });
    expect(pickSuggestions(scope(), [mine])).toEqual(["What did I note about the audit?"]);
  });

  it("ignores documents above the user's access tier", () => {
    const board = doc({ accessLevel: "management", suggestedQuestions: ["What is the exit plan?"] });
    expect(pickSuggestions(scope(), [board])).toEqual([]);
    expect(
      pickSuggestions(scope({ accessLevels: ["all-team", "management"] }), [board]),
    ).toEqual(["What is the exit plan?"]);
  });

  it("ignores other workspaces and documents that are not ready", () => {
    expect(
      pickSuggestions(scope(), [
        doc({ workspaceId: "ws-other", suggestedQuestions: ["Elsewhere?"] }),
        doc({ status: "processing", suggestedQuestions: ["Not yet?"] }),
      ]),
    ).toEqual([]);
  });
});

describe("unaskedSuggestions", () => {
  it("drops questions already asked, ignoring case and spacing, and caps at four", () => {
    const offered = ["A one?", "B two?", "C three?", "D four?", "E five?", "F six?"];
    expect(unaskedSuggestions(offered, ["  b TWO? "])).toEqual([
      "A one?",
      "C three?",
      "D four?",
      "E five?",
    ]);
  });
});
