"use client";
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Clock3,
  FileSearch,
  Plus,
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
import { accessLabels, conversationIdOf } from "@/lib/types";

const suggestions = [
  "What is required for Stage 1?",
  "Which bounties are listed in the demo guide?",
  "What does Mindbase need to deliver?",
  "What are the intellectual property rules?",
  "When is the final MiniHack event?",
];

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

/**
 * The model marks emphasis with **double asterisks**. Only that is rendered;
 * anything else in the answer stays plain text, so model output can never
 * inject markup.
 */
function renderAnswer(answer: string) {
  return answer.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    /^\*\*[^*\n]+\*\*$/.test(part) ? (
      <strong key={index} className="font-bold text-[#10231e]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/** The sources behind one answer, one entry per document in first-cited order. */
type DocumentSource = {
  documentId: string;
  documentTitle: string;
  accessLevel: Source["accessLevel"];
  visibility: Source["visibility"];
  passages: string[];
};

/**
 * Matches how the server numbers documents in the prompt (first-seen order),
 * so the [n] citations in an answer line up with the nth card.
 */
function groupSources(sources: Source[]): DocumentSource[] {
  const groups = new Map<string, DocumentSource>();
  sources.forEach((item) => {
    const key = item.documentId || item.documentTitle;
    const text = item.text || item.preview;
    const existing = groups.get(key);
    if (existing) {
      if (text) existing.passages.push(text);
      return;
    }
    groups.set(key, {
      documentId: item.documentId,
      documentTitle: item.documentTitle,
      accessLevel: item.accessLevel,
      visibility: item.visibility,
      passages: text ? [text] : [],
    });
  });
  return [...groups.values()];
}

type Conversation = {
  id: string;
  title: string;
  turns: ChatRecord[];
  updatedAt: string;
};

/** Newest conversation first; turns inside each one oldest first. */
function groupConversations(chats: ChatRecord[]): Conversation[] {
  const groups = new Map<string, ChatRecord[]>();
  chats.forEach((chat) => {
    const id = conversationIdOf(chat);
    groups.set(id, [...(groups.get(id) ?? []), chat]);
  });
  return [...groups.entries()]
    .map(([id, turns]) => {
      const ordered = [...turns].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      return {
        id,
        title: ordered[0].question,
        turns: ordered,
        updatedAt: ordered[ordered.length - 1].createdAt,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function ChatWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const { apiFetch } = useSession();
  const [conversationId, setConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [recent, setRecent] = useState<ChatRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<DocumentSource>();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);

  const conversations = groupConversations(recent);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/chat")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await readError(response, "Could not load your conversations."),
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
              : "Could not load your conversations.",
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

  function startNew() {
    if (loading) return;
    setConversationId(crypto.randomUUID());
    setMessages([]);
    setSource(undefined);
    setError("");
  }

  function open(conversation: Conversation) {
    if (loading) return;
    setConversationId(conversation.id);
    setMessages(conversation.turns);
    setSource(undefined);
    setError("");
  }

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
        body: JSON.stringify({
          question: cleanQuestion,
          history,
          conversationId,
        }),
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
   * Deletes every turn of the conversation. If it is the one on screen, the
   * view resets too, so none of it is sent as history afterwards.
   */
  async function remove(id: string) {
    setDeleting(id);
    setError("");
    try {
      const response = await apiFetch(`/api/chat/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not delete that conversation."),
        );
      }
      setRecent((items) =>
        items.filter((item) => conversationIdOf(item) !== id),
      );
      if (id === conversationId) startNew();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete that conversation.",
      );
    } finally {
      setDeleting(undefined);
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] overflow-hidden">
      <aside className="hidden w-[292px] shrink-0 flex-col border-r border-[#d9e9e2] bg-[#fbfffd]/82 p-4 backdrop-blur xl:flex">
        <button
          onClick={startNew}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#0a3f37] px-4 py-3 text-xs font-bold text-white shadow-[0_12px_26px_rgba(10,63,55,.16)] hover:bg-[#126153] disabled:opacity-60"
        >
          <Plus size={15} />
          New chat
        </button>
        <div className="mt-5 flex items-center gap-2 px-3 text-[10px] font-black uppercase text-[#7c8f87]">
          <Clock3 size={13} />
          Conversations
        </div>
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const current = conversation.id === conversationId;
            return (
              <div
                key={conversation.id}
                className={`group flex items-start gap-1 rounded-2xl ${
                  current
                    ? "bg-[#e5f4ee]"
                    : "hover:bg-[#eef7f3] has-[:focus-visible]:bg-[#eef7f3]"
                }`}
              >
                <button
                  onClick={() => open(conversation)}
                  aria-current={current ? "true" : undefined}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left outline-none"
                >
                  <span
                    className={`line-clamp-2 text-xs font-semibold leading-5 ${current ? "text-[#10231e]" : "text-[#536b62] group-hover:text-[#10231e]"}`}
                  >
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-[#8a9b93]">
                    {conversation.turns.length === 1
                      ? "1 question"
                      : `${conversation.turns.length} questions`}
                    {" · "}
                    {new Date(conversation.updatedAt).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}
                  </span>
                </button>
                <button
                  aria-label={`Delete conversation "${conversation.title}"`}
                  title="Delete conversation"
                  disabled={deleting === conversation.id}
                  onClick={() => void remove(conversation.id)}
                  className={`mr-1.5 mt-2 grid size-7 shrink-0 place-items-center rounded-lg text-[#8a9b93] hover:bg-white hover:text-[#b53d31] focus-visible:opacity-100 ${deleting === conversation.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  {deleting === conversation.id ? (
                    <Spinner size={13} />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            );
          })}
          {!conversations.length && (
            <p className="px-3 py-8 text-center text-xs leading-5 text-[#8a9b93]">
              Your conversations will appear here.
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
                Grounded answers, cited to your documents
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#587067]">
                Asking:{" "}
                <span className="font-black text-[#0a3f37]">
                  {workspace.name}
                </span>
              </p>
            </div>
          </div>
          {/* The sidebar is hidden below xl, so this is the way back to a blank chat there. */}
          {messages.length > 0 && (
            <button
              onClick={startNew}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-[#cfe1da] bg-white px-3 py-2 text-[11px] font-bold text-[#244039] hover:border-[#9fcfbf] disabled:opacity-60 xl:hidden"
            >
              <Plus size={13} />
              New chat
            </button>
          )}
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
                  answers only from the documents it cites.
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

            {messages.map((message) => {
              const documents = groupSources(message.sources);
              return (
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
                        {renderAnswer(message.answer)}
                      </div>
                      {documents.length > 0 && (
                        <div className="mt-5">
                          <p className="mb-2 text-[10px] font-black uppercase text-[#7c8f87]">
                            {documents.length === 1
                              ? "Source"
                              : `Sources / ${documents.length}`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {documents.map((doc, index) => (
                              <button
                                key={doc.documentId || doc.documentTitle}
                                onClick={() => setSource(doc)}
                                className="group flex max-w-full items-center gap-2.5 rounded-2xl border border-[#d9e9e2] bg-white/88 py-2 pl-2 pr-3 text-left shadow-sm hover:border-[#8adbc8]"
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e5f7f1] text-[11px] font-black text-[#08735f]">
                                  {index + 1}
                                </span>
                                <span className="min-w-0 truncate text-xs font-black">
                                  {doc.documentTitle}
                                </span>
                                {doc.visibility === "private" && (
                                  <span className="shrink-0 text-[10px] font-bold text-[#a07a1c]">
                                    Private
                                  </span>
                                )}
                                <BookOpen
                                  size={14}
                                  className="shrink-0 text-[#91a39b] group-hover:text-[#08735f]"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

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
              placeholder={
                messages.length
                  ? "Ask a follow-up..."
                  : "Ask a question about your knowledge base..."
              }
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
                Source
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
            </div>
            <p className="mt-7 text-[10px] font-black uppercase text-[#7c8f87]">
              What Mindbase read from it
            </p>
            <div className="mt-3 space-y-3 rounded-[22px] border border-[#d9e9e2] bg-[#f6fbf8] p-5">
              {source.passages.map((passage, index) => (
                <p
                  key={index}
                  className={`text-sm leading-7 text-[#41564d] ${index ? "border-t border-[#d9e9e2] pt-3" : ""}`}
                >
                  {passage}
                </p>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-[#7c8f87]">
              {source.visibility === "private"
                ? "This is one of your private files. Only you can see it; nobody else's answers draw on it."
                : "Personal information was masked before this text was stored or sent to the model."}
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
