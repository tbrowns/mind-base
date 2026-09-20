import { authorizeAdmin, errorResponse, HttpError } from "@/lib/auth";
import {
  createNotification,
  getJoinRequest,
  listJoinRequests,
  listMembers,
  recordAudit,
  saveJoinRequest,
  saveMembership,
  membershipId,
} from "@/lib/workspaces";
import type { JoinRequest, Membership } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await authorizeAdmin(request, id);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as
      | JoinRequest["status"]
      | null;
    return Response.json({
      requests: await listJoinRequests(id, status ?? undefined),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Approve or reject a pending request. */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { user } = await authorizeAdmin(request, id);
    const body = (await request.json()) as {
      requestId?: string;
      decision?: "approve" | "reject";
    };

    if (!body.requestId) throw new HttpError(400, "Which request?");
    if (body.decision !== "approve" && body.decision !== "reject") {
      throw new HttpError(400, "Decision must be approve or reject.");
    }

    const joinRequest = await getJoinRequest(body.requestId);
    if (!joinRequest || joinRequest.workspaceId !== id) {
      throw new HttpError(404, "Request not found.");
    }
    if (joinRequest.status !== "pending") {
      throw new HttpError(409, "That request has already been decided.");
    }

    const decidedAt = new Date().toISOString();
    const approved = body.decision === "approve";

    if (approved) {
      // New members start at the lowest tier as plain members. Widening
      // someone's access should be a separate, deliberate, audited act.
      const membership: Membership = {
        id: membershipId(id, joinRequest.userId),
        workspaceId: id,
        userId: joinRequest.userId,
        email: joinRequest.email,
        displayName: joinRequest.displayName,
        role: "member",
        accessLevel: "all-team",
        joinedAt: decidedAt,
      };
      await saveMembership(membership);
    }

    await saveJoinRequest({
      ...joinRequest,
      status: approved ? "approved" : "rejected",
      decidedAt,
      decidedBy: user.userId,
    });

    await recordAudit({
      workspaceId: id,
      actor: user,
      action: approved ? "join-request.approved" : "join-request.rejected",
      targetType: "join-request",
      targetId: joinRequest.id,
      detail: joinRequest.email,
    });

    if (approved) {
      await createNotification({
        workspaceId: id,
        userId: joinRequest.userId,
        fromUserId: user.userId,
        body: "Your request to join was approved.",
      });
    }

    return Response.json({ ok: true, approved, members: await listMembers(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
