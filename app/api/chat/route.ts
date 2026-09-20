import { generateAnswer } from "@/lib/ai";
import type { ConversationTurn } from "@/lib/ai";
import { searchDocuments } from "@/lib/retrieval";
import { listChatsFor, saveChat } from "@/lib/store";
import { authorize, errorResponse, workspaceIdFrom } from "@/lib/auth";
import type { AccessScope, ChatRecord, ViewerRole } from "@/lib/types";

/**
 * Two things used to be wrong here and both are fixed by deriving rather than
 * trusting:
 *
 *  1. `viewerRole` arrived in the request body, so a caller could name their
 *     own clearance. It now comes from the stored membership.
 *  2. With no history supplied, the route fell back to the last five chats in
 *     the *whole database* filtered by role, and fed them to the model. That
 *     put one user's questions and answers into another user's prompt. History
 *     is now read back for this user in this workspace only.
 */

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

/** The stored label for a chat, kept for display only. Never used to authorize. */
function viewerRoleFor(scope: AccessScope): ViewerRole {
  const highest = scope.accessLevels[scope.accessLevels.length - 1];
  if (highest === "management-investees") return "management-investees";
  if (highest === "management") return "management";
  return "team-member";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      workspaceId?: string;
      history?: unknown;
    };

    const { scope } = await authorize(request, workspaceIdFrom(request, body));

    const cleanQuestion = body.question?.trim() ?? "";
    if (!cleanQuestion) {
      return Response.json({ error: "Ask a question first." }, { status: 400 });
    }

    const requestHistory = cleanHistory(body.history);
    const ranked = await searchDocuments(scope, cleanQuestion);

    const remembered =
      requestHistory.length > 0
        ? requestHistory
        : (await listChatsFor(scope.workspaceId, scope.userId, 5))
            .reverse()
            .map(({ question, answer }) => ({ question, answer }));

    const answer = await generateAnswer(cleanQuestion, ranked, remembered);

    const chat: ChatRecord = {
      id: crypto.randomUUID(),
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      question: cleanQuestion,
      answer,
      sources: ranked.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        visibility: chunk.visibility,
        chunkIndex: chunk.chunkIndex,
        accessLevel: chunk.accessLevel,
        preview: chunk.maskedText.slice(0, 190),
        text: chunk.maskedText,
        score: chunk.relevanceScore ?? chunk.score ?? 0,
      })),
      viewerRole: viewerRoleFor(scope),
      createdAt: new Date().toISOString(),
    };

    await saveChat(chat);
    return Response.json(chat);
  } catch (error) {
    return errorResponse(error);
  }
}

/** A user's own conversation history. There is no variant of this for admins. */
export async function GET(request: Request) {
  try {
    const { scope } = await authorize(request, workspaceIdFrom(request));
    const chats = await listChatsFor(scope.workspaceId, scope.userId);
    return Response.json({ chats });
  } catch (error) {
    return errorResponse(error);
  }
}
