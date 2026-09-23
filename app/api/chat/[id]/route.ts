import { deleteConversation } from "@/lib/store";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/**
 * Delete one of the caller's conversations, every turn of it. The store only
 * matches the caller's own chats in this workspace, so someone else's
 * conversation id finds nothing and returns 404, the same as a missing one.
 */
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const removed = await deleteConversation(scope.workspaceId, scope.userId, id);
    if (!removed) throw new HttpError(404, "Conversation not found.");
    return Response.json({ ok: true, removed });
  } catch (error) {
    return errorResponse(error);
  }
}
