import { processIngestionJob } from "@/lib/process-ingestion-job";
import { saveIngestionJob, saveMeetingImport } from "@/lib/store";
import { authorize, errorResponse, HttpError, workspaceIdFrom } from "@/lib/auth";
import { ACCESS_LEVEL_ORDER } from "@/lib/types";
import type {
  AccessLevel,
  DocVisibility,
  IngestionJob,
  MeetingImport,
} from "@/lib/types";
import { maskSensitiveData } from "@/lib/masking";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { scope, user } = await authorize(
      request,
      workspaceIdFrom(request, body),
    );

    const meetingTitle =
      typeof body.meetingTitle === "string" ? body.meetingTitle.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!meetingTitle) throw new HttpError(400, "Add a meeting title.");
    if (!text) throw new HttpError(400, "Paste the meeting transcript or notes.");

    const requested = body.accessLevel;
    const accessLevel: AccessLevel =
      typeof requested === "string" &&
      (ACCESS_LEVEL_ORDER as string[]).includes(requested)
        ? (requested as AccessLevel)
        : "all-team";
    if (!scope.accessLevels.includes(accessLevel)) {
      throw new HttpError(403, "You cannot file a document at that access level.");
    }

    const visibility: DocVisibility =
      body.visibility === "private" ? "private" : "shared";

    const date =
      typeof body.meetingDate === "string" && body.meetingDate
        ? body.meetingDate
        : new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    const participants = String(body.participants ?? "")
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const maskedText = maskSensitiveData(text);
    const source = typeof body.source === "string" ? body.source : "Manual Notes";

    const job: IngestionJob = {
      id: jobId,
      workspaceId: scope.workspaceId,
      ownerId: scope.userId,
      ownerEmail: user.email,
      visibility,
      sourceType: "meeting",
      status: "processing",
      title: `Meeting: ${meetingTitle} \u2014 ${date}`,
      rawText: maskedText,
      rawTextPreview: maskedText.slice(0, 220),
      accessLevel,
      metadata: {
        meetingTitle,
        meetingDate: date,
        source,
        participants,
      },
      createdAt: now,
      updatedAt: now,
    };

    const meeting: MeetingImport = {
      id: crypto.randomUUID(),
      meetingTitle,
      meetingDate: date,
      source,
      participants,
      status: "processing",
      ingestionJobId: jobId,
      createdAt: now,
    };

    await saveIngestionJob(job);
    await saveMeetingImport(meeting);
    return Response.json(await processIngestionJob(jobId, scope), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
