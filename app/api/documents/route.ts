import { listChats, listDocuments } from "@/lib/store";

export async function GET() {
  const [documents, chats] = await Promise.all([listDocuments(), listChats()]);

  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0);

  return Response.json({
    documents,
    totals: {
      documents: documents.length,
      chunks: totalChunks,
      questions: chats.length,
    },
    chats,
  });
}
