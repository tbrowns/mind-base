import { listIngestionJobs, listMeetingImports } from "@/lib/store";
import { authorize, errorResponse, workspaceIdFrom } from "@/lib/auth";
import { canAdministerWorkspace } from "@/lib/authz";

export async function GET(request: Request) {
  try {
    const { scope } = await authorize(request, workspaceIdFrom(request));

    const [all, meetings] = await Promise.all([
      listIngestionJobs(scope.workspaceId),
      listMeetingImports(),
    ]);

    // Members review their own imports; admins review the workspace's.
    const jobs = canAdministerWorkspace(scope)
      ? all
      : all.filter((job) => job.ownerId === scope.userId);

    return Response.json({
      jobs,
      summary: {
        pending: jobs.filter((job) => job.status === "needs_review").length,
        automated: jobs.filter((job) => job.status === "completed").length,
        latestMeeting:
          meetings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
          null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
