import { authorize, authorizeAdmin, errorResponse, HttpError } from "@/lib/auth";
import { canAssignRole, canManageMember } from "@/lib/authz";
import {
  getMembership,
  listMembers,
  recordAudit,
  removeMembership,
  saveMembership,
} from "@/lib/workspaces";
import { ACCESS_LEVEL_ORDER, MEMBER_ROLES } from "@/lib/types";
import type { AccessLevel, MemberRole } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Every member can see who else is in the workspace; only admins can change it. */
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await authorize(request, id);
    return Response.json({ members: await listMembers(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Change a member's role or access tier. */
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope, user } = await authorizeAdmin(request, id);
    const body = (await request.json()) as {
      userId?: string;
      role?: string;
      accessLevel?: string;
    };

    if (!body.userId) throw new HttpError(400, "Which member?");
    const target = await getMembership(id, body.userId);
    if (!target) throw new HttpError(404, "That person is not a member.");

    if (!canManageMember(scope, target)) {
      throw new HttpError(403, "You cannot change this member.");
    }

    let next = target;

    if (body.role !== undefined) {
      if (!(MEMBER_ROLES as readonly string[]).includes(body.role)) {
        throw new HttpError(400, "Unknown role.");
      }
      const role = body.role as MemberRole;
      if (!canAssignRole(scope, target, role)) {
        throw new HttpError(403, "You cannot grant a role above your own.");
      }
      next = { ...next, role };
      await recordAudit({
        workspaceId: id,
        actor: user,
        action: "member.role-changed",
        targetType: "member",
        targetId: target.userId,
        detail: `${target.email}: ${target.role} -> ${role}`,
      });
    }

    if (body.accessLevel !== undefined) {
      if (!(ACCESS_LEVEL_ORDER as string[]).includes(body.accessLevel)) {
        throw new HttpError(400, "Unknown access level.");
      }
      const accessLevel = body.accessLevel as AccessLevel;
      // An admin cannot grant sight of a tier they cannot see themselves.
      if (!scope.accessLevels.includes(accessLevel)) {
        throw new HttpError(403, "You cannot grant access above your own.");
      }
      next = { ...next, accessLevel };
      await recordAudit({
        workspaceId: id,
        actor: user,
        action: "member.access-changed",
        targetType: "member",
        targetId: target.userId,
        detail: `${target.email}: ${target.accessLevel} -> ${accessLevel}`,
      });
    }

    await saveMembership(next);
    return Response.json({ member: next });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Remove someone from the workspace.
 *
 * Their documents stay. Deleting a departing colleague's shared work as a side
 * effect of an HR action would be surprising and unrecoverable; an admin can
 * delete individual files deliberately, and that is audited.
 */
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope, user } = await authorizeAdmin(request, id);
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") ?? "";

    if (!userId) throw new HttpError(400, "Which member?");
    const target = await getMembership(id, userId);
    if (!target) throw new HttpError(404, "That person is not a member.");
    if (!canManageMember(scope, target)) {
      throw new HttpError(403, "You cannot remove this member.");
    }

    await removeMembership(id, userId);
    await recordAudit({
      workspaceId: id,
      actor: user,
      action: "member.removed",
      targetType: "member",
      targetId: userId,
      detail: `${target.email} removed; their documents were kept`,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
