import { listChatsFor, listDocuments } from "@/lib/store";
import { authorize, errorResponse, workspaceIdFrom } from "@/lib/auth";
import { canRetrieveDocument } from "@/lib/authz";

/**
 * The library as this member sees it: shared documents at or below their tier,
 * plus their own private uploads. Admins use /api/admin/documents for the
 * governance view, which is a separate, audited surface.
 */
export async function GET(request: Request) {
  try {
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const [all, chats] = await Promise.all([
      listDocuments(scope.workspaceId),
      listChatsFor(scope.workspaceId, scope.userId),
    ]);

    const documents = all.filter((doc) => canRetrieveDocument(scope, doc));

    return Response.json({
      documents,
      totals: {
        documents: documents.length,
        chunks: documents.reduce((sum, doc) => sum + doc.chunkCount, 0),
        questions: chats.length,
      },
      chats,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
