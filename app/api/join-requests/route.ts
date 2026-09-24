import {
  authenticate,
  errorResponse,
  HttpError,
  requireFullAccount,
} from "@/lib/auth";
import {
  createJoinRequest,
  findWorkspaceByJoinCode,
  getMembership,
} from "@/lib/workspaces";

/**
 * Ask to join an org workspace using the code an admin shared.
 *
 * Lookup is by code rather than by name or id so that this endpoint cannot be
 * used to discover which organisations exist. A wrong code and a real code for
 * a workspace you already belong to are both answered the same way as far as
 * possible.
 */
export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    requireFullAccount(user, "join a workspace");
    const body = (await request.json()) as { joinCode?: string; message?: string };

    const code = body.joinCode?.trim() ?? "";
    if (!code) throw new HttpError(400, "Enter the workspace code.");

    const workspace = await findWorkspaceByJoinCode(code);
    if (!workspace || workspace.type !== "org") {
      throw new HttpError(404, "No workspace matches that code.");
    }

    const existing = await getMembership(workspace.id, user.userId);
    if (existing) {
      return Response.json({
        status: "already-a-member",
        workspace: { id: workspace.id, name: workspace.name },
      });
    }

    const joinRequest = await createJoinRequest({
      workspaceId: workspace.id,
      user,
      message: body.message,
    });

    return Response.json(
      {
        status: joinRequest.status,
        // Only the name is echoed back -- not the member list, settings or id
        // of a workspace this person has not been admitted to yet.
        workspace: { name: workspace.name },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
