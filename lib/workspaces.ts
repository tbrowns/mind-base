import "server-only";
import { randomBytes, randomUUID } from "crypto";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase";
import { localRead, localUpdate } from "./local-store";
import type {
  AuditAction,
  AuditEvent,
  AuthUser,
  JoinRequest,
  MemberRole,
  Membership,
  Notification,
  Workspace,
  WorkspaceSettings,
  AccessLevel,
} from "./types";

/**
 * Persistence for workspaces, membership, join requests, notifications and the
 * audit trail. Mirrors store.ts: Firestore when configured, a local JSON file
 * otherwise, with the same shape either way.
 */

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  allowedFileTypes: null,
  maxFileSizeMb: 25,
};

function strip<T extends { id: string }>(record: T) {
  const data = { ...record } as Partial<T>;
  delete data.id;
  return JSON.parse(JSON.stringify(data)) as Omit<T, "id">;
}

export function membershipId(workspaceId: string, userId: string) {
  return `${workspaceId}:${userId}`;
}

/** Unambiguous alphabet: no O/0, I/1, so a code read aloud survives. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateJoinCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export async function findWorkspaceByJoinCode(
  code: string,
): Promise<Workspace | null> {
  const normalised = code.trim().toUpperCase();
  if (!normalised) return null;
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("workspaces")
      .where("joinCode", "==", normalised)
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? ({ id: doc.id, ...doc.data() } as Workspace) : null;
  }
  return (
    (await localRead()).workspaces.find((w) => w.joinCode === normalised) ?? null
  );
}

/* ------------------------------------------------------------------ workspaces */

export async function getWorkspace(id: string): Promise<Workspace | null> {
  if (!id) return null;
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection("workspaces").doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Workspace;
  }
  return (await localRead()).workspaces.find((w) => w.id === id) ?? null;
}

export async function createWorkspace(input: {
  name: string;
  type: Workspace["type"];
  owner: AuthUser;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    type: input.type,
    name: input.name.trim() || "Untitled workspace",
    ownerId: input.owner.userId,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    // Personal workspaces are not joinable, so they get no code at all.
    ...(input.type === "org" ? { joinCode: generateJoinCode() } : {}),
  };

  // The creator is seeded as owner in the same operation. A workspace with no
  // owner would be unadministrable, so these must not be able to diverge.
  const membership: Membership = {
    id: membershipId(workspace.id, input.owner.userId),
    workspaceId: workspace.id,
    userId: input.owner.userId,
    email: input.owner.email,
    displayName: input.owner.displayName,
    role: "owner",
    accessLevel: "management-investees",
    joinedAt: workspace.createdAt,
  };

  const db = await getAdminDb();
  if (db) {
    const batch = db.batch();
    batch.set(db.collection("workspaces").doc(workspace.id), strip(workspace));
    batch.set(db.collection("memberships").doc(membership.id), strip(membership));
    await batch.commit();
    return workspace;
  }

  await localUpdate((data) => {
    data.workspaces.push(workspace);
    data.memberships.push(membership);
  });
  return workspace;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  settings: WorkspaceSettings,
): Promise<void> {
  const db = await getAdminDb();
  if (db) {
    await db.collection("workspaces").doc(workspaceId).update({ settings });
    return;
  }
  await localUpdate((data) => {
    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (ws) ws.settings = settings;
  });
}

/**
 * Every user gets a personal workspace on first sign-in, so there is always
 * somewhere to work without joining an organisation first.
 */
