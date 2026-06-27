export type AccessLevel = "all-team" | "management" | "management-investees";
export type ViewerRole = "team-member" | "management" | "management-investees";

export type DocumentRecord = {
  id: string;
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
  documentTitle: string;
  chunkIndex: number;
  accessLevel: AccessLevel;
  preview: string;
  text: string;
  score: number;
};

export type ChatRecord = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  viewerRole: ViewerRole;
  createdAt: string;
};

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
