import { ingestDocument } from "@/lib/ingest";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { checkFileAllowed } from "@/lib/authz";
import { consumeGuestQuota, GUEST_MAX_UPLOAD_CHARS } from "@/lib/quota";
import { ACCESS_LEVEL_ORDER } from "@/lib/types";
import type { AccessLevel, DocVisibility } from "@/lib/types";

/**
 * Fields are read individually rather than spread from the body. The previous
 * version did `ingestDocument({ ...body })`, which now would let a caller set
 * workspaceId and ownerId themselves and write into someone else's workspace.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { scope, user, workspace } = await authorize(
      request,
      workspaceIdFrom(request, body),
    );

    const fileName =
      typeof body.fileName === "string" ? body.fileName : undefined;
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : undefined;

    const allowed = checkFileAllowed(workspace.settings, fileName, fileSize);
    if (!allowed.ok) {
      throw new HttpError(400, allowed.reason);
    }

    const requested = body.accessLevel;
    const accessLevel: AccessLevel =
      typeof requested === "string" &&
      (ACCESS_LEVEL_ORDER as string[]).includes(requested)
        ? (requested as AccessLevel)
        : "all-team";

    // A member cannot file a document at a tier they cannot themselves read;
    // it would vanish from their own library the moment it was created.
    if (!scope.accessLevels.includes(accessLevel)) {
      throw new HttpError(403, "You cannot file a document at that access level.");
    }

    const visibility: DocVisibility =
      body.visibility === "private" ? "private" : "shared";

    const text = typeof body.text === "string" ? body.text : "";
    if (user.guest && text.length > GUEST_MAX_UPLOAD_CHARS) {
      throw new HttpError(
        413,
        "Demo uploads are limited to about fifteen pages. Create an account for longer documents.",
      );
    }
    // Last, so a request refused above does not use up an upload.
    await consumeGuestQuota(user, "uploads");

    const document = await ingestDocument({
      workspaceId: scope.workspaceId,
      ownerId: scope.userId,
      ownerEmail: user.email,
      visibility,
      title: typeof body.title === "string" ? body.title : "",
      description:
        typeof body.description === "string" ? body.description : undefined,
      text,
      accessLevel,
      fileName,
      fileType: typeof body.fileType === "string" ? body.fileType : undefined,
      sourceType: "manual",
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
