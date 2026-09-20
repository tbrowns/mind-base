import "server-only";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase";
import { localRead, localUpdate } from "./local-store";
import type {
  ChatRecord,
  ChunkRecord,
  DocumentRecord,
  EmailImport,
  IngestionJob,
  MeetingImport,
} from "./types";

/**
 * Document, chunk and chat persistence.
 *
 * Every read here is scoped to a workspace. The scoping is a required argument
 * rather than an optional filter so that a caller cannot accidentally ask for
 * "everything" -- which is what the unscoped listDocuments()/listChats() pair
 * used to return.
 */

function firestoreData<T extends { id: string }>(record: T) {
  const data = { ...record } as Partial<T>;
  delete data.id;
  return JSON.parse(JSON.stringify(data)) as Omit<T, "id">;
}

/**
 * Records written before workspaces existed have no tenancy fields. Treat them
 * as private to nobody and owned by nobody: they stay invisible until migrated,
 * which is the safe direction to fail.
 */
function normaliseDocument(record: DocumentRecord): DocumentRecord {
  return {
    ...record,
    workspaceId: record.workspaceId ?? "",
    ownerId: record.ownerId ?? "",
    ownerEmail: record.ownerEmail ?? "",
    visibility: record.visibility ?? "private",
  };
}

function normaliseChunk(record: ChunkRecord): ChunkRecord {
  return {
    ...record,
    workspaceId: record.workspaceId ?? "",
    ownerId: record.ownerId ?? "",
    visibility: record.visibility ?? "private",
  };
}

/* ------------------------------------------------------------------ documents */

export async function listDocuments(workspaceId: string): Promise<DocumentRecord[]> {
  if (!workspaceId) return [];
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("documents")
      .where("workspaceId", "==", workspaceId)
      .get();
    return snap.docs
      .map((d: QueryDocumentSnapshot) =>
        normaliseDocument({ id: d.id, ...d.data() } as DocumentRecord),
      )
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  return (await localRead()).documents
    .map(normaliseDocument)
    .filter((d) => d.workspaceId === workspaceId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function listChunks(workspaceId: string): Promise<ChunkRecord[]> {
  if (!workspaceId) return [];
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("chunks")
      .where("workspaceId", "==", workspaceId)
      .get();
    return snap.docs.map((d: QueryDocumentSnapshot) =>
      normaliseChunk({ id: d.id, ...d.data() } as ChunkRecord),
    );
  }
  return (await localRead()).chunks
    .map(normaliseChunk)
    .filter((c) => c.workspaceId === workspaceId);
}

export async function saveDocument(
  document: DocumentRecord,
  chunks: ChunkRecord[],
) {
  const db = await getAdminDb();
  if (db) {
    const batch = db.batch();
    batch.set(db.collection("documents").doc(document.id), firestoreData(document));
    chunks.forEach((c) =>
      batch.set(db.collection("chunks").doc(c.id), firestoreData(c)),
    );
    await batch.commit();
    return;
  }
  await localUpdate((data) => {
    data.documents = [
      document,
      ...data.documents.filter((d) => d.id !== document.id),
    ];
    data.chunks = [
      ...data.chunks.filter((c) => c.documentId !== document.id),
      ...chunks,
    ];
  });
}

/**
 * Fetch one document by id without assuming the caller may see it. The caller
 * is responsible for running the authz check against the returned record --
 * which is why the workspace is returned rather than filtered on here.
 */
export async function getDocumentUnchecked(
  id: string,
): Promise<{ document: DocumentRecord; chunks: ChunkRecord[] } | null> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection("documents").doc(id).get();
    if (!snap.exists) return null;
    const document = normaliseDocument({
      id: snap.id,
      ...snap.data(),
    } as DocumentRecord);
    const chunkSnap = await db
      .collection("chunks")
      .where("documentId", "==", id)
      .get();
    return {
      document,
      chunks: chunkSnap.docs.map((d: QueryDocumentSnapshot) =>
        normaliseChunk({ id: d.id, ...d.data() } as ChunkRecord),
      ),
    };
  }
  const data = await localRead();
  const document = data.documents.map(normaliseDocument).find((d) => d.id === id);
  if (!document) return null;
  return {
    document,
    chunks: data.chunks.map(normaliseChunk).filter((c) => c.documentId === id),
  };
}

export async function deleteDocument(id: string) {
  const db = await getAdminDb();
  if (db) {
    const chunks = await db
      .collection("chunks")
      .where("documentId", "==", id)
      .get();
    const batch = db.batch();
    batch.delete(db.collection("documents").doc(id));
    chunks.docs.forEach((d: QueryDocumentSnapshot) => batch.delete(d.ref));
    await batch.commit();
    return;
  }
  await localUpdate((data) => {
    data.documents = data.documents.filter((d) => d.id !== id);
    data.chunks = data.chunks.filter((c) => c.documentId !== id);
  });
}

