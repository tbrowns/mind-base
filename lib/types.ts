export type AccessLevel = "all-team" | "management" | "management-investees";
export type ViewerRole = "team-member" | "management" | "management-investees";

/**
 * Document tiers, least to most restricted. Tiers are cumulative and are
 * compared by index, so adding a tier means inserting it here rather than
 * editing a permissions table in every caller.
 */
export const ACCESS_LEVEL_ORDER: AccessLevel[] = [
  "all-team",
  "management",
  "management-investees",
];

export type DocumentRecord = {
  id: string;
  workspaceId: string;
  /** Uploader. Retained after they leave so ownership is never ambiguous. */
  ownerId: string;
  ownerEmail: string;
  visibility: DocVisibility;
  title: string;
  description: string;
  fileName?: string;
  fileType?: string;
  accessLevel: AccessLevel;
  uploadedAt: string;
  status: "ready" | "processing" | "error";
  chunkCount: number;
  sourceType?: "manual" | "gmail" | "meeting";
  metadata?: Record<string, unknown>;
};

export type IngestionStatus =
  | "needs_review"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";
export type IngestionJob = {
  id: string;
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  visibility: DocVisibility;
  sourceType: "gmail" | "meeting";
  status: IngestionStatus;
  title: string;
  rawText: string;
  rawTextPreview: string;
  accessLevel: AccessLevel;
  documentId?: string;
  metadata: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
export type GmailMessage = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  text: string;
};

export type EmailImport = {
  id: string;
  gmailMessageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  status: IngestionStatus;
  ingestionJobId: string;
  documentId?: string;
  createdAt: string;
};
export type MeetingImport = {
  id: string;
  meetingTitle: string;
  meetingDate: string;
  source: string;
  participants: string[];
  status: IngestionStatus;
  ingestionJobId: string;
  documentId?: string;
  createdAt: string;
};

export type ChunkRecord = {
  id: string;
  workspaceId: string;
  ownerId: string;
  visibility: DocVisibility;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  maskedText: string;
  score?: number;
  relevanceScore?: number;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: number;
  accessLevel: AccessLevel;
  createdAt: string;
};

export type Source = {
  id: string;
  documentId: string;
  visibility: DocVisibility;
  documentTitle: string;
  chunkIndex: number;
  accessLevel: AccessLevel;
  preview: string;
  text: string;
  score: number;
};

export type ChatRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  /**
   * Groups the turns of one conversation. Absent on chats saved before
   * conversations existed; each of those is a conversation of its own, so
   * read it through conversationIdOf().
   */
  conversationId?: string;
  question: string;
  answer: string;
  sources: Source[];
  viewerRole: ViewerRole;
  createdAt: string;
};

export function conversationIdOf(chat: Pick<ChatRecord, "id" | "conversationId">) {
  return chat.conversationId || chat.id;
}

export const accessLabels: Record<AccessLevel, string> = {
  "all-team": "All Team",
  management: "Management",
  "management-investees": "Management + Investees",
};

export const roleLabels: Record<ViewerRole, string> = {
  "team-member": "Team Member",
  management: "Management",
  "management-investees": "Management + Investees",
};

/* ---------------------------------------------------------------------------
 * Workspaces, membership and tenancy
 *
 * Every document, chunk and chat belongs to exactly one workspace. A personal
 * workspace is created for each user at first sign-in and has exactly one
 * member; an org workspace is created explicitly and grows by join request.
 * ------------------------------------------------------------------------- */

export type WorkspaceType = "personal" | "org";

/** Ordered least -> most privileged. Compared by index, never by string. */
export const MEMBER_ROLES = ["member", "admin", "owner"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * Who may retrieve a document in chat.
 *  - "shared":  every member of the workspace, subject to accessLevel
 *  - "private": only the uploader
 *
 * Admins deliberately get no retrieval privilege over private documents. They
 * can inspect them through the audited admin surface instead, so a colleague's
 * private file can never silently turn up as a citation in an admin's answer.
 */
export type DocVisibility = "shared" | "private";

export type WorkspaceSettings = {
  /** Lowercased extensions without the dot, e.g. ["pdf","md"]. null = allow all. */
  allowedFileTypes: string[] | null;
  maxFileSizeMb: number;
};

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  ownerId: string;
  createdAt: string;
  settings: WorkspaceSettings;
  /**
   * Short code an admin shares so people can request to join. Org workspaces
   * only. Lookup is by code rather than by name so that guessing a company
   * name does not reveal whether it has a workspace here.
   */
  joinCode?: string;
};

export type Membership = {
  /** `${workspaceId}:${userId}` so membership is unique by construction. */
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName?: string;
  role: MemberRole;
  /** Which document tiers this member may read. Set by an admin. */
  accessLevel: AccessLevel;
  joinedAt: string;
};

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type JoinRequest = {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName?: string;
  message?: string;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type Notification = {
  id: string;
  workspaceId: string;
  /** null = broadcast to every member of the workspace. */
  userId: string | null;
  fromUserId: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

export type AuditAction =
  | "member.removed"
  | "member.role-changed"
  | "member.access-changed"
  | "join-request.approved"
  | "join-request.rejected"
  | "document.deleted-by-admin"
  | "document.access-changed-by-admin"
  | "document.viewed-by-admin"
  | "workspace.settings-changed"
  | "notification.sent";

export type AuditEvent = {
  id: string;
  workspaceId: string;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType: "document" | "member" | "join-request" | "workspace";
  targetId: string;
  detail?: string;
  createdAt: string;
};

/** The caller's proven identity. Only ever built from a verified ID token. */
export type AuthUser = {
  userId: string;
  email: string;
  displayName?: string;
};

/**
 * A caller's resolved rights inside one workspace. Built server-side from a
 * verified token plus the stored membership -- never from request input.
 */
export type AccessScope = {
  workspaceId: string;
  userId: string;
  role: MemberRole;
  accessLevels: AccessLevel[];
};

export const NOTIFICATION_MAX_LENGTH = 280;

export const memberRoleLabels: Record<MemberRole, string> = {
  member: "Member",
  admin: "Admin",
  owner: "Owner",
};

export const visibilityLabels: Record<DocVisibility, string> = {
  shared: "Shared with workspace",
  private: "Private to me",
};
