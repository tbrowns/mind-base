import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { addDocuments } from "./vectorstore";
import { saveDocument } from "./store";
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

  const chunks = await splitter.splitText(input.text);

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

  // Add documents to Pinecone vector store
  await addDocuments(input.workspaceId, docs);

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
