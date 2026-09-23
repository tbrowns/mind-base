import "server-only";
import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";

export type ChunkMetadata = Record<string, unknown> & {
  id?: string;
  documentId?: string;
  documentTitle?: string;
  title?: string;
  chunkIndex?: number | string;
  text?: string;
  maskedText?: string;
  pageContent?: string;
  chunkText?: string;
  content?: string;
  accessLevel?: string;
  workspaceId?: string;
  ownerId?: string;
  visibility?: string;
  createdAt?: string;
};

export type PineconeChunkMatch = {
  id?: string;
  score?: number;
  fields?: ChunkMetadata;
  metadata?: ChunkMetadata;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/**
 * Lazily created client and index.
 *
 * This used to run at module scope, with a top-level `await pc.listIndexes()`.
 * That made importing the module a network call -- it ran on every cold start,
 * and any file that merely referenced a type from here paid for it.
 */
let clientPromise: Promise<Pinecone> | undefined;
let indexReady: Promise<string> | undefined;

function client(): Promise<Pinecone> {
  clientPromise ??= Promise.resolve(
    new Pinecone({ apiKey: requiredEnv("PINECONE_API_KEY") }),
  );
  return clientPromise;
}

async function ensureIndex(): Promise<string> {
  indexReady ??= (async () => {
    const pc = await client();
    const indexName = requiredEnv("PINECONE_INDEX");
    const existing = await pc.listIndexes();
    if (!existing.indexes?.some((idx) => idx.name === indexName)) {
      await pc.createIndexForModel({
        name: indexName,
        cloud: "aws",
        region: "us-east-1",
        embed: {
          model: "llama-text-embed-v2",
          fieldMap: { text: "chunk_text" },
        },
        waitUntilReady: true,
      });
    }
    return indexName;
  })();
  return indexReady;
}

/**
 * Vectors are partitioned by workspace using Pinecone namespaces.
 *
 * A namespace is a hard boundary: a query issued against one cannot return a
 * record from another, whatever the filter says. Relying on a metadata filter
 * alone would mean one forgotten `where` clause leaks another organisation's
 * documents, so tenancy is enforced by the storage layout and visibility is
 * enforced by the filter on top of it.
 */
async function namespaceFor(workspaceId: string) {
  if (!workspaceId) throw new Error("A workspace is required.");
  const pc = await client();
  const indexName = await ensureIndex();
  return pc.index(indexName).namespace(`ws-${workspaceId}`);
}

export async function addDocuments(
  workspaceId: string,
  docs: ({ text: string; chunk_text: string } & RecordMetadata)[],
) {
  if (!docs.length) return;
  const ns = await namespaceFor(workspaceId);
  await ns.upsertRecords(docs);
}

export async function deleteDocumentVectors(
  workspaceId: string,
  chunkIds: string[],
) {
  if (!chunkIds.length) return;
  const ns = await namespaceFor(workspaceId);
  await ns.deleteMany(chunkIds);
}

/**
 * Rewrite metadata fields on existing records without re-embedding them.
 * Pinecone merges the given fields into what is stored, so the chunk text and
 * everything else on the record is left alone.
 */
export async function updateVectorMetadata(
  workspaceId: string,
  chunkIds: string[],
  metadata: RecordMetadata,
) {
  if (!chunkIds.length) return;
  const ns = await namespaceFor(workspaceId);
  // Pinecone updates one record per call; a handful at a time keeps a long
  // document quick without tripping the rate limit.
  for (let i = 0; i < chunkIds.length; i += 10) {
    await Promise.all(
      chunkIds.slice(i, i + 10).map((id) => ns.update({ id, metadata })),
    );
  }
}

export async function querySimilarChunks(options: {
  workspaceId: string;
  userId: string;
  query: string;
  accessLevels: string[];
  limit?: number;
}): Promise<PineconeChunkMatch[]> {
  const { workspaceId, userId, query, accessLevels, limit = 10 } = options;
  if (!accessLevels.length) return [];

  const ns = await namespaceFor(workspaceId);
  const results = await ns.searchRecords({
    query: {
      topK: limit,
      inputs: { text: query },
      filter: {
        accessLevel: { $in: accessLevels },
        // Shared documents, plus the caller's own private ones. Records written
        // before visibility existed have no such field and so match neither
        // branch -- they stay hidden until migrated, which is the safe default.
        $or: [{ visibility: "shared" }, { ownerId: userId }],
      },
    },
    fields: [
      "chunk_text",
      "text",
      "maskedText",
      "documentId",
      "documentTitle",
      "title",
      "chunkIndex",
      "accessLevel",
      "workspaceId",
      "ownerId",
      "visibility",
      "createdAt",
    ],
  });

  return (results.result.hits ?? []) as PineconeChunkMatch[];
}
