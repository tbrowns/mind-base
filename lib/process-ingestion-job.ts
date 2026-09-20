import "server-only";
import { ingestDocument } from "./ingest";
import {
  getIngestionJobUnchecked,
  updateEmailImportByJob,
  updateIngestionJob,
  updateMeetingImportByJob,
} from "./store";
import { canAdministerWorkspace } from "./authz";
import type { AccessScope } from "./types";

/**
 * Turn a reviewed inbox item into an indexed document.
 *
 * The scope is required so that holding a job id is not by itself permission
 * to process it: the job must belong to the caller's workspace, and to the
 * caller unless they administer that workspace.
 */
export async function processIngestionJob(jobId: string, scope: AccessScope) {
  const job = await getIngestionJobUnchecked(jobId);
  if (!job || job.workspaceId !== scope.workspaceId) {
    throw new Error("Inbox item not found.");
  }
  if (job.ownerId !== scope.userId && !canAdministerWorkspace(scope)) {
    throw new Error("Inbox item not found.");
  }

  if (job.status === "completed" && job.documentId) {
    return { documentId: job.documentId, chunkCount: 0 };
  }

  await updateIngestionJob(jobId, { status: "processing", error: undefined });

  try {
    const document = await ingestDocument({
      workspaceId: job.workspaceId,
      ownerId: job.ownerId,
      ownerEmail: job.ownerEmail,
      visibility: job.visibility,
      title: job.title,
      description:
        job.sourceType === "gmail"
          ? "Imported from the Mindbase Inbox."
          : "Imported meeting transcript or notes.",
      text: job.rawText,
      accessLevel: job.accessLevel,
      sourceType: job.sourceType,
      metadata: job.metadata,
    });

    await updateIngestionJob(jobId, {
      status: "completed",
      documentId: document.id,
    });

    const completion = { status: "completed" as const, documentId: document.id };
    if (job.sourceType === "gmail") {
      await updateEmailImportByJob(jobId, completion);
    } else {
      await updateMeetingImportByJob(jobId, completion);
    }

    return { documentId: document.id, chunkCount: document.chunkCount };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document processing failed.";
    await updateIngestionJob(jobId, { status: "failed", error: message });
    if (job.sourceType === "gmail") {
      await updateEmailImportByJob(jobId, { status: "failed" });
    } else {
      await updateMeetingImportByJob(jobId, { status: "failed" });
    }
    throw new Error(message);
  }
}
