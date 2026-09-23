import {
  deleteDocument,
  getDocumentUnchecked,
  updateDocumentAccessLevel,
} from "@/lib/store";
import { deleteDocumentVectors, updateVectorMetadata } from "@/lib/vectorstore";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import {
  canChangeDocumentAccess,
  canDeleteDocument,
  canRetrieveDocument,
} from "@/lib/authz";
import { ACCESS_LEVEL_ORDER, accessLabels } from "@/lib/types";
import type { AccessLevel } from "@/lib/types";
import { recordAudit } from "@/lib/workspaces";

type Context = { params: Promise<{ id: string }> };

/**
 * A missing document and a forbidden one both return 404. Distinguishing them
 * would let a caller probe for the existence of documents in workspaces they
 * are not part of.
 */
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const result = await getDocumentUnchecked(id);
    if (!result || !canRetrieveDocument(scope, result.document)) {
      throw new HttpError(404, "Document not found.");
    }
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope, user } = await authorize(request, workspaceIdFrom(request));

    const result = await getDocumentUnchecked(id);
    if (!result || result.document.workspaceId !== scope.workspaceId) {
      throw new HttpError(404, "Document not found.");
    }
    if (!canDeleteDocument(scope, result.document)) {
      throw new HttpError(403, "You cannot delete this document.");
    }

    // Vectors first: a stale vector pointing at a deleted document would keep
    // answering questions from content the owner believes is gone.
    const chunkIds = Array.isArray(result.document.metadata?.pineconeChunkIds)
      ? (result.document.metadata.pineconeChunkIds as string[])
      : [];
    if (chunkIds.length) {
      await deleteDocumentVectors(scope.workspaceId, chunkIds);
    }
    await deleteDocument(id);

    // Deleting someone else's file is a privileged act and leaves a trail.
    if (result.document.ownerId !== scope.userId) {
      await recordAudit({
        workspaceId: scope.workspaceId,
        actor: user,
        action: "document.deleted-by-admin",
        targetType: "document",
        targetId: id,
        detail: `"${result.document.title}" owned by ${result.document.ownerEmail}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Re-file a document at another access tier. */
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { accessLevel?: unknown };
    const { scope, user } = await authorize(
      request,
      workspaceIdFrom(request, body),
    );

    const requested = body.accessLevel;
    if (
      typeof requested !== "string" ||
      !(ACCESS_LEVEL_ORDER as string[]).includes(requested)
    ) {
      throw new HttpError(400, "Choose a valid access level.");
    }
    const accessLevel = requested as AccessLevel;

    const result = await getDocumentUnchecked(id);
    if (!result || result.document.workspaceId !== scope.workspaceId) {
      throw new HttpError(404, "Document not found.");
    }
    const { document } = result;
    if (!canChangeDocumentAccess(scope, document)) {
      throw new HttpError(403, "You cannot change who can access this document.");
    }
    // Same rule as upload: filing above your own tier would hide the document
    // from you the moment it saved.
    if (!scope.accessLevels.includes(accessLevel)) {
      throw new HttpError(403, "You cannot file a document at that access level.");
    }
    if (document.accessLevel === accessLevel) {
      return Response.json({ document });
    }

    // Vectors first, because they are what chat searches. If this fails part
    // way, the library still shows the old tier and saving again finishes the
    // job; the reverse order could show a tier that search does not enforce.
    const chunkIds = Array.isArray(document.metadata?.pineconeChunkIds)
      ? (document.metadata.pineconeChunkIds as string[])
      : [];
    await updateVectorMetadata(scope.workspaceId, chunkIds, { accessLevel });
    await updateDocumentAccessLevel(id, accessLevel);

    if (document.ownerId !== scope.userId) {
      await recordAudit({
        workspaceId: scope.workspaceId,
        actor: user,
        action: "document.access-changed-by-admin",
        targetType: "document",
        targetId: id,
        detail: `"${document.title}" owned by ${document.ownerEmail}: ${accessLabels[document.accessLevel]} to ${accessLabels[accessLevel]}`,
      });
    }

    return Response.json({ document: { ...document, accessLevel } });
  } catch (error) {
    return errorResponse(error);
  }
}
