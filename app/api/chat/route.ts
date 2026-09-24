import { generateAnswer, selectContexts } from "@/lib/ai";
import type { ConversationTurn } from "@/lib/ai";
import { searchDocuments } from "@/lib/retrieval";
import { listChatsFor, listDocuments, saveChat } from "@/lib/store";
import { pickSuggestions } from "@/lib/suggestions";
import { authorize, errorResponse, workspaceIdFrom } from "@/lib/auth";
import { conversationIdOf } from "@/lib/types";
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

/**
 * A conversation id is only a grouping label: every read and delete is also
 * scoped to this user and workspace, so a guessed or foreign id can at worst
 * start a thread of the caller's own. Anything malformed starts a new one.
 */
function conversationIdFrom(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value)
    ? value
    : crypto.randomUUID();
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
      conversationId?: unknown;
    };

    const { scope } = await authorize(request, workspaceIdFrom(request, body));

    const cleanQuestion = body.question?.trim() ?? "";
    if (!cleanQuestion) {
      return Response.json({ error: "Ask a question first." }, { status: 400 });
    }

    const conversationId = conversationIdFrom(body.conversationId);
    const requestHistory = cleanHistory(body.history);
    // Only the chunks the answer is built from become its sources, so every
    // document listed under an answer is one the model actually saw.
    const used = selectContexts(await searchDocuments(scope, cleanQuestion));

    // Memory comes from this conversation only: a fresh chat should not be
    // steered by whatever the user asked in an unrelated one.
    const remembered =
      requestHistory.length > 0
        ? requestHistory
        : (await listChatsFor(scope.workspaceId, scope.userId, 200))
            .filter((chat) => conversationIdOf(chat) === conversationId)
            .slice(0, 5)
            .reverse()
            .map(({ question, answer }) => ({ question, answer }));

    const answer = await generateAnswer(cleanQuestion, used, remembered);

    const chat: ChatRecord = {
      id: crypto.randomUUID(),
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      conversationId,
      question: cleanQuestion,
      answer,
      sources: used.map((chunk) => ({
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

/**
 * A user's own conversation history, plus suggested questions from documents
 * they can read. There is no variant of this for admins.
 */
export async function GET(request: Request) {
  try {
    const { scope } = await authorize(request, workspaceIdFrom(request));
    const [chats, documents] = await Promise.all([
      // Enough turns to rebuild recent conversations whole; the client groups them.
      listChatsFor(scope.workspaceId, scope.userId, 300),
      listDocuments(scope.workspaceId),
    ]);
    // Filtered to documents this user may read: a question reveals content.
    const suggestions = pickSuggestions(scope, documents);
    return Response.json({ chats, suggestions });
  } catch (error) {
    return errorResponse(error);
  }
}
