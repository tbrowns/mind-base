import { processIngestionJob } from "@/lib/process-ingestion-job";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string };
    const { scope } = await authorize(request, workspaceIdFrom(request, body));

    if (!body.jobId) {
      throw new HttpError(400, "Select an inbox item to process.");
    }
    // Ownership is checked inside processIngestionJob against this scope.
    return Response.json(await processIngestionJob(body.jobId, scope));
  } catch (error) {
    return errorResponse(error);
  }
}
