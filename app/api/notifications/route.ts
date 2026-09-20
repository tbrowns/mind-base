import { authorize, authorizeAdmin, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import {
  createNotification,
  getMembership,
  listMembers,
  listNotificationsFor,
  markNotificationRead,
  recordAudit,
} from "@/lib/workspaces";
import { NOTIFICATION_MAX_LENGTH } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { scope } = await authorize(request, workspaceIdFrom(request));
    return Response.json({
      notifications: await listNotificationsFor(scope.workspaceId, scope.userId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Send a short notice to one member, or to everyone in the workspace. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      userId?: string | null;
      body?: string;
    };
    const workspaceId = workspaceIdFrom(request, body);
    const { scope, user } = await authorizeAdmin(request, workspaceId);

    const text = body.body?.trim() ?? "";
    if (!text) throw new HttpError(400, "Write a message first.");
    if (text.length > NOTIFICATION_MAX_LENGTH) {
      throw new HttpError(
        400,
        `Keep it under ${NOTIFICATION_MAX_LENGTH} characters.`,
      );
    }

    const target = body.userId ?? null;
    if (target) {
      // Only to someone who is actually here, so this cannot be used to send
      // mail to arbitrary account ids.
      const membership = await getMembership(workspaceId, target);
      if (!membership) throw new HttpError(404, "That person is not a member.");
    }

    const notification = await createNotification({
      workspaceId,
      userId: target,
      fromUserId: scope.userId,
      body: text,
    });

    await recordAudit({
      workspaceId,
      actor: user,
      action: "notification.sent",
      targetType: "member",
      targetId: target ?? "all",
      detail: text.slice(0, 80),
    });

    const recipients = target ? 1 : (await listMembers(workspaceId)).length;
    return Response.json({ notification, recipients }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; workspaceId?: string };
    const { scope } = await authorize(request, workspaceIdFrom(request, body));
    if (!body.id) throw new HttpError(400, "Which notification?");
    await markNotificationRead(body.id, scope.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
