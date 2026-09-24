import { timingSafeEqual } from "crypto";
import { removeStaleGuests } from "@/lib/guests";

// Deleting a guest is several Firestore round trips and a Pinecone call, and a
// run handles up to a hundred of them.
export const maxDuration = 300;

/** Constant-time comparison, so the secret cannot be guessed a byte at a time. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily removal of demo guests idle for a day (see vercel.json). Vercel Cron
 * sends CRON_SECRET as a bearer token; without the secret configured, this
 * refuses every caller rather than running unauthenticated.
 *
 * `?olderThanHours=` overrides the idle threshold for a manual run.
 */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const override = Number(new URL(request.url).searchParams.get("olderThanHours"));
  const olderThanHours = Number.isFinite(override) && override > 0 ? override : 24;

  const result = await removeStaleGuests({ olderThanHours, limit: 100 });
  console.info("Demo guest cleanup", { olderThanHours, ...result });
  return Response.json({ olderThanHours, ...result });
}
