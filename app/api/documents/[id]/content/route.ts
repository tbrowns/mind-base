import { getDocumentUnchecked } from "@/lib/store";
import { fetchDocumentChunks } from "@/lib/vectorstore";
import { mergeChunks } from "@/lib/chunks";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { canRetrieveDocument } from "@/lib/authz";

type Context = { params: Promise<{ id: string }> };

/**
 * The whole text of a document, for reading it from a chat citation.
 *
 * Same rule as retrieval: if the user could not have been answered from this
 * document, they cannot read it here either, and a document they may not see
 * is reported as missing rather than forbidden. Admins inspect other people's
 * private files through the audited admin view, not this.
 */
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const result = await getDocumentUnchecked(id);
    if (!result || !canRetrieveDocument(scope, result.document)) {
      throw new HttpError(404, "Document not found.");
    }
    const { document } = result;

    const chunkIds = Array.isArray(document.metadata?.pineconeChunkIds)
      ? (document.metadata.pineconeChunkIds as string[])
      : [];
    const chunks = await fetchDocumentChunks(document.workspaceId, chunkIds);

    return Response.json({
      document: {
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        accessLevel: document.accessLevel,
        visibility: document.visibility,
        uploadedAt: document.uploadedAt,
      },
      text: mergeChunks(chunks.map((chunk) => chunk.text)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
