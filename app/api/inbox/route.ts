import { listIngestionJobs, listMeetingImports } from "@/lib/store";
export async function GET() {
  const [jobs, meetings] = await Promise.all([
    listIngestionJobs(),
    listMeetingImports(),
  ]);
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
}
