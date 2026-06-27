import { processIngestionJob } from "@/lib/process-ingestion-job";
import { saveIngestionJob, saveMeetingImport } from "@/lib/store";
import type { AccessLevel, IngestionJob, MeetingImport } from "@/lib/types";
import { maskSensitiveData } from "@/lib/masking";
export async function POST(request: Request) {
  try {
    const body = await request.json(); if (!body.meetingTitle?.trim()) return Response.json({ error: "Add a meeting title." }, { status: 400 }); if (!body.text?.trim()) return Response.json({ error: "Paste the meeting transcript or notes." }, { status: 400 });
    const date = body.meetingDate || new Date().toISOString().slice(0, 10); const now = new Date().toISOString(); const jobId = crypto.randomUUID(); const participants = String(body.participants ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean); const maskedText = maskSensitiveData(body.text.trim());
    const job: IngestionJob = { id: jobId, sourceType: "meeting", status: "processing", title: `Meeting: ${body.meetingTitle.trim()} — ${date}`, rawText: maskedText, rawTextPreview: maskedText.slice(0, 220), accessLevel: (body.accessLevel ?? "management") as AccessLevel, metadata: { meetingTitle: body.meetingTitle.trim(), meetingDate: date, source: body.source ?? "Manual Notes", participants }, createdAt: now, updatedAt: now };
    const meeting: MeetingImport = { id: crypto.randomUUID(), meetingTitle: body.meetingTitle.trim(), meetingDate: date, source: body.source ?? "Manual Notes", participants, status: "processing", ingestionJobId: jobId, createdAt: now };
    await saveIngestionJob(job); await saveMeetingImport(meeting); return Response.json(await processIngestionJob(jobId), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Meeting import failed." }, { status: 500 }); }
}
