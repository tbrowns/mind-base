import "server-only";
import { HttpError } from "./auth";
import { getAdminDb } from "./firebase";
import type { AuthUser } from "./types";

/**
 * What one demo guest may do before being asked to create an account. The
 * demo needs no sign-up, so these are what bound the Groq and Pinecone bill a
 * stranger can run up; Firebase separately limits how many anonymous accounts
 * one address can create.
 */
export const GUEST_LIMITS = { questions: 25, uploads: 5 } as const;

/** About fifteen pages of text per guest upload. */
export const GUEST_MAX_UPLOAD_CHARS = 60_000;

export type QuotaKind = keyof typeof GUEST_LIMITS;

const REFUSALS: Record<QuotaKind, string> = {
  questions: `The demo allows ${GUEST_LIMITS.questions} questions. Create an account to keep asking.`,
  uploads: `The demo allows ${GUEST_LIMITS.uploads} uploads. Create an account to add more.`,
};

/**
 * Count one use against a guest's allowance, refusing once it is spent. Full
 * accounts are not metered here.
 *
 * A counter rather than a count of stored records: counting chats would let a
 * guest delete their history to get more questions. The transaction keeps
 * two requests racing at the limit from both getting through.
 */
export async function consumeGuestQuota(
  user: AuthUser,
  kind: QuotaKind,
): Promise<void> {
  if (!user.guest) return;
  const db = await getAdminDb();
  // The local JSON store is for development only; there is nothing to meter.
  if (!db) return;

  const ref = db.collection("usage").doc(user.userId);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = Number(snap.data()?.[kind] ?? 0);
    if (used >= GUEST_LIMITS[kind]) return false;
    tx.set(
      ref,
      { [kind]: used + 1, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return true;
  });
  if (!allowed) throw new HttpError(429, REFUSALS[kind]);
}
