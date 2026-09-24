import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { addDocuments } from "./vectorstore";
import { saveDocument } from "./store";
import { maskSensitiveData } from "./masking";
import { suggestQuestions } from "./ai";
import type { AccessLevel, DocVisibility, DocumentRecord } from "./types";

export async function ingestDocument(input: {
  /** Tenancy is required, not optional: an untenanted document is unreachable. */
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  visibility: DocVisibility;
  title: string;
  description?: string;
  text: string;
  accessLevel: AccessLevel;
  fileName?: string;
  fileType?: string;
  sourceType?: "manual" | "gmail" | "meeting";
  metadata?: Record<string, unknown>;
  /** Curated questions (the demo guide); skips generating them. */
  suggestedQuestions?: string[];
}) {
  if (!input.title.trim()) throw new Error("Please add a document title.");
  if (!input.text.trim())
    throw new Error("Add text to process or upload a text file.");

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // Split text into chunks using RecursiveCharacterTextSplitter
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  // Masked here, once, for every route in: manual uploads used to reach the
  // vector store unmasked although the upload page promised otherwise. Mail
  // and meeting imports arrive already masked, and masking is idempotent.
  const text = maskSensitiveData(input.text);
  const chunks = await splitter.splitText(text);

  const chunkIds = chunks.map((_, i) => `${id}-chunk-${i}`);

  const docs = chunks.map((chunkText, i) => ({
    id: chunkIds[i],
    chunk_text: chunkText,
    text: chunkText,
    documentId: id,
    documentTitle: input.title.trim(),
    accessLevel: input.accessLevel,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    visibility: input.visibility,
    source: input.fileName || "manual",
    sourceType: input.sourceType || "manual",
    chunkIndex: i,
    createdAt,
    ...input.metadata,
  }));

  // Questions are generated alongside the upsert, which takes a few seconds
  // anyway, so they add little to the wait.
  const [, suggestedQuestions] = await Promise.all([
    addDocuments(input.workspaceId, docs),
    input.suggestedQuestions ??
      suggestQuestions(input.title, text).catch((error: unknown) => {
        console.warn("Could not suggest questions for a document", error);
        return [];
      }),
  ]);

  // Create document record for metadata storage
  const document: DocumentRecord = {
    id,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    ownerEmail: input.ownerEmail,
    visibility: input.visibility,
    title: input.title.trim(),
    description: input.description?.trim() || "",
    fileName: input.fileName,
    fileType: input.fileType,
    accessLevel: input.accessLevel,
    uploadedAt: createdAt,
    status: "ready",
    chunkCount: chunks.length,
    suggestedQuestions,
    sourceType: input.sourceType ?? "manual",
    metadata: {
      ...input.metadata,
      pineconeChunkIds: chunkIds,
    },
  };

  // Save metadata to Firebase/local storage
  await saveDocument(document, []);

  return document;
}
