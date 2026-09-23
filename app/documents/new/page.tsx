"use client";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  FileText,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
  X,
} from "@/components/icons";
import { useRef, useState } from "react";
import type {
  AccessLevel,
  DocVisibility,
  WorkspaceSettings,
} from "@/lib/types";
import {
  ACCESS_LEVEL_ORDER,
  accessLabels,
  visibilityLabels,
} from "@/lib/types";
import { PageHeader, Spinner } from "@/components/ui";
import { useSession } from "@/components/session-context";

const steps = [
  "Extracting text",
  "Masking sensitive data",
  "Chunking document",
  "Generating embeddings",
  "Saving knowledge",
];

const visibilityOptions: {
  value: DocVisibility;
  hint: string;
  Icon: typeof Layers3;
}[] = [
  {
    value: "shared",
    hint: "Everyone in the workspace at the chosen access tier can find and cite it.",
    Icon: Layers3,
  },
  {
    value: "private",
    hint: "Only you can retrieve it in chat. Admins can review it through the audited admin view.",
    Icon: LockKeyhole,
  },
];

/** Lowercased extension without the dot, or "" when there is none. */
function extensionOf(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side mirror of the workspace upload policy so people hear about a
 * problem before waiting on a conversion. The server re-checks and is the
 * authority; this only produces a warning.
 */
function policyIssue(settings: WorkspaceSettings, file: File): string {
  if (typeof settings.maxFileSizeMb === "number") {
    const limit = settings.maxFileSizeMb * 1024 * 1024;
    if (file.size > limit) {
      return `This file is ${formatSize(file.size)}, above the ${settings.maxFileSizeMb} MB limit for this workspace.`;
    }
  }
  if (settings.allowedFileTypes === null) return "";
  const ext = extensionOf(file.name);
  if (!ext) return "This file needs a recognisable extension.";
  if (!settings.allowedFileTypes.includes(ext)) {
    const allowed = settings.allowedFileTypes.length
      ? settings.allowedFileTypes.map((t) => `.${t}`).join(", ")
      : "no file types";
    return `This workspace accepts ${allowed}. ".${ext}" will be refused.`;
  }
  return "";
}

/**
 * Plain text is read in the browser; everything else goes through MarkItDown.
 * Throws with a message fit to show next to the file.
 */
async function extractText(file: File): Promise<string> {
  const ext = extensionOf(file.name);
  if (file.type === "text/plain" || ext === "txt" || ext === "md") {
    return file.text();
  }
  const MARKITDOWN_URL = process.env.NEXT_PUBLIC_MARKITDOWN_URL || "";
  if (!MARKITDOWN_URL) {
    throw new Error("NEXT_PUBLIC_MARKITDOWN_URL is not configured.");
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${MARKITDOWN_URL}/convert`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || "Failed to convert file.");
  }
  return res.text();
}

function sameFile(a: File, b: File): boolean {
  return (
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
  );
}

type ItemStatus =
  | "queued"
  | "converting"
  | "ready"
  | "processing"
  | "done"
  | "failed";

/** One chosen file; each becomes its own document. */
type QueueItem = {
  id: number;
  file: File;
  title: string;
  text: string;
  status: ItemStatus;
  error: string;
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function NewDocumentPage() {
  const router = useRouter();
  const { activeWorkspace, apiFetch } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [accessLevel, setAccess] = useState<AccessLevel>("all-team");
  const [visibility, setVisibility] = useState<DocVisibility>("shared");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [error, setError] = useState("");

  const settings = activeWorkspace?.settings;
  const allowedTypes = settings?.allowedFileTypes ?? null;
  const acceptedList =
    allowedTypes && allowedTypes.length
      ? allowedTypes.map((t) => `.${t}`).join(", ")
      : "";

  const fileMode = items.length > 0;
  const converting = items.some(
    (i) => i.status === "queued" || i.status === "converting",
  );
  // Anything with extracted text that has not been filed yet, including a
  // file whose earlier attempt failed on the server, so Process retries it.
  const sendable = items.filter(
    (i) => i.text.trim() && (i.status === "ready" || i.status === "failed"),
  );

  function patch(id: number, changes: Partial<QueueItem>) {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  function remove(id: number) {
    setItems((list) => list.filter((item) => item.id !== id));
  }

  async function add(selected: FileList | null | undefined) {
    // Copied before the first await: the caller clears the input right after.
    const incoming = Array.from(selected ?? []).filter(
      (file) => !items.some((item) => sameFile(item.file, file)),
    );
    if (!incoming.length) return;
    setError("");

    const fresh: QueueItem[] = incoming.map((file) => {
      // Checked here so an oversized or refused file is never uploaded to the
      // converter. The server re-checks when it is filed.
      const issue = settings ? policyIssue(settings, file) : "";
      return {
        id: nextId.current++,
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        text: "",
        status: issue ? "failed" : "queued",
        error: issue,
      };
    });
    setItems((list) => [...list, ...fresh]);

    // One at a time, so a large batch does not flood the converter.
    for (const item of fresh) {
      if (item.status !== "queued") continue;
      patch(item.id, { status: "converting" });
      try {
        const extracted = await extractText(item.file);
        patch(
          item.id,
          extracted.trim()
            ? { status: "ready", text: extracted }
            : {
                status: "failed",
                error: "No text could be extracted from this file.",
              },
        );
      } catch (err) {
        patch(item.id, {
          status: "failed",
          error:
            err instanceof Error ? err.message : "File conversion failed.",
        });
      }
    }
  }

  async function ingest(document: {
    title: string;
    text: string;
    file?: File;
  }) {
    const r = await apiFetch("/api/documents/ingest", {
      method: "POST",
      body: JSON.stringify({
        title: document.title,
        description,
        text: document.text,
        accessLevel,
        visibility,
        fileName: document.file?.name,
        fileType: document.file?.type || undefined,
        fileSize: document.file?.size,
      }),
    });
    const data = (await r.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!r.ok) {
      throw new Error(data?.error || `Processing failed (${r.status}).`);
    }
  }

  /** Runs one document through the step animation; resolves to success. */
  async function processOne(document: {
    title: string;
    text: string;
    file?: File;
  }) {
    setActive(0);
    const timer = setInterval(
      () => setActive((n) => Math.min(n + 1, steps.length - 1)),
      550,
    );
    try {
      await ingest(document);
      setActive(steps.length);
    } finally {
      clearInterval(timer);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace) {
      setError("Choose a workspace before processing a document.");
      return;
    }
    setError("");

    if (!fileMode) {
      setProcessing(true);
      setProgress({ index: 1, total: 1 });
      try {
        await processOne({ title, text });
        setTimeout(() => router.push("/documents"), 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Processing failed.");
        setProcessing(false);
      }
      return;
    }

    if (!sendable.length) {
      setError("None of the chosen files are ready to process.");
      return;
    }

    setProcessing(true);
    let failed = 0;
    for (const [n, item] of sendable.entries()) {
      setProgress({ index: n + 1, total: sendable.length });
      patch(item.id, { status: "processing", error: "" });
      try {
        await processOne({
          title: item.title.trim() || item.file.name,
          text: item.text,
          file: item.file,
        });
        patch(item.id, { status: "done" });
      } catch (err) {
        failed++;
        patch(item.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "Processing failed.",
        });
      }
    }

    // Leave only once every chosen file made it in; otherwise stay so the
    // failures stay visible and can be fixed, removed or retried.
    const unfiled = items.filter(
      (i) => i.status !== "done" && !sendable.includes(i),
    ).length;
    if (!failed && !unfiled) {
      setTimeout(() => router.push("/documents"), 500);
      return;
    }
    setProcessing(false);
    const filed =
      items.filter((i) => i.status === "done").length +
      sendable.length -
      failed;
    setError(
      `${filed} of ${items.length} files were added. The rest are marked below: remove them, or press Process to retry.`,
    );
  }

  const header = (
    <PageHeader
      eyebrow="Add to Mindbase"
      title="Process documents"
      description="Upload files or paste source material. Mindbase will mask, chunk, embed and index each one as its own document."
    />
  );

  if (!activeWorkspace) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
        {header}
        <div className="mt-8 rounded-2xl border border-[#e3e8e2] bg-white px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
            <Layers3 size={20} />
          </span>
          <h2 className="mt-5 text-lg font-black text-[#101b18]">
            No workspace selected
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
            Documents are filed into your active workspace. Pick one from the
            sidebar to add a document.
          </p>
        </div>
      </div>
    );
  }

  const pending = items.filter((i) => i.status !== "done").length;
  const buttonLabel = !fileMode
    ? "Process Document"
    : sendable.length > 1
      ? `Process ${sendable.length} documents`
      : "Process document";

  return (
    <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
      {header}
      <form
        onSubmit={submit}
        className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]"
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e3e8e2] bg-white p-5 md:p-6">
            <h2 className="text-sm font-semibold">Document details</h2>
            <div className="mt-5 grid gap-5">
              {!fileMode && (
                <label className="text-xs font-semibold text-[#4c5750]">
                  Document title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. investment handbook"
                    className="mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a]"
                  />
                </label>
              )}
              <label className="text-xs font-semibold text-[#4c5750]">
                Short description{" "}
                <span className="font-normal text-[#9aa29d]">
                  (optional{fileMode && items.length > 1 ? ", applies to every file" : ""})
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What should the team use this for?"
                  className="mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a]"
                />
              </label>
              <label className="text-xs font-semibold text-[#4c5750]">
                Who can access it?
                <select
                  value={accessLevel}
                  onChange={(e) => setAccess(e.target.value as AccessLevel)}
                  className="mt-2 w-full rounded-xl border border-[#dde3dc] bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a]"
                >
                  {ACCESS_LEVEL_ORDER.map((level) => (
                    <option key={level} value={level}>
                      {accessLabels[level]}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-[11px] font-normal leading-4 text-[#9aa29d]">
                  You can only file at a tier you can read yourself.
                </span>
              </label>
              <fieldset>
                <legend className="text-xs font-semibold text-[#4c5750]">
                  Who can find it in chat?
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {visibilityOptions.map(({ value, hint, Icon }) => {
                    const selected = visibility === value;
                    return (
                      <label
                        key={value}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#21a67a]/40 ${
                          selected
                            ? "border-[#21a67a] bg-[#f4faf7]"
                            : "border-[#dde3dc] hover:border-[#bfcac2]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          value={value}
                          checked={selected}
                          onChange={() => setVisibility(value)}
                          className="sr-only"
                        />
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                            selected
                              ? "bg-[#21a67a] text-white"
                              : "bg-[#eaf5ef] text-[#197a5b]"
                          }`}
                        >
                          <Icon size={16} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-[#101b18]">
                            {visibilityLabels[value]}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-[#8a948e]">
                            {hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </section>
          <section className="rounded-2xl border border-[#e3e8e2] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Source content</h2>
              {converting && (
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#197a5b]">
                  <Spinner size={12} /> Converting…
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={processing}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!processing) void add(e.dataTransfer.files);
              }}
              className="mt-5 flex w-full flex-col items-center rounded-2xl border border-dashed border-[#bfcac2] bg-[#fafcf9] px-5 py-7 hover:border-[#21a67a] hover:bg-[#f4faf7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-[#eaf5ef] text-[#197a5b]">
                <UploadCloud size={21} />
              </span>
              <span className="mt-3 text-sm font-semibold">
                {fileMode ? "Drop more files here" : "Drop files here"}
              </span>
              <span className="mt-1 text-xs text-[#8a948e]">
                {allowedTypes === null
                  ? "or click to browse · pick as many as you like · PDF, Word, Excel, PowerPoint, images and more supported via MarkItDown"
                  : acceptedList
                    ? `or click to browse · pick as many as you like · this workspace accepts ${acceptedList}`
                    : "This workspace does not currently accept file uploads. Paste text below instead."}
                {settings && ` · up to ${settings.maxFileSizeMb} MB each`}
              </span>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept={
                  allowedTypes && allowedTypes.length
                    ? allowedTypes.map((t) => `.${t}`).join(",")
                    : undefined
                }
                onChange={(e) => {
                  void add(e.target.files);
                  // Cleared so choosing the same file again after removing it
                  // still fires a change.
                  e.target.value = "";
                }}
              />
            </button>

            {fileMode ? (
              <ul className="mt-4 space-y-2">
                {items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    locked={processing}
                    onTitle={(value) => patch(item.id, { title: value })}
                    onRemove={() => remove(item.id)}
                  />
                ))}
              </ul>
            ) : (
              <>
                <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase text-[#a1a9a4]">
                  <span className="h-px flex-1 bg-[#e8ece7]" />
                  or paste text
                  <span className="h-px flex-1 bg-[#e8ece7]" />
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the complete document text here…"
                  rows={12}
                  className="w-full resize-y rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm leading-6 outline-none focus:border-[#21a67a]"
                />
                <div className="mt-2 text-right text-[10px] text-[#9aa29d]">
                  {wordCount(text)} words
                </div>
              </>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="sticky top-24 rounded-2xl border border-[#e3e8e2] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#edf6f1] text-[#197a5b]">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Ready to process</h3>
                <p className="text-[11px] text-[#89928c]">
                  Into {activeWorkspace.name}
                  {fileMode
                    ? ` · ${pending} ${pending === 1 ? "file" : "files"} to go`
                    : " · usually under a minute"}
                </p>
              </div>
            </div>
            {processing ? (
              <div className="mt-6 space-y-3">
                {progress.total > 1 && (
                  <p className="text-[11px] font-bold uppercase text-[#197a5b]">
                    Document {progress.index} of {progress.total}
                  </p>
                )}
                {steps.map((step, i) => (
                  <div
                    key={step}
                    className={`flex items-center gap-3 text-xs ${i <= active ? "text-[#29483b]" : "text-[#a2aaa5]"}`}
                  >
                    <span
                      className={`grid size-6 place-items-center rounded-full ${i < active || active === steps.length ? "bg-[#21a67a] text-white" : i === active ? "bg-[#e6f4ed] text-[#197a5b]" : "bg-[#f1f3f0]"}`}
                    >
                      {i < active || active === steps.length ? (
                        <Check size={13} />
                      ) : i === active ? (
                        <Spinner size={13} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-[#f7f9f6] p-3 text-[11px] leading-5 text-[#6e7972]">
                <div className="flex gap-2">
                  <LockKeyhole
                    size={15}
                    className="mt-0.5 shrink-0 text-[#527060]"
                  />
                  <p>
                    {visibility === "private"
                      ? "Stays private to you. "
                      : "Shared with the workspace. "}
                    Personal information is masked where possible before
                    storage. Basic MVP masking should be reviewed before
                    production use.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <button
              disabled={
                processing || converting || (fileMode && !sendable.length)
              }
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#174f3d] disabled:opacity-70"
            >
              {processing ? (
                <>
                  <Spinner />
                  Processing…
                </>
              ) : (
                <>
                  <FileText size={17} />
                  {buttonLabel}
                </>
              )}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}

function statusText(item: QueueItem): string {
  switch (item.status) {
    case "queued":
      return "Waiting to convert";
    case "converting":
      return "Converting…";
    case "ready":
      return `${wordCount(item.text)} words ready`;
    case "processing":
      return "Processing…";
    case "done":
      return "Added";
    case "failed":
      return item.error;
  }
}

function QueueRow({
  item,
  locked,
  onTitle,
  onRemove,
}: {
  item: QueueItem;
  locked: boolean;
  onTitle: (value: string) => void;
  onRemove: () => void;
}) {
  const busy = item.status === "converting" || item.status === "processing";
  const failed = item.status === "failed";
  const done = item.status === "done";

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        failed
          ? "border-[#f3c9c2] bg-[#fff7f5]"
          : done
            ? "border-[#cfe8dc] bg-[#f4faf7]"
            : "border-[#e3e8e2]"
      }`}
    >
      <span
        className={`mt-1 grid size-7 shrink-0 place-items-center rounded-lg ${
          failed
            ? "bg-[#fde3de] text-[#b53d31]"
            : done
              ? "bg-[#21a67a] text-white"
              : "bg-[#eaf5ef] text-[#197a5b]"
        }`}
      >
        {busy ? (
          <Spinner size={13} />
        ) : failed ? (
          <AlertCircle size={14} />
        ) : done ? (
          <Check size={14} />
        ) : (
          <FileText size={14} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <input
          value={item.title}
          onChange={(e) => onTitle(e.target.value)}
          disabled={locked || done}
          aria-label={`Title for ${item.file.name}`}
          className="w-full rounded-lg border border-transparent px-1.5 py-1 text-sm font-semibold text-[#101b18] outline-none hover:border-[#dde3dc] focus:border-[#21a67a] disabled:bg-transparent disabled:hover:border-transparent"
        />
        <p className="truncate px-1.5 text-[11px] text-[#8a948e]">
          {item.file.name} · {formatSize(item.file.size)}
        </p>
        <p
          className={`px-1.5 text-[11px] leading-4 ${failed ? "text-[#b53d31]" : "text-[#527060]"}`}
        >
          {statusText(item)}
        </p>
      </div>
      {!done && (
        <button
          type="button"
          onClick={onRemove}
          disabled={locked}
          aria-label={`Remove ${item.file.name}`}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[#8a948e] hover:bg-[#f1f3f0] hover:text-[#101b18] disabled:opacity-40"
        >
          <X size={14} />
        </button>
      )}
    </li>
  );
}
