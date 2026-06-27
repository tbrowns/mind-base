import { querySimilarChunks } from "./vectorstore";
import type { ChunkMetadata, PineconeChunkMatch } from "./vectorstore";
import type { ChunkRecord } from "./types";

const DEFAULT_ACCESS_LEVEL = "all-team";

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
    documentId,
    documentTitle:
      asString(fields.documentTitle) ||
      asString(fields.title) ||
      "Untitled document",
    chunkIndex,
    text,
    maskedText: asString(fields.maskedText) || text,
    embedding: [],
    embeddingModel: "llama-text-embed-v2",
    embeddingDimensions: 0,
    embeddingVersion: 1,
    accessLevel: asString(fields.accessLevel, DEFAULT_ACCESS_LEVEL) as any,
    createdAt: asString(fields.createdAt) || new Date().toISOString(),
  };
}

export async function searchDocuments(
  question: string,
  accessLevels: string[],
  limit = 5,
): Promise<ChunkRecord[]> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion || limit <= 0 || !accessLevels.length) {
    return [];
  }

  try {
    const results = await querySimilarChunks(
      normalizedQuestion,
      accessLevels,
      limit,
    );

    return results
      .map(toChunkRecord)
      .filter((chunk): chunk is ChunkRecord => Boolean(chunk))
      .slice(0, limit);
  } catch (error) {
    console.error("Error searching documents:", error);
    return [];
  }
}
