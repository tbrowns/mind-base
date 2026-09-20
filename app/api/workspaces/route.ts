import { authenticate, errorResponse, HttpError } from "@/lib/auth";
import {
  createWorkspace,
  ensurePersonalWorkspace,
  listMembershipsForUser,
  listWorkspacesForUser,
} from "@/lib/workspaces";
import type { MemberRole } from "@/lib/types";

/**
 * The workspaces this user belongs to, with their role in each.
 *
 * Calling this also creates the personal workspace if it is missing, so a
 * brand-new account always has somewhere to work without a separate setup step.
 */
export async function GET(request: Request) {
  try {
    const user = await authenticate(request);
    await ensurePersonalWorkspace(user);

    const [workspaces, memberships] = await Promise.all([
      listWorkspacesForUser(user.userId),
      listMembershipsForUser(user.userId),
    ]);

    const roleFor = new Map<string, MemberRole>(
      memberships.map((m) => [m.workspaceId, m.role]),
    );

    return Response.json({
      user,
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        role: roleFor.get(workspace.id) ?? "member",
        // The join code is an invitation credential: only show it to someone
        // who can actually admit people.
        joinCode:
          roleFor.get(workspace.id) === "member" ? undefined : workspace.joinCode,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() ?? "";
    if (!name) throw new HttpError(400, "Give the workspace a name.");
    if (name.length > 80) throw new HttpError(400, "That name is too long.");

    const workspace = await createWorkspace({ name, type: "org", owner: user });
    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