export async function ensurePersonalWorkspace(user: AuthUser): Promise<Workspace> {
  const existing = (await listWorkspacesForUser(user.userId)).find(
    (w) => w.type === "personal" && w.ownerId === user.userId,
  );
  if (existing) return existing;
  return createWorkspace({
    name: "Personal",
    type: "personal",
    owner: user,
  });
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const memberships = await listMembershipsForUser(userId);
  if (!memberships.length) return [];
  const workspaces = await Promise.all(
    memberships.map((m) => getWorkspace(m.workspaceId)),
  );
  return workspaces
    .filter((w): w is Workspace => Boolean(w))
    .sort((a, b) => {
      // Personal first, then newest.
      if (a.type !== b.type) return a.type === "personal" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/* ------------------------------------------------------------------ membership */

export async function getMembership(
  workspaceId: string,
  userId: string,
): Promise<Membership | null> {
  if (!workspaceId || !userId) return null;
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("memberships")
      .doc(membershipId(workspaceId, userId))
      .get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Membership;
  }
  return (
    (await localRead()).memberships.find(
      (m) => m.workspaceId === workspaceId && m.userId === userId,
    ) ?? null
  );
}

export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("memberships")
      .where("userId", "==", userId)
      .get();
    return snap.docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as Membership,
    );
  }
  return (await localRead()).memberships.filter((m) => m.userId === userId);
}

export async function listMembers(workspaceId: string): Promise<Membership[]> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("memberships")
      .where("workspaceId", "==", workspaceId)
      .get();
    return snap.docs
      .map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as Membership)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }
  return (await localRead()).memberships
    .filter((m) => m.workspaceId === workspaceId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

export async function saveMembership(membership: Membership): Promise<void> {
  const db = await getAdminDb();
  if (db) {
    await db.collection("memberships").doc(membership.id).set(strip(membership));
    return;
  }
  await localUpdate((data) => {
    data.memberships = [
      ...data.memberships.filter((m) => m.id !== membership.id),
      membership,
    ];
  });
}

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const existing = await getMembership(workspaceId, userId);
  if (!existing) throw new Error("That person is not a member of this workspace.");
  await saveMembership({ ...existing, role });
}

export async function setMemberAccessLevel(
  workspaceId: string,
  userId: string,
  accessLevel: AccessLevel,
): Promise<void> {
  const existing = await getMembership(workspaceId, userId);
  if (!existing) throw new Error("That person is not a member of this workspace.");
  await saveMembership({ ...existing, accessLevel });
}

export async function removeMembership(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const db = await getAdminDb();
  if (db) {
    await db.collection("memberships").doc(membershipId(workspaceId, userId)).delete();
    return;
  }
  await localUpdate((data) => {
    data.memberships = data.memberships.filter(
      (m) => !(m.workspaceId === workspaceId && m.userId === userId),
    );
  });
}

/* --------------------------------------------------------------- join requests */

export async function createJoinRequest(input: {
  workspaceId: string;
  user: AuthUser;
  message?: string;
}): Promise<JoinRequest> {
  const existing = await findJoinRequest(input.workspaceId, input.user.userId);
  // Re-requesting after a rejection is allowed; spamming a pending one is not.
  if (existing && existing.status === "pending") return existing;

  const request: JoinRequest = {
    id: existing?.id ?? randomUUID(),
    workspaceId: input.workspaceId,
    userId: input.user.userId,
    email: input.user.email,
    displayName: input.user.displayName,
    message: input.message?.slice(0, 500),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const db = await getAdminDb();
  if (db) {
    await db.collection("joinRequests").doc(request.id).set(strip(request));
    return request;
  }
  await localUpdate((data) => {
    data.joinRequests = [
      ...data.joinRequests.filter((r) => r.id !== request.id),
      request,
    ];
  });
  return request;
}

export async function findJoinRequest(
  workspaceId: string,
  userId: string,
): Promise<JoinRequest | null> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("joinRequests")
      .where("workspaceId", "==", workspaceId)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? ({ id: doc.id, ...doc.data() } as JoinRequest) : null;
  }
  return (
    (await localRead()).joinRequests.find(
      (r) => r.workspaceId === workspaceId && r.userId === userId,
    ) ?? null
  );
}

