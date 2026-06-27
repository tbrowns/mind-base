import { fetchGmailMessagesWithToken } from "@/lib/server/google/gmail";
import {
  listEmailImports,
  saveEmailImport,
  saveIngestionJob,
} from "@/lib/store";
import type { EmailImport, IngestionJob } from "@/lib/types";
import { maskSensitiveData } from "@/lib/masking";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessToken?: string };
    const accessToken = body.accessToken;

    if (!accessToken) {
      return Response.json(
        { error: "Access token is required" },
        { status: 400 },
      );
    }

    const [messages, existing] = await Promise.all([
      fetchGmailMessagesWithToken(accessToken),
      listEmailImports(),
    ]);
    const known = new Set(existing.map((item) => item.gmailMessageId));
    let imported = 0,
      skipped = 0,
      failed = 0;
    for (const message of messages) {
      if (known.has(message.messageId)) {
        skipped++;
        continue;
      }
      if (!message.text) {
        failed++;
        continue;
      }
      const now = new Date().toISOString();
      const jobId = crypto.randomUUID();
      const maskedText = maskSensitiveData(message.text);
      const job: IngestionJob = {
        id: jobId,
        sourceType: "gmail",
        status: "needs_review",
        title: message.subject,
        rawText: maskedText,
        rawTextPreview: maskedText.slice(0, 220),
        accessLevel: "management",
        metadata: {
          gmailMessageId: message.messageId,
          threadId: message.threadId,
          from: message.from,
          receivedAt: message.date,
        },
        createdAt: now,
        updatedAt: now,
      };
      const email: EmailImport = {
        id: crypto.randomUUID(),
        gmailMessageId: message.messageId,
        threadId: message.threadId,
        from: message.from,
        subject: message.subject,
        snippet: message.snippet,
        receivedAt: message.date,
        status: "needs_review",
        ingestionJobId: jobId,
        createdAt: now,
      };
      try {
        await saveIngestionJob(job);
        await saveEmailImport(email);
        imported++;
      } catch {
        failed++;
      }
    }
    return Response.json({ found: messages.length, imported, skipped, failed });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Gmail sync failed." },
      { status: 500 },
    );
  }
}
