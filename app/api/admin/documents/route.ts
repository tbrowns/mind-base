import { authorizeAdmin, errorResponse, workspaceIdFrom } from "@/lib/auth";
import { listDocuments } from "@/lib/store";
import { listMembers } from "@/lib/workspaces";

/**
 * The governance view: every file in the workspace, including private ones,
 * with who uploaded it.
 *
 * This is the surface the product means by "admins can see user files". It is
 * deliberately separate from retrieval -- an admin sees that a private file
 * exists and can act on it, but it never becomes an invisible citation inside
 * one of their own answers.
 */
export async function GET(request: Request) {
  try {
    const workspaceId = workspaceIdFrom(request);
    await authorizeAdmin(request, workspaceId);

    const [documents, members] = await Promise.all([
      listDocuments(workspaceId),
      listMembers(workspaceId),
    ]);

    const nameFor = new Map(
      members.map((m) => [m.userId, m.displayName || m.email]),
    );

    return Response.json({
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        fileType: doc.fileType,
        visibility: doc.visibility,
        accessLevel: doc.accessLevel,
        uploadedAt: doc.uploadedAt,
        chunkCount: doc.chunkCount,
        sourceType: doc.sourceType,
        ownerId: doc.ownerId,
        ownerEmail: doc.ownerEmail,
        ownerName: nameFor.get(doc.ownerId) ?? doc.ownerEmail,
        // Former members keep their files; flag it so the list makes sense.
        ownerIsMember: nameFor.has(doc.ownerId),
      })),
      totals: {
        documents: documents.length,
        shared: documents.filter((d) => d.visibility === "shared").length,
        private: documents.filter((d) => d.visibility === "private").length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