export async function getJoinRequest(id: string): Promise<JoinRequest | null> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection("joinRequests").doc(id).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as JoinRequest) : null;
  }
  return (await localRead()).joinRequests.find((r) => r.id === id) ?? null;
}

export async function listJoinRequests(
  workspaceId: string,
  status?: JoinRequest["status"],
): Promise<JoinRequest[]> {
  const db = await getAdminDb();
  let all: JoinRequest[];
  if (db) {
    const snap = await db
      .collection("joinRequests")
      .where("workspaceId", "==", workspaceId)
      .get();
    all = snap.docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as JoinRequest,
    );
  } else {
    all = (await localRead()).joinRequests.filter(
      (r) => r.workspaceId === workspaceId,
    );
  }
  return all
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveJoinRequest(request: JoinRequest): Promise<void> {
  const db = await getAdminDb();
  if (db) {
    await db.collection("joinRequests").doc(request.id).set(strip(request));
    return;
  }
  await localUpdate((data) => {
    data.joinRequests = [
      ...data.joinRequests.filter((r) => r.id !== request.id),
      request,
    ];
  });
}

/* -------------------------------------------------------------- notifications */

export async function createNotification(input: {
  workspaceId: string;
  userId: string | null;
  fromUserId: string;
  body: string;
}): Promise<Notification> {
  const notification: Notification = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    userId: input.userId,
    fromUserId: input.fromUserId,
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  const db = await getAdminDb();
  if (db) {
    await db.collection("notifications").doc(notification.id).set(strip(notification));
    return notification;
  }
  await localUpdate((data) => {
    data.notifications.push(notification);
  });
  return notification;
}

/** A user's notifications: those addressed to them, plus workspace broadcasts. */
export async function listNotificationsFor(
  workspaceId: string,
  userId: string,
): Promise<Notification[]> {
  const db = await getAdminDb();
  let all: Notification[];
  if (db) {
    const snap = await db
      .collection("notifications")
      .where("workspaceId", "==", workspaceId)
      .get();
    all = snap.docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as Notification,
    );
  } else {
    all = (await localRead()).notifications.filter(
      (n) => n.workspaceId === workspaceId,
    );
  }
  return all
    .filter((n) => n.userId === null || n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}

export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<void> {
  const readAt = new Date().toISOString();
  const db = await getAdminDb();
  if (db) {
    const ref = db.collection("notifications").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const notification = { id: snap.id, ...snap.data() } as Notification;
    // Broadcasts are shared rows; one reader must not mark them read for all.
    if (notification.userId !== userId) return;
    await ref.update({ readAt });
    return;
  }
  await localUpdate((data) => {
    const n = data.notifications.find((item) => item.id === id);
    if (n && n.userId === userId) n.readAt = readAt;
  });
}

/* ---------------------------------------------------------------------- audit */

/**
 * Record a privileged action. Admins can delete other people's files and change
 * their privileges, so those acts leave a trail that the affected member and
 * the owner can both read.
 */
export async function recordAudit(input: {
  workspaceId: string;
  actor: AuthUser;
  action: AuditAction;
  targetType: AuditEvent["targetType"];
  targetId: string;
  detail?: string;
}): Promise<void> {
  const event: AuditEvent = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    detail: input.detail,
    createdAt: new Date().toISOString(),
  };
  const db = await getAdminDb();
  if (db) {
    await db.collection("auditEvents").doc(event.id).set(strip(event));
    return;
  }
  await localUpdate((data) => {
    data.auditEvents.push(event);
  });
}

export async function listAudit(
  workspaceId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  const db = await getAdminDb();
  let all: AuditEvent[];
  if (db) {
    const snap = await db
      .collection("auditEvents")
      .where("workspaceId", "==", workspaceId)
      .get();
    all = snap.docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as AuditEvent,
    );
  } else {
    all = (await localRead()).auditEvents.filter(
      (e) => e.workspaceId === workspaceId,
    );
  }
  return all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
