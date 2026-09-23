"use client";
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Clock3,
  FileSearch,
  Sparkles,
  Trash2,
  X,
} from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import {
  useSession,
  type WorkspaceSummary,
} from "@/components/session-context";
import { Badge, Spinner } from "@/components/ui";
import type { ChatRecord, Source } from "@/lib/types";
import { accessLabels } from "@/lib/types";

const suggestions = [
  "What is required for Stage 1?",
  "Which bounties are listed in the demo guide?",
  "What does Mindbase need to deliver?",
  "What are the intellectual property rules?",
  "When is the final MiniHack event?",
];

function relevanceLabel(score: number) {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}% relevance`;
}

/** Pull the server's `{error}` text out of a failed response, with a fallback. */
async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Non-JSON body (proxy page, empty response); fall through.
  }
  return fallback;
}

export default function ChatPage() {
  const { activeWorkspace } = useSession();

  if (!activeWorkspace) {
    return (
      <div className="flex h-[calc(100vh-72px)] items-center justify-center bg-[#eef7f4]/70 px-4">
        <div className="max-w-sm rounded-3xl border border-[#d9e9e2] bg-white/88 p-8 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
            <BrainCircuit size={20} />
          </span>
          <h2 className="mt-5 text-lg font-black text-[#101b18]">
            No workspace selected
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#60756c]">
            Pick a workspace from the menu at the top right to start asking
            questions about its knowledge base.
          </p>
        </div>
      </div>
    );
  }

  // Keying on the workspace id remounts the conversation when the user
  // switches workspace: messages, history and the open source drawer all reset
  // and the history reload runs again, without setState-in-effect resets.
  return (
    <ChatWorkspace key={activeWorkspace.id} workspace={activeWorkspace} />
  );
}

function ChatWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const { apiFetch } = useSession();
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [recent, setRecent] = useState<ChatRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<Source>();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/chat")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await readError(response, "Could not load recent questions."),
          );
        }
        return (await response.json()) as { chats?: ChatRecord[] };
      })
      .then((data) => {
        if (!cancelled) setRecent(data.chats ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load recent questions.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  // Block body on purpose: current Chrome returns a Promise from a smooth
  // scrollIntoView, and an expression body would hand that to React as the
  // effect's cleanup -- which it then calls, crashing the page on the next
  // message or on navigating away.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(value = question) {
    const cleanQuestion = value.trim();

    if (!cleanQuestion || loading) return;

    const history = messages
      .slice(-5)
      .map(({ question: previousQuestion, answer }) => ({
        question: previousQuestion,
        answer,
      }));

    setQuestion("");
    setError("");
    setLoading(true);

    try {
      const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: cleanQuestion, history }),
      });

      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not answer that question."),
        );
      }

      const data = (await response.json()) as ChatRecord;

      setMessages((items) => [...items, data]);
      setRecent((items) => [
        data,
        ...items.filter((item) => item.id !== data.id),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not answer that question.",
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Deleting also drops the chat from the open conversation, so it stops being
   * sent as history, and the server no longer offers it as remembered context.
   */
  async function remove(id: string) {
    setDeleting(id);
    setError("");
    try {
      const response = await apiFetch(`/api/chat/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not delete that chat."));
      }
      setRecent((items) => items.filter((item) => item.id !== id));
      setMessages((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete that chat.",
      );
    } finally {
      setDeleting(undefined);
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] overflow-hidden">
      <aside className="hidden w-[292px] shrink-0 border-r border-[#d9e9e2] bg-[#fbfffd]/82 p-4 backdrop-blur xl:block">
        <div className="rounded-[22px] bg-[#0a3f37] p-4 text-white">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-[#9dffe5]">
            <Clock3 size={14} />
            Recent questions
          </div>
          <p className="mt-3 text-xs leading-5 text-white/64">
            Re-run a question or use these as anchors for follow-ups. Delete
            one and Mindbase forgets it.
          </p>
        </div>
        <div className="mt-4 space-y-1.5">
          {recent.slice(0, 10).map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-1 rounded-2xl hover:bg-[#e5f4ee] has-[:focus-visible]:bg-[#e5f4ee]"
            >
              <button
                onClick={() => ask(item.question)}
                className="min-w-0 flex-1 px-3 py-3 text-left text-xs font-semibold leading-5 text-[#536b62] outline-none group-hover:text-[#10231e]"
              >
                <span className="line-clamp-2">{item.question}</span>
              </button>
              <button
                aria-label={`Delete "${item.question}"`}
                title="Delete"
                disabled={deleting === item.id}
                onClick={() => void remove(item.id)}
                className={`mr-1.5 mt-2 grid size-7 shrink-0 place-items-center rounded-lg text-[#8a9b93] hover:bg-white hover:text-[#b53d31] focus-visible:opacity-100 ${deleting === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              >
                {deleting === item.id ? (
                  <Spinner size={13} />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
          {!recent.length && (
            <p className="px-3 py-8 text-center text-xs leading-5 text-[#8a9b93]">
              Your recent questions will appear here.
            </p>
          )}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col bg-[#eef7f4]/70">
        <header className="flex items-center justify-between gap-3 border-b border-[#d9e9e2] bg-[#fbfffd]/82 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#0a3f37] text-[#9dffe5] shadow-[0_12px_28px_rgba(10,63,55,.16)]">
              <BrainCircuit size={20} />
            </span>
            <div>
              <h1 className="text-sm font-black">Ask Mindbase</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#6d8178]">
                <span className="size-1.5 rounded-full bg-[#0aa37f]" />
                Grounded answers from relevance-checked chunks
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#587067]">
                Asking:{" "}
                <span className="font-black text-[#0a3f37]">
                  {workspace.name}
                </span>
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-36 pt-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            {!messages.length && (
              <div className="pt-4 text-center md:pt-12">
                <span className="mx-auto grid size-16 place-items-center rounded-[24px] bg-[#0a3f37] text-[#9dffe5] shadow-[0_18px_42px_rgba(10,63,55,.18)]">
                  <Sparkles size={25} />
                </span>
                <h2 className="mt-6 text-3xl font-black leading-tight">
                  Ask the base. Keep the receipts.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#667a71]">
                  Mindbase searches your library, filters for relevance, then
                  answers only from cited source chunks.
                </p>
                <div className="mx-auto mt-7 grid max-w-2xl gap-2 sm:grid-cols-2">
                  {suggestions.map((item, index) => (
                    <button
                      key={item}
                      onClick={() => ask(item)}
                      className={`group flex items-center justify-between rounded-2xl border border-[#d9e9e2] bg-white/88 px-4 py-3 text-left text-xs font-bold text-[#344a42] shadow-sm hover:border-[#8adbc8] hover:bg-[#fafffd] ${index === suggestions.length - 1 ? "sm:col-span-2" : ""}`}
                    >
                      {item}
                      <ChevronRight
                        size={14}
                        className="text-[#7f928a] group-hover:text-[#0a8068]"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <article key={message.id} className="mb-10 animate-rise">
                <div className="ml-auto max-w-[82%] rounded-[22px] rounded-br-md bg-[#0a3f37] px-4 py-3 text-sm font-medium leading-6 text-white shadow-[0_12px_24px_rgba(10,63,55,.12)]">
                  {message.question}
                </div>
                <div className="mt-5 flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-2xl bg-[#dff8ef] text-[#08735f]">
                    <BrainCircuit size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-wrap rounded-[22px] border border-[#d9e9e2] bg-white/88 px-5 py-4 text-sm leading-7 text-[#24372f] shadow-sm">
                      {message.answer}
                    </div>
                    {message.sources.length > 0 && (
                      <div className="mt-5">
                        <p className="mb-2 text-[10px] font-black uppercase text-[#7c8f87]">
                          Sources used / {message.sources.length}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {message.sources.map((item, index) => (
                            <button
                              key={item.id}
                              onClick={() => setSource(item)}
                              className="group rounded-2xl border border-[#d9e9e2] bg-white/88 p-3 text-left shadow-sm hover:border-[#8adbc8]"
                            >
                              <div className="flex items-start gap-3">
                                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e5f7f1] text-[11px] font-black text-[#08735f]">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black">
                                    {item.documentTitle}
                                  </p>
                                  <p className="mt-1 text-[10px] font-semibold text-[#7b8d85]">
                                    Chunk {item.chunkIndex + 1} /{" "}
                                    {relevanceLabel(item.score)}
                                    {item.visibility === "private" &&
                                      " / Private"}
                                  </p>
                                </div>
                                <BookOpen
                                  size={14}
                                  className="ml-auto shrink-0 text-[#91a39b] group-hover:text-[#08735f]"
                                />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {loading && (
              <div className="flex gap-3 animate-rise">
                <span className="grid size-9 place-items-center rounded-2xl bg-[#dff8ef] text-[#08735f]">
                  <BrainCircuit size={17} />
                </span>
                <div className="rounded-2xl border border-[#d9e9e2] bg-white/88 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#5f746b]">
                    <Spinner size={15} />
                    Screening sources and composing an answer...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#eef7f4] via-[#eef7f4] to-transparent px-4 pb-5 pt-10 md:px-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] border border-[#cfe1da] bg-white/95 p-2 shadow-[0_18px_44px_rgba(10,63,55,.13)] focus-within:border-[#0aa37f]"
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask();
                }
              }}
              rows={1}
              placeholder="Ask a question about your knowledge base..."
              className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none"
            />
            <button
              disabled={!question.trim() || loading}
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#0a3f37] text-white hover:bg-[#126153] disabled:bg-[#d7e4de]"
            >
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] font-semibold text-[#7c8f87]">
            Answers draw only on documents you can access in {workspace.name},
            including your private files.
          </p>
        </div>
      </section>

      {source && (
        <>
          <button
            aria-label="Close source"
            className="fixed inset-0 z-40 bg-[#071512]/35 backdrop-blur-[2px]"
            onClick={() => setSource(undefined)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto bg-[#fbfffd] p-6 shadow-2xl animate-rise">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#08735f]">
                <FileSearch size={15} />
                Source preview
              </div>
              <button
                onClick={() => setSource(undefined)}
                className="rounded-xl bg-[#e9f3ef] p-2 text-[#48635b]"
              >
                <X size={17} />
              </button>
            </div>
            <h2 className="mt-8 text-2xl font-black leading-tight">
              {source.documentTitle}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{accessLabels[source.accessLevel]}</Badge>
              {source.visibility === "private" && (
                <Badge tone="gold">Private</Badge>
              )}
              <Badge tone="gray">Chunk {source.chunkIndex + 1}</Badge>
              <Badge tone="gold">{relevanceLabel(source.score)}</Badge>
            </div>
            <div className="mt-7 rounded-[22px] border border-[#d9e9e2] bg-[#f6fbf8] p-5">
              <p className="text-sm leading-7 text-[#41564d]">{source.text}</p>
            </div>
            <p className="mt-5 text-xs leading-5 text-[#7c8f87]">
              {source.visibility === "private"
                ? "This chunk comes from one of your private files. Only you can see it; nobody else's answers draw on it."
                : "This is the masked source chunk that survived retrieval relevance checks before being sent to Groq."}
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
