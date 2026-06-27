"use client";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  FileText,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
} from "@/components/icons";
import { useRef, useState } from "react";
import type { AccessLevel } from "@/lib/types";
import { PageHeader, Spinner } from "@/components/ui";
const steps = [
  "Extracting text",
  "Masking sensitive data",
  "Chunking document",
  "Generating embeddings",
  "Saving knowledge",
];
export default function NewDocumentPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [accessLevel, setAccess] = useState<AccessLevel>("all-team");
  const [file, setFile] = useState<File>();
  const [converting, setConverting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  async function choose(selected?: File) {
    if (!selected) return;
    setFile(selected);
    setError("");
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    const isPlainText =
      selected.type === "text/plain" ||
      selected.name.endsWith(".txt") ||
      selected.name.endsWith(".md");
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
    setProcessing(true);
    setError("");
    const timer = setInterval(
      () => setActive((n) => Math.min(n + 1, steps.length - 1)),
      550,
    );
    try {
      const r = await fetch("/api/documents/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          text,
          accessLevel,
          fileName: file?.name,
          fileType: file?.type,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      clearInterval(timer);
      setActive(steps.length);
      setTimeout(() => router.push("/documents"), 500);
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "Processing failed.");
      setProcessing(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Add to Mindbase"
        title="Process a document"
        description="Upload a text file or paste source material. Mindbase will mask, chunk, embed and index it."
      />
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
                  <option value="all-team">All Team</option>
                  <option value="management">Management</option>
                  <option value="management-investees">
                    Management + Investees
                  </option>
                </select>
              </label>
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
                choose(e.dataTransfer.files[0]);
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
                or click to browse · PDF, Word, Excel, PowerPoint, images and
                more supported via MarkItDown
              </span>
              {file && (
                <span className="mt-3 rounded-full bg-[#e7f5ee] px-3 py-1 text-xs font-medium text-[#197a5b]">
                  {file.name}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(e) => choose(e.target.files?.[0])}
              />
            </button>
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
                  Usually under a minute
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
                    Personal information is masked where possible before
                    storage. Basic MVP masking should be reviewed before
                    production use.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle size={15} />
                {error}
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
