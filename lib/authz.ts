/**
 * Authorization rules for workspace tenancy.
 *
 * Everything here is a pure function of (scope, record). No I/O, no Firebase,
 * no request parsing -- so the rules can be tested exhaustively and there is
 * exactly one place to audit when asking "who can see what".
 *
 * The scope itself is built server-side in lib/auth.ts from a verified ID
 * token plus the stored membership. It is never read from request input --
 * that was the original defect: `viewerRole` arrived in the POST body, so any
 * caller could name their own privileges.
 */
import {
  ACCESS_LEVEL_ORDER,
  MEMBER_ROLES,
  type AccessLevel,
  type AccessScope,
  type ChatRecord,
  type ChunkRecord,
  type DocumentRecord,
  type MemberRole,
  type Membership,
  type WorkspaceSettings,
} from "./types";

/** Rank of a role. Higher is more privileged. */
export function roleRank(role: MemberRole): number {
  const index = MEMBER_ROLES.indexOf(role);
  // An unrecognised role is treated as the least privileged, never the most.
  return index === -1 ? 0 : index;
}

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return roleRank(role) >= roleRank(minimum);
}

/**
 * Expand a member's tier into every tier they may read. Tiers are cumulative:
 * a "management" member reads "all-team" and "management", not the investee
 * tier above it.
 */
export function accessLevelsFor(level: AccessLevel): AccessLevel[] {
  const index = ACCESS_LEVEL_ORDER.indexOf(level);
  if (index === -1) return [ACCESS_LEVEL_ORDER[0]];
  return ACCESS_LEVEL_ORDER.slice(0, index + 1);
}

/* -------------------------------------------------------------------------
 * Retrieval
 * ---------------------------------------------------------------------- */

type RetrievableRecord = {
  workspaceId: string;
  ownerId: string;
  visibility: string;
  accessLevel: AccessLevel;
};

/**
 * The single retrieval invariant, applied identically to documents and chunks.
 *
 * Note the deliberate absence of an admin bypass. An admin inspecting a
 * private file does so through the audited admin surface, which records who
 * looked. If admins were allowed to retrieve private files in chat instead, a
 * colleague's private document could surface as a citation with no trace.
 */
function canRetrieve(scope: AccessScope, record: RetrievableRecord): boolean {
  // 1. Tenancy. Cross-workspace reads are impossible regardless of privilege.
  if (record.workspaceId !== scope.workspaceId) return false;

  // 2. Ownership. Private records belong to the uploader alone.
  if (record.visibility === "private" && record.ownerId !== scope.userId) {
    return false;
  }

  // 3. Tier.
  return scope.accessLevels.includes(record.accessLevel);
}

export function canRetrieveDocument(
  scope: AccessScope,
  doc: DocumentRecord,
): boolean {
  return canRetrieve(scope, doc);
}

export function canRetrieveChunk(
  scope: AccessScope,
  chunk: ChunkRecord,
): boolean {
  return canRetrieve(scope, chunk);
}

/* -------------------------------------------------------------------------
 * Conversations
 * ---------------------------------------------------------------------- */

/**
 * Conversations are private to their author, with no administrative override.
 * This is the one rule the product promises users explicitly, so there is no
 * privileged branch here at all -- not even for an owner.
 */
export function canReadChat(scope: AccessScope, chat: ChatRecord): boolean {
  return chat.workspaceId === scope.workspaceId && chat.userId === scope.userId;
}

/* -------------------------------------------------------------------------
 * Administration
 * ---------------------------------------------------------------------- */

export function canAdministerWorkspace(scope: AccessScope): boolean {
  return roleAtLeast(scope.role, "admin");
}

/**
 * Admins can list and inspect every file in their workspace, including private
 * ones -- that is the governance power the product grants them. Reading a
 * private file through this path is expected to be audited by the caller.
 */
export function canInspectDocumentAsAdmin(
  scope: AccessScope,
  doc: DocumentRecord,
): boolean {
  return doc.workspaceId === scope.workspaceId && canAdministerWorkspace(scope);
}

/** A document may be deleted by its owner, or by an admin of its workspace. */
export function canDeleteDocument(
  scope: AccessScope,
  doc: DocumentRecord,
): boolean {
  if (doc.workspaceId !== scope.workspaceId) return false;
  return doc.ownerId === scope.userId || canAdministerWorkspace(scope);
}

/**
 * Whether `scope` may change or remove `target`.
 *
 * An admin may act on members below their own rank only. That stops admins
 * removing each other or the owner, and stops anyone escalating sideways. The
 * owner outranks every admin, and nobody may act on themselves through the
 * admin surface (leaving is a separate, deliberate action).
 */
export function canManageMember(
  scope: AccessScope,
  target: Membership,
): boolean {
  if (target.workspaceId !== scope.workspaceId) return false;
  if (target.userId === scope.userId) return false;
  if (!canAdministerWorkspace(scope)) return false;
  return roleRank(scope.role) > roleRank(target.role);
}

/**
 * Whether `scope` may set `target` to `nextRole`.
 *
 * Promotion is capped at the actor's own rank: an admin can create other
 * admins but cannot mint an owner, so ownership can only ever be transferred
 * deliberately by the owner.
 */
export function canAssignRole(
  scope: AccessScope,
  target: Membership,
  nextRole: MemberRole,
): boolean {
  if (!canManageMember(scope, target)) return false;
  return roleRank(nextRole) <= roleRank(scope.role);
}

/* -------------------------------------------------------------------------
 * Upload restrictions
 * ---------------------------------------------------------------------- */

export function normaliseExtension(fileName: string): string | null {
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  return trimmed.slice(dot + 1);
}

export type FileCheck = { ok: true } | { ok: false; reason: string };

/**
 * Enforce the workspace's upload policy. `allowedFileTypes: null` means the
 * admin has set no restriction; an empty array means "nothing is allowed",
 * which is a real (if unusual) choice and is honoured rather than treated as
 * "unset".
 */
export function checkFileAllowed(
  settings: WorkspaceSettings,
  fileName: string | undefined,
  sizeBytes?: number,
): FileCheck {
  if (typeof settings.maxFileSizeMb === "number" && sizeBytes !== undefined) {
    const limit = settings.maxFileSizeMb * 1024 * 1024;
    if (sizeBytes > limit) {
      return {
        ok: false,
        reason: `File is larger than the ${settings.maxFileSizeMb} MB limit for this workspace.`,
      };
    }
  }

  if (settings.allowedFileTypes === null) return { ok: true };

  // Pasted text has no filename; the type restriction applies to uploads only.
  if (!fileName) return { ok: true };

  const ext = normaliseExtension(fileName);
  if (!ext) {
    return { ok: false, reason: "File needs a recognisable extension." };
  }
  if (!settings.allowedFileTypes.includes(ext)) {
    const allowed = settings.allowedFileTypes.length
      ? settings.allowedFileTypes.map((t) => `.${t}`).join(", ")
      : "none";
    return {
      ok: false,
      reason: `This workspace accepts ${allowed}. ".${ext}" is not permitted.`,
    };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Scope construction
 * ---------------------------------------------------------------------- */

export function scopeFromMembership(membership: Membership): AccessScope {
  return {
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    role: membership.role,
    accessLevels: accessLevelsFor(membership.accessLevel),
  };
}
