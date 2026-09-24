import { canRetrieveDocument } from "./authz";
import type { AccessScope, DocumentRecord } from "./types";

/** The chat never shows more than this many suggested questions at once. */
export const MAX_SUGGESTIONS = 4;

/**
 * How many the server offers. The chat drops ones the user has already asked
 * and shows the first MAX_SUGGESTIONS of the rest, so it sends a few spare.
 */
export const SUGGESTION_CANDIDATES = 8;

const MAX_QUESTION_LENGTH = 120;

function normalise(question: string): string {
  return question.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Pull clean questions out of a model reply. Models wrap JSON in prose or code
 * fences, number their items, and occasionally ignore the masking rules, so
 * this accepts either {"questions": [...]} or a bare array anywhere in the
 * text and drops anything unusable rather than failing.
 */
export function parseSuggestedQuestions(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const questions: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    let question = item
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^["'“]+|["'”]+$/g, "")
      .trim();
    // A question quoting masked data would only confuse the reader.
    if (!question || /\[masked/i.test(question)) continue;
    if (question.length > MAX_QUESTION_LENGTH) continue;
    if (!question.endsWith("?")) question += "?";

    const key = normalise(question);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
    if (questions.length === MAX_SUGGESTIONS) break;
  }
  return questions;
}

/** Used for documents stored before suggestions existed, or when generation failed. */
export function fallbackQuestion(document: Pick<DocumentRecord, "title">) {
  return `What are the key points in "${document.title}"?`;
}

/**
 * Suggested questions for this user, newest documents first, taking one
 * question from each document in turn so several documents are represented.
 *
 * Only documents the user may retrieve contribute. A suggestion is derived
 * from a document's content, so showing one from a private or higher-tier
 * document would leak what that document says.
 */
export function pickSuggestions(
  scope: AccessScope,
  documents: DocumentRecord[],
  limit = SUGGESTION_CANDIDATES,
): string[] {
  const pools = [...documents]
    .filter((doc) => doc.status === "ready" && canRetrieveDocument(scope, doc))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map((doc) =>
      doc.suggestedQuestions?.length
        ? doc.suggestedQuestions
        : [fallbackQuestion(doc)],
    );

  const seen = new Set<string>();
  const picked: string[] = [];
  const longest = Math.max(0, ...pools.map((pool) => pool.length));
  for (let round = 0; round < longest && picked.length < limit; round++) {
    for (const pool of pools) {
      const question = pool[round];
      if (!question) continue;
      const key = normalise(question);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(question);
      if (picked.length === limit) break;
    }
  }
  return picked;
}

/** The ones to show: not already asked by this user, at most MAX_SUGGESTIONS. */
export function unaskedSuggestions(
  suggestions: string[],
  askedQuestions: string[],
): string[] {
  const asked = new Set(askedQuestions.map(normalise));
  return suggestions
    .filter((question) => !asked.has(normalise(question)))
    .slice(0, MAX_SUGGESTIONS);
}
