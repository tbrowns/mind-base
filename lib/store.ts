import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase";
import type {
  ChatRecord,
  ChunkRecord,
  DocumentRecord,
  EmailImport,
  IngestionJob,
  MeetingImport,
} from "./types";

type Data = {
  documents: DocumentRecord[];
  chunks: ChunkRecord[];
  chats: ChatRecord[];
  ingestionJobs: IngestionJob[];
  emailImports: EmailImport[];
  meetingImports: MeetingImport[];
};

function firestoreData<T extends { id: string }>(record: T) {
  const data = { ...record } as Partial<T>;
  delete data.id;
  return JSON.parse(JSON.stringify(data)) as Omit<T, "id">;
}

function getDataFile() {
  return path.join(process.cwd(), ".data", "kuzana.json");
}

async function localRead(): Promise<Data> {
  const dataFile = getDataFile();
  try {
    return JSON.parse(await fs.readFile(dataFile, "utf8"));
  } catch {
    return {
      documents: [],
      chunks: [],
      chats: [],
      ingestionJobs: [],
      emailImports: [],
      meetingImports: [],
    };
  }
}
async function localWrite(data: Data) {
  const dataFile = getDataFile();
  data.ingestionJobs ??= [];
  data.emailImports ??= [];
  data.meetingImports ??= [];
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("documents").orderBy("uploadedAt", "desc").get()
    ).docs.map(
      (d: QueryDocumentSnapshot) =>
        ({ id: d.id, ...d.data() }) as DocumentRecord,
    );
  return (await localRead()).documents.sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );
}
export async function listChunks(): Promise<ChunkRecord[]> {
  const db = await getAdminDb();
  if (db)
    return (await db.collection("chunks").get()).docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as ChunkRecord,
    );
  return (await localRead()).chunks;
}
export async function listChats(): Promise<ChatRecord[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("chats").orderBy("createdAt", "desc").limit(20).get()
    ).docs.map(
      (d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as ChatRecord,
    );
  return (await localRead()).chats.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
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
  const data = await localRead();
  data.documents = [
    document,
    ...data.documents.filter((d) => d.id !== document.id),
  ];
  data.chunks = [
    ...data.chunks.filter((c) => c.documentId !== document.id),
    ...chunks,
  ];
  await localWrite(data);
}
export async function saveChat(chat: ChatRecord) {
  const db = await getAdminDb();
  if (db) {
    await db
      .collection("chats")
      .doc(chat.id)
      .set(firestoreData(chat));
    return;
  }
  const data = await localRead();
  data.chats.unshift(chat);
  await localWrite(data);
}
export async function getDocument(id: string) {
  const document = (await listDocuments()).find((d) => d.id === id);
  return document
    ? {
        document,
        chunks: (await listChunks()).filter((c) => c.documentId === id),
      }
    : null;
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
  const data = await localRead();
  data.documents = data.documents.filter((d) => d.id !== id);
  data.chunks = data.chunks.filter((c) => c.documentId !== id);
  await localWrite(data);
}

export async function listIngestionJobs(): Promise<IngestionJob[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("ingestionJobs").orderBy("createdAt", "desc").get()
    ).docs.map((d) => ({ id: d.id, ...d.data() }) as IngestionJob);
  const data = await localRead();
  return (data.ingestionJobs ?? []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export async function getIngestionJob(id: string) {
  return (await listIngestionJobs()).find((job) => job.id === id);
}
export async function saveIngestionJob(job: IngestionJob) {
  const db = await getAdminDb();
  if (db) {
    await db
      .collection("ingestionJobs")
      .doc(job.id)
      .set(firestoreData(job));
    return;
  }
  const data = await localRead();
  data.ingestionJobs = [
    job,
    ...(data.ingestionJobs ?? []).filter((item) => item.id !== job.id),
  ];
  await localWrite(data);
}
export async function updateIngestionJob(
  id: string,
  updates: Partial<IngestionJob>,
) {
  const job = await getIngestionJob(id);
  if (!job) throw new Error("Inbox item not found.");
  const next = { ...job, ...updates, updatedAt: new Date().toISOString() };
  await saveIngestionJob(next);
  return next;
}
export async function listEmailImports(): Promise<EmailImport[]> {
  const db = await getAdminDb();
  if (db)
    return (
      await db.collection("emailImports").orderBy("createdAt", "desc").get()
    ).docs.map((d) => ({ id: d.id, ...d.data() }) as EmailImport);
  return (await localRead()).emailImports ?? [];
}
export async function saveEmailImport(item: EmailImport) {
  const db = await getAdminDb();
  if (db) {
    await db
      .collection("emailImports")
      .doc(item.id)
      .set(firestoreData(item));
    return;
  }
  const data = await localRead();
  data.emailImports = [
    item,
    ...(data.emailImports ?? []).filter((entry) => entry.id !== item.id),
  ];
  await localWrite(data);
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
  return (await localRead()).meetingImports ?? [];
}
export async function saveMeetingImport(item: MeetingImport) {
  const db = await getAdminDb();
  if (db) {
    await db
      .collection("meetingImports")
      .doc(item.id)
      .set(firestoreData(item));
    return;
  }
  const data = await localRead();
  data.meetingImports = [
    item,
    ...(data.meetingImports ?? []).filter((entry) => entry.id !== item.id),
  ];
  await localWrite(data);
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
