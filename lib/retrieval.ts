import { querySimilarChunks } from "./vectorstore";
import type { ChunkMetadata, PineconeChunkMatch } from "./vectorstore";
import { canRetrieveChunk } from "./authz";
import type { AccessLevel, AccessScope, ChunkRecord } from "./types";

const DEFAULT_ACCESS_LEVEL = "all-team";
const ACCESS_LEVELS: AccessLevel[] = [
  "all-team",
  "management",
  "management-investees",
];
const MIN_LEXICAL_RELEVANCE = 0.16;
const MIN_VECTOR_RELEVANCE = 0.58;
const STOP_WORDS = new Set([
  "a",
  "about",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "get",
  "give",
  "had",
  "has",
  "have",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "need",
  "of",
  "on",
  "or",
  "our",
  "please",
  "should",
  "show",
  "tell",
  "that",
  "the",
  "their",
  "there",
  "this",
  "to",
  "up",
  "us",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "you",
]);

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asAccessLevel(value: unknown): AccessLevel {
  const accessLevel = asString(value, DEFAULT_ACCESS_LEVEL);

  return ACCESS_LEVELS.includes(accessLevel as AccessLevel)
    ? (accessLevel as AccessLevel)
    : DEFAULT_ACCESS_LEVEL;
}

function normalizeTerm(term: string) {
  if (term.length > 5 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 4 && term.endsWith("ed")) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith("s")) return term.slice(0, -1);
  return term;
}

function terms(value: string) {
  const matches = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  return matches
    .map(normalizeTerm)
    .filter((term) => (term.length > 1 || /\d/.test(term)) && !STOP_WORDS.has(term));
}

function termSet(value: string) {
  return new Set(terms(value));
}

function normalizedPhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lexicalRelevance(question: string, chunk: ChunkRecord) {
  const questionTerms = [...termSet(question)];

  if (!questionTerms.length) {
    return 0;
  }

  const chunkText = `${chunk.documentTitle} ${chunk.maskedText || chunk.text}`;
  const chunkTerms = termSet(chunkText);
  const titleTerms = termSet(chunk.documentTitle);
  const overlap = questionTerms.filter((term) => chunkTerms.has(term)).length;
  const titleOverlap = questionTerms.filter((term) => titleTerms.has(term)).length;
  const overlapScore = overlap / questionTerms.length;
  const titleScore = titleOverlap / questionTerms.length;
  const phrase = normalizedPhrase(question);
  const phraseBoost =
    phrase.length > 14 && normalizedPhrase(chunkText).includes(phrase) ? 0.25 : 0;

  return Math.min(1, overlapScore * 0.8 + titleScore * 0.15 + phraseBoost);
}

function vectorRelevance(score?: number) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function isRelevant(lexicalScore: number, vectorScore: number) {
  return (
    lexicalScore >= MIN_LEXICAL_RELEVANCE ||
    vectorScore >= 0.74 ||
    (vectorScore >= MIN_VECTOR_RELEVANCE && lexicalScore >= 0.04)
  );
}

function getChunkText(fields: ChunkMetadata) {
  return (
    asString((fields as Record<string, unknown>)["chunk_text"]).trim() ||
    asString(fields.maskedText).trim() ||
    asString(fields.text).trim() ||
    asString(fields.pageContent).trim() ||
    asString(fields.chunkText).trim() ||
    asString(fields.content).trim()
  );
}

function toChunkRecord(match: PineconeChunkMatch): ChunkRecord | null {
  // Pinecone's searchRecords returns `fields` on hits; fall back to `metadata` for compatibility
  const fields: ChunkMetadata =
    ((match as Record<string, unknown>)["fields"] as ChunkMetadata) ??
    match.metadata ??
    {};
  const text = getChunkText(fields);

  if (!text) {
    return null;
  }

  const documentId = asString(fields.documentId);
  const chunkIndex = asNumber(fields.chunkIndex, 0);

  return {
    id:
      asString(fields.id) ||
      asString(match.id) ||
      `${documentId || "document"}-${chunkIndex}`,
    workspaceId: asString(fields.workspaceId),
    ownerId: asString(fields.ownerId),
    // Absent visibility means a pre-tenancy record: treat as private so it
    // cannot surface to anyone but a matching owner id (i.e. nobody).
    visibility: asString(fields.visibility) === "shared" ? "shared" : "private",
    documentId,
    documentTitle:
      asString(fields.documentTitle) ||
      asString(fields.title) ||
      "Untitled document",
    chunkIndex,
    text,
    maskedText: asString(fields.maskedText) || text,
    score: asNumber(match.score, 0),
    embedding: [],
    embeddingModel: "llama-text-embed-v2",
    embeddingDimensions: 0,
    embeddingVersion: 1,
    accessLevel: asAccessLevel(fields.accessLevel),
    createdAt: asString(fields.createdAt) || new Date().toISOString(),
  };
}

/**
 * Retrieve chunks the caller is entitled to see.
 *
 * Three independent gates, deliberately redundant: the Pinecone namespace
 * (workspace), the Pinecone metadata filter (visibility and tier), and
 * canRetrieveChunk below. A bug in any one of them is caught by the others,
 * and the last gate is the same pure function the test suite exercises.
 */
export async function searchDocuments(
  scope: AccessScope,
  question: string,
  limit = 10,
): Promise<ChunkRecord[]> {
  const normalizedQuestion = question.trim();
  const accessLevels = scope.accessLevels;

  if (!normalizedQuestion || limit <= 0 || !accessLevels.length) {
    return [];
  }

  try {
    const candidateLimit = Math.min(Math.max(limit * 4, 12), 40);
    const results = await querySimilarChunks({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      query: normalizedQuestion,
      accessLevels,
      limit: candidateLimit,
    });

    return results
      .map(toChunkRecord)
      .filter((chunk): chunk is ChunkRecord => Boolean(chunk))
      .map((chunk) => ({
        ...chunk,
        // Pinecone namespaces are per workspace, so a hit is by construction
        // from this one; stamp it so the authz check has a complete record
        // even when the metadata predates the field.
        workspaceId: chunk.workspaceId || scope.workspaceId,
      }))
      .filter((chunk) => canRetrieveChunk(scope, chunk))
      .map((chunk) => {
        const lexicalScore = lexicalRelevance(normalizedQuestion, chunk);
        const vectorScore = vectorRelevance(chunk.score);
        const relevanceScore = Math.max(
          lexicalScore,
          vectorScore * (lexicalScore > 0 ? 0.9 : 0.55),
        );

        return { chunk, lexicalScore, vectorScore, relevanceScore };
      })
      .filter(({ lexicalScore, vectorScore }) =>
        isRelevant(lexicalScore, vectorScore),
      )
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map(({ chunk, relevanceScore }) => ({
        ...chunk,
        relevanceScore,
      }))
      .slice(0, limit);
  } catch (error) {
    console.error("Error searching documents:", error);
    return [];
  }
}
