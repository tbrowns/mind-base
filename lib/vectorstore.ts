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

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

// Initialize a Pinecone client with your API key
const pc = new Pinecone({ apiKey: requiredEnv("PINECONE_API_KEY") });
// Create an index for dense vectors with integrated embedding (skip if already exists)
const indexName = requiredEnv("PINECONE_INDEX");
const existingIndexes = await pc.listIndexes();
if (!existingIndexes.indexes?.some((idx) => idx.name === indexName)) {
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

// Target the index
const index = pc.index(indexName).namespace("example-namespace");

export async function addDocuments(
  docs: ({ text: string; chunk_text: string } & RecordMetadata)[],
) {
  await index.upsertRecords(docs);
}

export async function querySimilarChunks(
  query: string,
  accessLevels: string[],
  limit = 10,
): Promise<PineconeChunkMatch[]> {
  // Search the index
  const results = await index.searchRecords({
    query: {
      topK: limit,
      inputs: { text: query },
      filter: { accessLevel: { $in: accessLevels } },
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
      "createdAt",
    ],
  });

  // // Print the results
  // results.result.hits.forEach((hit: any) => {
  //   console.log(
  //     `id: ${hit.id}, score: ${hit.score.toFixed(2)}, category: ${hit.fields.category}, text: ${hit.fields.chunk_text}`,
  //   );
  // });

  return (results.result.hits ?? []) as PineconeChunkMatch[];
}
