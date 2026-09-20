import "server-only";
import { getAdminAuth } from "./firebase";
import { scopeFromMembership } from "./authz";
import { getMembership, getWorkspace } from "./workspaces";
import type { AccessScope, AuthUser, Workspace } from "./types";

/**
 * Turning an HTTP request into a proven identity and a set of rights.
 *
 * The rule this file exists to enforce: privileges are *derived*, never
 * *declared*. A request says which workspace it wants to act in; it does not
 * get to say who it is or what it may do. Both of those are looked up.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Convert a thrown HttpError into a Response; rethrow anything unexpected. */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return Response.json({ error: message }, { status: 500 });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join("");
  return token.length > 0 ? token : null;
}

/**
 * Verify the caller's Firebase ID token.
 *
 * `checkRevoked` is on: without it a token stays valid for up to an hour after
 * an account is disabled, which is exactly the window that matters when an
 * admin removes someone.
 */
export async function authenticate(request: Request): Promise<AuthUser> {
  const token = bearerToken(request);
  if (!token) {
    throw new HttpError(401, "Sign in to continue.");
  }
  let decoded;
  try {
    const auth = await getAdminAuth();
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    // Deliberately opaque: distinguishing "expired" from "malformed" from
    // "revoked" tells an attacker which of their guesses was closest.
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  if (!decoded.email) {
    throw new HttpError(403, "This account has no email address.");
  }
  return {
    userId: decoded.uid,
    email: decoded.email,
    displayName: decoded.name as string | undefined,
  };
}

export type ResolvedScope = {
  user: AuthUser;
  workspace: Workspace;
  scope: AccessScope;
};

/**
 * Resolve the caller's rights inside a named workspace.
 *
 * A non-member gets 404 rather than 403. 403 would confirm the workspace
 * exists, which is enough to enumerate an organisation's private workspaces by
 * guessing ids.
 */
export async function authorize(
  request: Request,
  workspaceId: string,
): Promise<ResolvedScope> {
  const user = await authenticate(request);
  if (!workspaceId) {
    throw new HttpError(400, "No workspace selected.");
  }

  const membership = await getMembership(workspaceId, user.userId);
  if (!membership) {
    throw new HttpError(404, "Workspace not found.");
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    throw new HttpError(404, "Workspace not found.");
  }

  return { user, workspace, scope: scopeFromMembership(membership) };
}

/** Read the target workspace from the request. Presence only -- never trust it for rights. */
export function workspaceIdFrom(request: Request, body?: unknown): string {
  const fromHeader = request.headers.get("x-workspace-id");
  if (fromHeader) return fromHeader.trim();

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("workspaceId");
  if (fromQuery) return fromQuery.trim();

  if (body && typeof body === "object" && "workspaceId" in body) {
    const value = (body as { workspaceId?: unknown }).workspaceId;
    if (typeof value === "string") return value.trim();
  }
  return "";
}

/** Require at least admin rights, for routes that administer a workspace. */
export async function authorizeAdmin(
  request: Request,
  workspaceId: string,
): Promise<ResolvedScope> {
  const resolved = await authorize(request, workspaceId);
  if (resolved.scope.role === "member") {
    throw new HttpError(403, "This action needs admin rights.");
  }
  return resolved;
}
