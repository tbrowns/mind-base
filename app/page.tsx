"use client";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarRange,
  Check,
  Clock3,
  FilePlus2,
  FileText,
  Inbox,
  Layers3,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Upload,
} from "@/components/icons";
import { useCallback, useEffect, useState } from "react";
import type { ChatRecord, DocumentRecord } from "@/lib/types";
import { accessLabels } from "@/lib/types";
import { Badge, Spinner } from "@/components/ui";

type Data = {
  documents: DocumentRecord[];
  chats: ChatRecord[];
  totals: { documents: number; chunks: number; questions: number };
};
type InboxData = {
  summary: {
    pending: number;
    automated: number;
    latestMeeting: { meetingTitle: string; meetingDate: string } | null;
  };
};

export default function Dashboard() {
  const [data, setData] = useState<Data>({
    documents: [],
    chats: [],
    totals: { documents: 0, chunks: 0, questions: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [inbox, setInbox] = useState<InboxData>({
    summary: { pending: 0, automated: 0, latestMeeting: null },
  });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("Not synced this session");

  const load = useCallback(async () => {
    const response = await fetch("/api/documents", { cache: "no-store" });
    setData(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.all([
      fetch("/api/documents", { cache: "no-store" }).then((response) =>
        response.json(),
      ),
      fetch("/api/inbox", { cache: "no-store" }).then((response) =>
        response.json(),
      ),
    ]).then(([documents, inboxData]) => {
      setData(documents);
      setInbox(inboxData);
      setLoading(false);
    });
  }, []);

  async function seed() {
    setSeeding(true);
    const response = await fetch("/api/demo/seed", { method: "POST" });

    if (response.ok) {
      setSeeded(true);
      await load();
    }

    setSeeding(false);
  }

  async function syncGmail() {
    setSyncing(true);
    const response = await fetch("/api/connectors/gmail/sync", {
      method: "POST",
    });
    const result = await response.json();
    setSyncResult(
      response.ok
        ? `${result.imported} imported / ${result.skipped} skipped / ${result.failed} failed`
        : result.error,
    );

    if (response.ok) {
      setInbox(
        await fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()),
      );
    }

    setSyncing(false);
  }

  const last = data.documents[0];
  const stats = [
    {
      label: "Documents",
      value: data.totals.documents,
      icon: FileText,
      note: "ready to cite",
    },
    {
      label: "Searchable chunks",
      value: data.totals.chunks,
      icon: Layers3,
      note: "screened before Groq",
    },
    {
      label: "Questions asked",
      value: data.totals.questions,
      icon: MessageSquareText,
      note: "last 5 remembered",
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8 lg:px-10 lg:py-10">
      <section className="ink-panel relative overflow-hidden rounded-[28px] px-6 py-8 text-white md:px-10 md:py-10">
        <div className="absolute inset-x-0 top-0 h-px bg-[#8dffdf]/70" />
        <div className="absolute bottom-0 left-0 h-20 w-full bg-[linear-gradient(90deg,rgba(255,255,255,.10)_1px,transparent_1px)] bg-[length:28px_28px]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase text-[#a8ffe7]">
              <span className="size-1.5 rounded-full bg-[#ff6b57]" />
              Mindbase command deck
            </div>
            <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-[46px] md:leading-[1.08]">
              Turn scattered team knowledge into answers you can trust.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">
              Search your documents, screen retrieved chunks for relevance, and
              answer with citations through Groq.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/documents/new"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/18 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/16"
              >
                <Upload size={17} />
                Add source
              </Link>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#9dffe5] px-4 py-3 text-sm font-black text-[#073b34] shadow-[0_14px_30px_rgba(157,255,229,.18)] hover:bg-white"
              >
                <BrainCircuit size={17} />
                Ask Mindbase
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/14 bg-white/10 p-4 backdrop-blur">
            {[
              ["Provider", "Groq API"],
              ["Retrieval", "Relevance gated"],
              ["Memory", "5 chat turns"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-white/10 py-3 last:border-0"
              >
                <span className="text-[11px] font-bold uppercase text-white/50">
                  {label}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#0a3f37]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, note }, index) => (
          <div
            key={label}
            style={{ animationDelay: `${index * 60}ms` }}
            className="soft-panel animate-rise rounded-[22px] p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-[#6c8279]">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black">
                  {loading ? "-" : value}
                </p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-[#dff8ef] text-[#08735f]">
                <Icon size={20} />
              </span>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-[#7c8f87]">
              <span className="size-1.5 rounded-full bg-[#0aa37f]" />
              {note}
            </p>
          </div>
        ))}
      </div>

      <section className="soft-panel mt-6 rounded-[24px] p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)_220px] lg:items-center">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#fff0ed] text-[#c74435]">
              <Inbox size={20} />
            </span>
            <div>
              <h2 className="text-sm font-black">Mindbase Inbox automation</h2>
              <p className="mt-1 text-xs text-[#71837b]">
                Gmail review queue and meeting knowledge intake.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-[#87978f]">
                Pending
              </p>
              <p className="mt-1 text-2xl font-black">{inbox.summary.pending}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#87978f]">
                Automated
              </p>
              <p className="mt-1 text-2xl font-black">
                {inbox.summary.automated}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#87978f]">
                Latest meeting
              </p>
              <p className="mt-2 truncate text-xs font-bold">
                {inbox.summary.latestMeeting?.meetingTitle ?? "None yet"}
              </p>
            </div>
          </div>
          <div className="lg:text-right">
            <button
              onClick={syncGmail}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#bfd8cf] bg-white px-4 py-3 text-xs font-black text-[#244940] disabled:opacity-60"
            >
              {syncing ? <Spinner size={15} /> : <RefreshCw size={15} />}
              Sync Gmail
            </button>
            <p className="mt-2 text-[10px] text-[#7c8d85]">{syncResult}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-[#dcebe5] pt-4">
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 text-xs font-black text-[#08735f]"
          >
            Open inbox <ArrowRight size={13} />
          </Link>
          <Link
            href="/meetings/import"
            className="inline-flex items-center gap-1.5 text-xs font-black text-[#08735f]"
          >
            <CalendarRange size={13} />
            Import meeting notes
          </Link>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_.85fr]">
        <section className="soft-panel overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between border-b border-[#dcebe5] px-5 py-4">
            <div>
              <h2 className="text-sm font-black">Recent sources</h2>
              <p className="mt-0.5 text-xs text-[#71837b]">
                The newest additions to your knowledge base.
              </p>
            </div>
            <Link
              href="/documents"
              className="text-xs font-black text-[#08735f] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-[#dcebe5]">
            {data.documents.slice(0, 3).map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e0f5ee] text-[#08735f]">
                  <FileText size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{doc.title}</p>
                  <p className="mt-1 text-xs text-[#7c8d85]">
                    {doc.chunkCount} chunks /{" "}
                    {new Date(doc.uploadedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <Badge>{accessLabels[doc.accessLevel]}</Badge>
              </div>
            ))}
            {!data.documents.length && !loading && (
              <div className="px-5 py-10 text-center">
                <FilePlus2 className="mx-auto text-[#91a39b]" />
                <p className="mt-3 text-sm font-bold">No documents yet</p>
                <p className="mt-1 text-xs text-[#7c8d85]">
                  Load the demo guide or add your first source.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="soft-panel rounded-[24px] p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#fff0ed] text-[#c74435]">
              <Sparkles size={19} />
            </span>
            <div>
              <h2 className="text-sm font-black">Demo ready in one click</h2>
              <p className="text-xs text-[#71837b]">Seed the Mindbase guide.</p>
            </div>
          </div>
          <div className="my-5 h-px bg-[#dcebe5]" />
          <ul className="space-y-3 text-xs font-semibold text-[#5f746b]">
            <li className="flex gap-2">
              <Check size={15} className="text-[#0aa37f]" />
              Rules, deadlines and deliverables
            </li>
            <li className="flex gap-2">
              <Check size={15} className="text-[#0aa37f]" />
              Embedded and ready to search
            </li>
            <li className="flex gap-2">
              <Check size={15} className="text-[#0aa37f]" />
              Safe to reload without duplicates
            </li>
          </ul>
          <button
            onClick={seed}
            disabled={seeding || seeded}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0a3f37] px-4 py-3 text-sm font-black text-white hover:bg-[#126153] disabled:opacity-70"
          >
            {seeding ? (
              <>
                <Spinner />
                Building knowledge base...
              </>
            ) : seeded ? (
              <>
                <Check size={17} />
                Demo document ready
              </>
            ) : (
              <>
                <Sparkles size={17} />
                Load demo document
              </>
            )}
          </button>
          {last && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#7c8d85]">
              <Clock3 size={12} />
              Latest: {last.title}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
