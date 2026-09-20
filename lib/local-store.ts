import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type {
  AuditEvent,
  ChatRecord,
  ChunkRecord,
  DocumentRecord,
  EmailImport,
  IngestionJob,
  JoinRequest,
  MeetingImport,
  Membership,
  Notification,
  Workspace,
} from "./types";

/**
 * The development-only JSON store used when Firestore is not configured.
 *
 * It lives here rather than in store.ts because workspaces.ts needs it too,
 * and two modules doing their own read-modify-write of the same file would
 * silently lose whichever write landed first.
 */
export type Data = {
  documents: DocumentRecord[];
  chunks: ChunkRecord[];
  chats: ChatRecord[];
  ingestionJobs: IngestionJob[];
  emailImports: EmailImport[];
  meetingImports: MeetingImport[];
  workspaces: Workspace[];
  memberships: Membership[];
  joinRequests: JoinRequest[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
};

function emptyData(): Data {
  return {
    documents: [],
    chunks: [],
    chats: [],
    ingestionJobs: [],
    emailImports: [],
    meetingImports: [],
    workspaces: [],
    memberships: [],
    joinRequests: [],
    notifications: [],
    auditEvents: [],
  };
}

/**
 * Where the JSON file lives. Overridable so tests can point at a temp
 * directory without chdir(), which is unreliable inside worker threads and
 * unsafe when suites run in parallel.
 */
function dataDir() {
  return process.env.MINDBASE_DATA_DIR || path.join(process.cwd(), ".data");
}

function getDataFile() {
  return path.join(dataDir(), "mindbase.json");
}

function getLegacyDataFile() {
  return path.join(dataDir(), "kuzana.json");
}

/** Fill in collections added after a file was written, so old files still load. */
function withDefaults(parsed: Partial<Data>): Data {
  return { ...emptyData(), ...parsed };
}

export async function localRead(): Promise<Data> {
  try {
    return withDefaults(JSON.parse(await fs.readFile(getDataFile(), "utf8")));
  } catch {
    try {
      return withDefaults(
        JSON.parse(await fs.readFile(getLegacyDataFile(), "utf8")),
      );
    } catch {
      return emptyData();
    }
  }
}

/**
 * Serialise writes. Next.js route handlers run concurrently in one process, so
 * without this an interleaved read-modify-write drops data.
 */
let writeChain: Promise<void> = Promise.resolve();

export async function localWrite(data: Data): Promise<void> {
  const run = writeChain.then(async () => {
    const dataFile = getDataFile();
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(withDefaults(data), null, 2));
  });
  // Keep the chain alive even if this write fails.
  writeChain = run.catch(() => undefined);
  return run;
}

/** Read, mutate and write back under the same lock. */
export async function localUpdate<T>(
  mutate: (data: Data) => T | Promise<T>,
): Promise<T> {
  let result!: T;
  const run = writeChain.then(async () => {
    const data = await localRead();
    result = await mutate(data);
    const dataFile = getDataFile();
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(withDefaults(data), null, 2));
  });
  writeChain = run.catch(() => undefined);
  await run;
  return result;
}
