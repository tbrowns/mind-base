import { deleteDocument, getDocumentUnchecked } from "@/lib/store";
import { deleteDocumentVectors } from "@/lib/vectorstore";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { canDeleteDocument, canRetrieveDocument } from "@/lib/authz";
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
