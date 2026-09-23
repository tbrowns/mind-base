import { deleteChat, getChatUnchecked } from "@/lib/store";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { canReadChat } from "@/lib/authz";

type Context = { params: Promise<{ id: string }> };

/**
 * Only the author can delete a chat, the same rule as reading one. Someone
 * else's chat returns 404 rather than 403 so ids cannot be probed.
 */
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const chat = await getChatUnchecked(id);
    if (!chat || !canReadChat(scope, chat)) {
      throw new HttpError(404, "Chat not found.");
    }
    await deleteChat(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
