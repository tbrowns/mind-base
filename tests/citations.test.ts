import { describe, expect, it } from "vitest";
import { groupByDocument, selectContexts } from "@/lib/ai";
import { conversationIdOf } from "@/lib/types";

const chunk = (documentId: string, text: string) => ({
  documentId,
  documentTitle: documentId.toUpperCase(),
  text,
});

describe("citation numbering", () => {
  it("gives each document one number, in first-seen order", () => {
    const groups = groupByDocument([
      chunk("handbook", "a"),
      chunk("policy", "b"),
      chunk("handbook", "c"),
    ]);
    expect(groups.map((g) => g[0].documentId)).toEqual(["handbook", "policy"]);
    expect(groups[0].map((c) => c.text)).toEqual(["a", "c"]);
  });

  it("falls back to the title when a chunk has no document id", () => {
    const groups = groupByDocument([
      { documentTitle: "Memo", text: "a" },
      { documentTitle: "Memo", text: "b" },
    ]);
    expect(groups).toHaveLength(1);
  });

  it("drops empty chunks before numbering, so sources match what the model saw", () => {
    const used = selectContexts([chunk("a", ""), chunk("b", "text")]);
    expect(used.map((c) => c.documentId)).toEqual(["b"]);
  });
});

describe("conversations", () => {
  it("treats a chat saved before conversations existed as its own conversation", () => {
    expect(conversationIdOf({ id: "chat-1" })).toBe("chat-1");
    expect(conversationIdOf({ id: "chat-2", conversationId: "conv-9" })).toBe("conv-9");
  });
});
