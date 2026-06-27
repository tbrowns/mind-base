import { generateAnswer } from "@/lib/ai";
import type { ConversationTurn } from "@/lib/ai";
import { searchDocuments } from "@/lib/retrieval";
import { listChats, saveChat } from "@/lib/store";
import type { AccessLevel, ChatRecord, ViewerRole } from "@/lib/types";

const permissions: Record<ViewerRole, AccessLevel[]> = {
  "team-member": ["all-team"],
  management: ["all-team", "management"],
  "management-investees": ["all-team", "management", "management-investees"],
};

function cleanHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const question =
        typeof record.question === "string" ? record.question.trim() : "";
      const answer =
        typeof record.answer === "string" ? record.answer.trim() : "";

      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is ConversationTurn => Boolean(item))
    .slice(-5);
}

export async function POST(request: Request) {
  try {
    const {
      question,
      viewerRole = "team-member",
      history,
    } = (await request.json()) as {
      question: string;
      viewerRole: ViewerRole;
      history?: ConversationTurn[];
    };
    if (!question?.trim())
      return Response.json({ error: "Ask a question first." }, { status: 400 });
    const cleanQuestion = question.trim();
    const allowed = permissions[viewerRole] ?? permissions["team-member"];
    const requestHistory = cleanHistory(history);

    // Search for relevant documents using Pinecone
    const ranked = await searchDocuments(cleanQuestion, allowed);
    const remembered =
      requestHistory.length > 0
        ? requestHistory
        : (await listChats())
            .filter((item) => item.viewerRole === viewerRole)
            .slice(0, 5)
            .reverse()
            .map(({ question, answer }) => ({ question, answer }));

    const answer = await generateAnswer(cleanQuestion, ranked, remembered);
    const sources = ranked.map(
      ({
        id,
        documentId,
        documentTitle,
        chunkIndex,
        accessLevel,
        maskedText,
        score,
        relevanceScore,
      }) => ({
        id,
        documentId,
        documentTitle,
        chunkIndex,
        accessLevel,
        preview: maskedText.slice(0, 190),
        text: maskedText,
        score: relevanceScore ?? score ?? 0,
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
