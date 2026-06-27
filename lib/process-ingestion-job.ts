import "server-only";
import { ingestDocument } from "./ingest";
import { getIngestionJob, updateEmailImportByJob, updateIngestionJob, updateMeetingImportByJob } from "./store";

export async function processIngestionJob(jobId: string) {
  const job = await getIngestionJob(jobId); if (!job) throw new Error("Inbox item not found.");
  if (job.status === "completed" && job.documentId) return { documentId: job.documentId, chunkCount: 0 };
  await updateIngestionJob(jobId, { status: "processing", error: undefined });
  try {
    const document = await ingestDocument({ title: job.title, description: job.sourceType === "gmail" ? "Imported from the Mindbase Inbox." : "Imported meeting transcript or notes.", text: job.rawText, accessLevel: job.accessLevel, sourceType: job.sourceType, metadata: job.metadata });
    await updateIngestionJob(jobId, { status: "completed", documentId: document.id });
    if (job.sourceType === "gmail") await updateEmailImportByJob(jobId, { status: "completed", documentId: document.id }); else await updateMeetingImportByJob(jobId, { status: "completed", documentId: document.id });
    return { documentId: document.id, chunkCount: document.chunkCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document processing failed."; await updateIngestionJob(jobId, { status: "failed", error: message });
    if (job.sourceType === "gmail") await updateEmailImportByJob(jobId, { status: "failed" }); else await updateMeetingImportByJob(jobId, { status: "failed" }); throw new Error(message);
  }
}