/* ---------------------------------------------------------------------- chats */

/**
 * A user's own conversation history, newest first.
 *
 * Both the workspace and the user are required. The previous version returned
 * the last 20 chats globally, and the chat route fed them to the model as
 * "remembered" context -- so one person's questions leaked into another's
 * prompt whenever they happened to share a role.
 */
export async function listChatsFor(
  workspaceId: string,
  userId: string,
  limit = 20,
): Promise<ChatRecord[]> {
  if (!workspaceId || !userId) return [];
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("chats")
      .where("workspaceId", "==", workspaceId)
      .where("userId", "==", userId)
      .get();
    return snap.docs
      .map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as ChatRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return (await localRead()).chats
    .filter((c) => c.workspaceId === workspaceId && c.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function saveChat(chat: ChatRecord) {
  const db = await getAdminDb();
  if (db) {
    await db.collection("chats").doc(chat.id).set(firestoreData(chat));
    return;
  }
  await localUpdate((data) => {
    data.chats.unshift(chat);
  });
}

/* ------------------------------------------------------------ ingestion jobs */

export async function listIngestionJobs(
  workspaceId: string,
): Promise<IngestionJob[]> {
  if (!workspaceId) return [];
  const db = await getAdminDb();
  if (db) {
    const snap = await db
      .collection("ingestionJobs")
      .where("workspaceId", "==", workspaceId)
      .get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as IngestionJob)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return (await localRead()).ingestionJobs
    .filter((job) => job.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getIngestionJobUnchecked(
  id: string,
): Promise<IngestionJob | null> {
  const db = await getAdminDb();
  if (db) {
    const snap = await db.collection("ingestionJobs").doc(id).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as IngestionJob) : null;
  }
  return (await localRead()).ingestionJobs.find((job) => job.id === id) ?? null;
}

export async function saveIngestionJob(job: IngestionJob) {
  const db = await getAdminDb();
  if (db) {
    await db.collection("ingestionJobs").doc(job.id).set(firestoreData(job));
    return;
  }
  await localUpdate((data) => {
    data.ingestionJobs = [
      job,
      ...data.ingestionJobs.filter((item) => item.id !== job.id),
    ];
  });
}

export async function updateIngestionJob(
  id: string,
  updates: Partial<IngestionJob>,
) {
  const job = await getIngestionJobUnchecked(id);
  if (!job) throw new Error("Inbox item not found.");
  const next = { ...job, ...updates, updatedAt: new Date().toISOString() };
  await saveIngestionJob(next);
  return next;
}

/* ----------------------------------------------------------------- imports */

export async function listEmailImports(): Promise<EmailImport[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("emailImports").orderBy("createdAt", "desc").get()
    ).docs.map((d) => ({ id: d.id, ...d.data() }) as EmailImport);
  return (await localRead()).emailImports;
}

export async function saveEmailImport(item: EmailImport) {
  const db = await getAdminDb();
  if (db) {
    await db.collection("emailImports").doc(item.id).set(firestoreData(item));
    return;
  }
  await localUpdate((data) => {
    data.emailImports = [
      item,
      ...data.emailImports.filter((entry) => entry.id !== item.id),
    ];
  });
}

export async function updateEmailImportByJob(
  jobId: string,
  updates: Partial<EmailImport>,
) {
  const item = (await listEmailImports()).find(
    (entry) => entry.ingestionJobId === jobId,
  );
  if (item) await saveEmailImport({ ...item, ...updates });
}

export async function listMeetingImports(): Promise<MeetingImport[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("meetingImports").orderBy("createdAt", "desc").get()
    ).docs.map((d) => ({ id: d.id, ...d.data() }) as MeetingImport);
  return (await localRead()).meetingImports;
}

export async function saveMeetingImport(item: MeetingImport) {
  const db = await getAdminDb();
  if (db) {
    await db.collection("meetingImports").doc(item.id).set(firestoreData(item));
    return;
  }
  await localUpdate((data) => {
    data.meetingImports = [
      item,
      ...data.meetingImports.filter((entry) => entry.id !== item.id),
    ];
  });
}

export async function updateMeetingImportByJob(
  jobId: string,
  updates: Partial<MeetingImport>,
) {
  const item = (await listMeetingImports()).find(
    (entry) => entry.ingestionJobId === jobId,
  );
  if (item) await saveMeetingImport({ ...item, ...updates });
}
