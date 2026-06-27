import { probeFirestore } from "@/lib/firebase";
import { gmailConfigurationStatus } from "@/lib/server/google/gmail";

export const runtime = "nodejs";

export async function GET() {
  const firestore = await probeFirestore();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const gmailStatus = gmailConfigurationStatus();
  return Response.json({
    firestore,
    ai: {
      configured: geminiConfigured,
      connected: geminiConfigured,
      mode: geminiConfigured ? "Gemini AI configured" : "GEMINI_API_KEY missing",
    },
    storageBucket: {
      configured: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
      mode: process.env.FIREBASE_STORAGE_BUCKET
        ? "Bucket configured"
        : "Optional for text-only ingestion",
    },
    gmail: {
      configured: gmailStatus.configured,
      connected: gmailStatus.configured && gmailStatus.authorized,
      mode: gmailStatus.configured
        ? gmailStatus.authorized
          ? "Gmail credentials.json and saved token configured"
          : "Gmail credentials.json configured; first sync will open Google authorization"
        : `Missing ${gmailStatus.missing.join(", ")}`,
    },
  });
}
