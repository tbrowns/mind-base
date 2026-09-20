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

export default function NewDocumentPage() {
  const router = useRouter();
  const { activeWorkspace, apiFetch } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [accessLevel, setAccess] = useState<AccessLevel>("all-team");
  const [visibility, setVisibility] = useState<DocVisibility>("shared");
  const [file, setFile] = useState<File>();
  const [converting, setConverting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");

  const settings = activeWorkspace?.settings;
  const allowedTypes = settings?.allowedFileTypes ?? null;
  const acceptedList =
    allowedTypes && allowedTypes.length
      ? allowedTypes.map((t) => `.${t}`).join(", ")
      : "";

  // Derived on every render so a workspace switch mid-form (and so a new
  // upload policy) re-checks the chosen file without any extra state.
  const policyWarning = file && settings ? policyIssue(settings, file) : "";

  async function choose(selected?: File) {
    if (!selected) return;
    setFile(selected);
    setError("");
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    const ext = extensionOf(selected.name);
    const isPlainText =
      selected.type === "text/plain" || ext === "txt" || ext === "md";
    if (isPlainText) {
      setText(await selected.text());
    } else {
      const MARKITDOWN_URL = process.env.NEXT_PUBLIC_MARKITDOWN_URL || "";
      if (!MARKITDOWN_URL) {
        setError("NEXT_PUBLIC_MARKITDOWN_URL is not configured.");
        return;
      }
      setConverting(true);
      try {
        const formData = new FormData();
        formData.append("file", selected);
        const res = await fetch(`${MARKITDOWN_URL}/convert`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.detail || "Failed to convert file.");
        }
        const md = await res.text();
        setText(md);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "File conversion failed.",
        );
      } finally {
        setConverting(false);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace) {
      setError("Choose a workspace before processing a document.");
      return;
    }
    setProcessing(true);
    setError("");
    setActive(0);
    const timer = setInterval(
      () => setActive((n) => Math.min(n + 1, steps.length - 1)),
      550,
    );
    try {
      const r = await apiFetch("/api/documents/ingest", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          text,
          accessLevel,
          visibility,
          fileName: file?.name,
          fileType: file?.type || undefined,
          fileSize: file?.size,
        }),
      });
      const data = (await r.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!r.ok) {
        throw new Error(data?.error || `Processing failed (${r.status}).`);
      }
      clearInterval(timer);
      setActive(steps.length);
      setTimeout(() => router.push("/documents"), 500);
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "Processing failed.");
      setProcessing(false);
    }
  }

  const header = (
    <PageHeader
      eyebrow="Add to Mindbase"
      title="Process a document"
      description="Upload a text file or paste source material. Mindbase will mask, chunk, embed and index it."
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
              <label className="text-xs font-semibold text-[#4c5750]">
                Document title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. investment handbook"
                  className="mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a]"
                />
              </label>
              <label className="text-xs font-semibold text-[#4c5750]">
                Short description{" "}
                <span className="font-normal text-[#9aa29d]">(optional)</span>
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
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files[0]);
              }}
              className="mt-5 flex w-full flex-col items-center rounded-2xl border border-dashed border-[#bfcac2] bg-[#fafcf9] px-5 py-7 hover:border-[#21a67a] hover:bg-[#f4faf7]"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-[#eaf5ef] text-[#197a5b]">
                <UploadCloud size={21} />
              </span>
              <span className="mt-3 text-sm font-semibold">
                {converting ? "Converting to Markdown…" : "Drop any file here"}
              </span>
              <span className="mt-1 text-xs text-[#8a948e]">
                {allowedTypes === null
                  ? "or click to browse · PDF, Word, Excel, PowerPoint, images and more supported via MarkItDown"
                  : acceptedList
                    ? `or click to browse · this workspace accepts ${acceptedList}`
                    : "This workspace does not currently accept file uploads. Paste text below instead."}
                {settings && ` · up to ${settings.maxFileSizeMb} MB`}
              </span>
              {file && (
                <span className="mt-3 rounded-full bg-[#e7f5ee] px-3 py-1 text-xs font-medium text-[#197a5b]">
                  {file.name} · {formatSize(file.size)}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={
                  allowedTypes && allowedTypes.length
                    ? allowedTypes.map((t) => `.${t}`).join(",")
                    : undefined
                }
                onChange={(e) => choose(e.target.files?.[0])}
              />
            </button>
            {policyWarning && (
              <div className="mt-3 flex gap-2 rounded-xl bg-[#fff0ed] p-3 text-xs leading-5 text-[#b53d31]">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <p>{policyWarning}</p>
              </div>
            )}
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
              {text.trim() ? text.trim().split(/\s+/).length : 0} words
            </div>
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
                  Into {activeWorkspace.name} · usually under a minute
                </p>
              </div>
            </div>
            {processing ? (
              <div className="mt-6 space-y-3">
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
                      ? "This document stays private to you. "
                      : "This document is shared with the workspace. "}
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
              disabled={processing || converting}
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
                  Process Document
                </>
              )}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}
