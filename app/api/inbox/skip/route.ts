import {
  getIngestionJobUnchecked,
  updateEmailImportByJob,
  updateIngestionJob,
  updateMeetingImportByJob,
} from "@/lib/store";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { canAdministerWorkspace } from "@/lib/authz";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string };
    const { scope } = await authorize(request, workspaceIdFrom(request, body));

    const jobId = body.jobId;
    const job = jobId ? await getIngestionJobUnchecked(jobId) : null;

    // Same 404-for-everything rule as documents: holding an id proves nothing.
    if (!job || job.workspaceId !== scope.workspaceId) {
      throw new HttpError(404, "Inbox item not found.");
    }
    if (job.ownerId !== scope.userId && !canAdministerWorkspace(scope)) {
      throw new HttpError(404, "Inbox item not found.");
    }

    await updateIngestionJob(job.id, { status: "skipped" });
    if (job.sourceType === "gmail") {
      await updateEmailImportByJob(job.id, { status: "skipped" });
    } else {
      await updateMeetingImportByJob(job.id, { status: "skipped" });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
