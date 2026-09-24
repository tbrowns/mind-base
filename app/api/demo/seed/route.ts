import { demoQuestions, demoText } from "@/lib/demo";
import { ingestDocument } from "@/lib/ingest";
import { listDocuments } from "@/lib/store";
import { authorize, errorResponse, workspaceIdFrom } from "@/lib/auth";

/** Seeds the demo document into the caller's own workspace. */
export async function POST(request: Request) {
  try {
    const { scope, user } = await authorize(request, workspaceIdFrom(request));

    const existing = (await listDocuments(scope.workspaceId)).find(
      (d) => d.title === "Mindbase Demo Guide",
    );
    if (existing) return Response.json({ document: existing, existing: true });

    const document = await ingestDocument({
      workspaceId: scope.workspaceId,
      ownerId: scope.userId,
      ownerEmail: user.email,
      visibility: "shared",
      title: "Mindbase Demo Guide",
      description:
        "2026 MiniHack rules, deliverables, dates, and bounty guidance.",
      text: demoText,
      accessLevel: "all-team",
      fileName: "mindbase-demo-guide.txt",
      fileType: "text/plain",
      suggestedQuestions: demoQuestions,
    });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
