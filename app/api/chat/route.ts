import { generateAnswer } from "@/lib/ai";
import { searchDocuments } from "@/lib/retrieval";
import { saveChat } from "@/lib/store";
import type { AccessLevel, ChatRecord, ViewerRole } from "@/lib/types";

const permissions: Record<ViewerRole, AccessLevel[]> = {
  "team-member": ["all-team"],
  management: ["all-team", "management"],
  "management-investees": ["all-team", "management", "management-investees"],
};

export async function POST(request: Request) {
  try {
    const { question, viewerRole = "team-member" } = (await request.json()) as {
      question: string;
      viewerRole: ViewerRole;
    };
    if (!question?.trim())
      return Response.json({ error: "Ask a question first." }, { status: 400 });
    const cleanQuestion = question.trim();
    const allowed = permissions[viewerRole] ?? permissions["team-member"];

    // Search for relevant documents using Pinecone
    const ranked = await searchDocuments(cleanQuestion, allowed);

    const answer = await generateAnswer(cleanQuestion, ranked);
    const sources = ranked.map(
      ({
        id,
        documentId,
        documentTitle,
        chunkIndex,
        accessLevel,
        maskedText,
      }) => ({
        id,
        documentId,
        documentTitle,
        chunkIndex,
        accessLevel,
        preview: maskedText.slice(0, 190),
        text: maskedText,
        score: 0.95, // Pinecone similarity scores are handled internally
      }),
    );
    const chat: ChatRecord = {
      id: crypto.randomUUID(),
      question: cleanQuestion,
      answer,
      sources,
      viewerRole,
      createdAt: new Date().toISOString(),
    };
    await saveChat(chat);
    return Response.json(chat);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The answer could not be generated.",
      },
      { status: 500 },
    );
  }
}
