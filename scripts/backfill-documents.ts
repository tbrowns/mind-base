/**
 * One-off maintenance: bring documents stored before masking and suggested
 * questions existed up to date. Safe to run again -- masking is idempotent and
 * documents that already have questions are left alone.
 *
 * For every document it:
 *   1. masks any stored chunk text that is not masked yet, re-writing only the
 *      chunks that change (Pinecone re-embeds them from the new text), and
 *   2. generates suggested questions if the document has none.
 * It also masks the source excerpts saved inside chat history, which are
 * verbatim copies of chunk text.
 *
 * It prints counts only, never document text. Dry run by default:
 *
 *   npx --yes tsx@4 --tsconfig scripts/tsconfig.json scripts/backfill-documents.ts
 *   npx --yes tsx@4 --tsconfig scripts/tsconfig.json scripts/backfill-documents.ts --apply
 *
 * scripts/tsconfig.json maps `server-only` to the test stub, since outside a
 * Next build there is no such package to load.
 */
import { Pinecone, type PineconeRecord } from "@pinecone-database/pinecone";
import { getAdminDb } from "../lib/firebase";
import { maskSensitiveData } from "../lib/masking";
import { suggestQuestions } from "../lib/ai";
import { mergeChunks } from "../lib/chunks";
import type { ChatRecord, DocumentRecord } from "../lib/types";

process.loadEnvFile(".env.local");
const APPLY = process.argv.includes("--apply");

/** How many of each kind of mask a rewrite adds -- what changed, never the text. */
const masksAdded: Record<string, number> = {};
function tallyMasks(before: string, after: string, area: string) {
  const count = (text: string) => {
    const counts: Record<string, number> = {};
    for (const [label] of text.matchAll(/\[masked [a-zA-Z ]+\]/g)) {
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return counts;
  };
  const was = count(before);
  for (const [label, n] of Object.entries(count(after))) {
    const added = n - (was[label] ?? 0);
    const key = `${area}: ${label}`;
    if (added > 0) masksAdded[key] = (masksAdded[key] ?? 0) + added;
  }
}

type Fields = Record<string, unknown> & {
  chunk_text?: string;
  text?: string;
  chunkIndex?: number;
};

async function main() {
  const db = await getAdminDb();
  if (!db) throw new Error("Firestore is not configured.");
  const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index(
    process.env.PINECONE_INDEX!,
  );

  const totals = {
    documents: 0,
    chunksChecked: 0,
    chunksMasked: 0,
    documentsMasked: 0,
    questionsAdded: 0,
    questionsFailed: 0,
    missingVectors: 0,
    chatsMasked: 0,
  };

  const docs = await db.collection("documents").get();
  for (const snap of docs.docs) {
    const doc = { id: snap.id, ...snap.data() } as DocumentRecord;
    totals.documents++;
    const ids = Array.isArray(doc.metadata?.pineconeChunkIds)
      ? (doc.metadata.pineconeChunkIds as string[])
      : [];
    if (!doc.workspaceId || !ids.length) continue;

    const ns = index.namespace(`ws-${doc.workspaceId}`);
    const records: PineconeRecord[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { records: page } = await ns.fetch(ids.slice(i, i + 100));
      records.push(...Object.values(page ?? {}));
    }
    if (records.length < ids.length) totals.missingVectors += ids.length - records.length;

    // Mask, keeping every other field of each record exactly as it was.
    const texts: Array<{ order: number; text: string }> = [];
    const rewrites: Array<Record<string, unknown>> = [];
    for (const record of records) {
      const fields = (record.metadata ?? {}) as Fields;
      const original = String(fields.chunk_text ?? fields.text ?? "");
      const masked = maskSensitiveData(original);
      totals.chunksChecked++;
      texts.push({ order: Number(fields.chunkIndex ?? 0), text: masked });
      if (masked !== original) {
        tallyMasks(original, masked, "documents");
        rewrites.push({ ...fields, id: record.id, chunk_text: masked, text: masked });
      }
    }
    if (rewrites.length) {
      totals.chunksMasked += rewrites.length;
      totals.documentsMasked++;
      if (APPLY) {
        for (let i = 0; i < rewrites.length; i += 90) {
          await ns.upsertRecords(
            rewrites.slice(i, i + 90) as Parameters<typeof ns.upsertRecords>[0],
          );
        }
      }
    }

    if (!doc.suggestedQuestions?.length && texts.length) {
      const fullText = mergeChunks(
        texts.sort((a, b) => a.order - b.order).map((item) => item.text),
      );
      try {
        const questions = APPLY ? await suggestQuestions(doc.title, fullText) : ["(dry run)"];
        if (questions.length) {
          totals.questionsAdded++;
          if (APPLY) await snap.ref.update({ suggestedQuestions: questions });
        } else {
          totals.questionsFailed++;
        }
      } catch {
        totals.questionsFailed++;
      }
    }
  }

  const chats = await db.collection("chats").get();
  for (const snap of chats.docs) {
    const chat = snap.data() as ChatRecord;
    if (!Array.isArray(chat.sources)) continue;
    let changed = false;
    const sources = chat.sources.map((source) => {
      const text = maskSensitiveData(source.text ?? "");
      const preview = maskSensitiveData(source.preview ?? "");
      if (text !== source.text || preview !== source.preview) {
        changed = true;
        tallyMasks(source.text ?? "", text, "chat excerpts");
      }
      return { ...source, text, preview };
    });
    if (changed) {
      totals.chatsMasked++;
      if (APPLY) await snap.ref.update({ sources });
    }
  }

  console.log(APPLY ? "APPLIED" : "DRY RUN (nothing written; pass --apply)");
  console.table(totals);
  console.log("Masks added, by where and what kind:");
  console.table(masksAdded);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
