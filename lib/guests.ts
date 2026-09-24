import "server-only";
import type { UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebase";
import { deleteWorkspaceVectors } from "./vectorstore";
import type { Membership, Workspace } from "./types";

/** Everything a guest can create is filed under their personal workspace. */
const WORKSPACE_COLLECTIONS = [
  "documents",
  "chunks",
  "chats",
  "memberships",
  "auditEvents",
  "notifications",
  "ingestionJobs",
] as const;

/** A demo session: anonymous sign-in leaves no provider and no email. */
export function isGuestAccount(user: Pick<UserRecord, "providerData" | "email">) {
  return user.providerData.length === 0 && !user.email;
}

/** Most recent sign of life: a token refresh, a sign-in, or creation. */
export function lastActive(user: Pick<UserRecord, "metadata">): number {
  const { lastRefreshTime, lastSignInTime, creationTime } = user.metadata;
  return Math.max(
    ...[lastRefreshTime, lastSignInTime, creationTime]
      .map((value) => (value ? Date.parse(value) : 0))
      .filter((value) => Number.isFinite(value)),
  );
}

async function deleteWhere(
  db: Firestore,
  collection: string,
  field: string,
  value: string,
): Promise<number> {
  const snap = await db.collection(collection).where(field, "==", value).get();
  // Batches hold at most 500 writes.
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    snap.docs.slice(i, i + 450).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return snap.size;
}

/**
 * Remove one guest and everything filed under their personal workspace.
 *
 * Deliberately narrow: only a personal workspace the guest owns, with no other
 * member, is deleted. Guests cannot create or join organisations, so anything
 * else would be a surprise -- and a surprise is left alone, not deleted.
 */
async function removeGuest(db: Firestore, uid: string): Promise<number> {
  const memberships = await db
    .collection("memberships")
    .where("userId", "==", uid)
    .get();

  let records = 0;
  for (const membershipDoc of memberships.docs) {
    const { workspaceId } = membershipDoc.data() as Membership;
    const workspaceRef = db.collection("workspaces").doc(workspaceId);
    const workspace = (await workspaceRef.get()).data() as Workspace | undefined;
    if (!workspace || workspace.type !== "personal" || workspace.ownerId !== uid) {
      continue;
    }
    const members = await db
      .collection("memberships")
      .where("workspaceId", "==", workspaceId)
      .get();
    if (members.docs.some((doc) => (doc.data() as Membership).userId !== uid)) {
      continue;
    }

    await deleteWorkspaceVectors(workspaceId);
    for (const collection of WORKSPACE_COLLECTIONS) {
      records += await deleteWhere(db, collection, "workspaceId", workspaceId);
    }
    await workspaceRef.delete();
    records++;
  }

  await db.collection("usage").doc(uid).delete();
  await (await getAdminAuth()).deleteUser(uid);
  return records;
}

export type GuestCleanupResult = {
  checked: number;
  removed: number;
  records: number;
  failed: number;
  /** True when the per-run cap was hit; the next run continues. */
  capped: boolean;
};

/**
 * Delete demo guests idle for longer than `olderThanHours`, at most `limit`
 * per run so one invocation stays well inside the function time limit.
 */
export async function removeStaleGuests(options: {
  olderThanHours: number;
  limit: number;
}): Promise<GuestCleanupResult> {
  const db = await getAdminDb();
  const result: GuestCleanupResult = {
    checked: 0,
    removed: 0,
    records: 0,
    failed: 0,
    capped: false,
  };
  if (!db) return result;

  const auth = await getAdminAuth();
  const cutoff = Date.now() - options.olderThanHours * 60 * 60 * 1000;
  const stale: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      result.checked++;
      if (isGuestAccount(user) && lastActive(user) < cutoff) stale.push(user.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken && stale.length < options.limit);

  result.capped =
    stale.length > options.limit ||
    (stale.length === options.limit && Boolean(pageToken));
  for (const uid of stale.slice(0, options.limit)) {
    try {
      result.records += await removeGuest(db, uid);
      result.removed++;
    } catch (error) {
      // One bad account must not stop the rest; it is retried next run.
      result.failed++;
      console.error("Could not remove demo guest", uid, error);
    }
  }
  return result;
}
