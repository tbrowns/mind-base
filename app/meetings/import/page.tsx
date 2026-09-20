"use client";
import {
  AlertCircle,
  CalendarRange,
  Check,
  Layers3,
  LockKeyhole,
  ShieldCheck,
} from "@/components/icons";
import { PageHeader, Spinner } from "@/components/ui";
import { useSession } from "@/components/session-context";
import type { AccessLevel, DocVisibility } from "@/lib/types";
import {
  ACCESS_LEVEL_ORDER,
  accessLabels,
  visibilityLabels,
} from "@/lib/types";
import { useState } from "react";

const sources = ["Google Meet", "Zoom", "Teams", "Manual Notes"];

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

type MeetingForm = {
  meetingTitle: string;
  meetingDate: string;
  source: string;
  participants: string;
  text: string;
  accessLevel: AccessLevel;
  visibility: DocVisibility;
};

type ImportResult = {
  /** Workspace the import was filed into, so a stale result is not shown after switching. */
  workspaceId: string;
  documentId?: string;
  chunkCount: number;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a]";

export default function MeetingImportPage() {
  const { activeWorkspace, apiFetch } = useSession();
  const [form, setForm] = useState<MeetingForm>({
    meetingTitle: "",
    meetingDate: new Date().toISOString().slice(0, 10),
    source: "Google Meet",
    participants: "",
    text: "",
    accessLevel: "management",
    visibility: "shared",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ImportResult>();

  const field = <K extends keyof MeetingForm>(key: K, value: MeetingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!activeWorkspace) {
      setError("Choose a workspace before importing a meeting.");
      return;
    }
    setLoading(true);
    setError("");
    setDone(undefined);
    try {
      const response = await apiFetch("/api/connectors/meetings/import", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        documentId?: string;
        chunkCount?: number;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || `Import failed (${response.status}).`);
      }
      setDone({
        workspaceId: activeWorkspace.id,
        documentId: data?.documentId,
        chunkCount: data?.chunkCount ?? 0,
      });
      setForm((current) => ({
        ...current,
        meetingTitle: "",
        participants: "",
        text: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  const header = (
    <PageHeader
      eyebrow="Meeting knowledge"
      title="Import a transcript"
      description="Turn virtual meeting notes into masked, searchable and cited internal knowledge."
    />
  );

  if (!activeWorkspace) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
        {header}
        <div className="mt-8 rounded-2xl border border-[#e3e8e2] bg-white px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
            <CalendarRange size={20} />
          </span>
          <h2 className="mt-5 text-lg font-black text-[#101b18]">
            No workspace selected
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
            Meeting imports are filed into your active workspace. Pick one from
            the sidebar to import a transcript.
          </p>
        </div>
      </div>
    );
  }

  // Only show a success panel for the workspace it was actually filed into.
  const result = done?.workspaceId === activeWorkspace.id ? done : undefined;

  return (
    <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
      {header}
      <form
        onSubmit={submit}
        className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]"
      >
        <section className="rounded-2xl border border-[#e3e8e2] bg-white p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#4c5750] sm:col-span-2">
              Meeting title
              <input
                value={form.meetingTitle}
                onChange={(e) => field("meetingTitle", e.target.value)}
                placeholder="e.g. Q3 portfolio review"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#4c5750]">
              Meeting date
              <input
                type="date"
                value={form.meetingDate}
                onChange={(e) => field("meetingDate", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#4c5750]">
              Source
              <select
                value={form.source}
                onChange={(e) => field("source", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                {sources.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#4c5750] sm:col-span-2">
              Participants
              <input
                value={form.participants}
                onChange={(e) => field("participants", e.target.value)}
                placeholder="Names separated by commas"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-semibold text-[#4c5750] sm:col-span-2">
              Transcript or notes
              <textarea
                value={form.text}
                onChange={(e) => field("text", e.target.value)}
                rows={14}
                placeholder="Paste the complete meeting transcript or notes…"
                className={`${inputClass} resize-y leading-6`}
              />
            </label>
            <label className="text-xs font-semibold text-[#4c5750] sm:col-span-2">
              Access level
              <select
                value={form.accessLevel}
                onChange={(e) =>
                  field("accessLevel", e.target.value as AccessLevel)
                }
                className={`${inputClass} bg-white`}
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
            <fieldset className="sm:col-span-2">
              <legend className="text-xs font-semibold text-[#4c5750]">
                Who can find it in chat?
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {visibilityOptions.map(({ value, hint, Icon }) => {
                  const selected = form.visibility === value;
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
                        onChange={() => field("visibility", value)}
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
        <aside>
          <div className="sticky top-24 rounded-2xl border border-[#e3e8e2] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#edf6f1] text-[#197a5b]">
                <CalendarRange size={19} />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Process immediately</h3>
                <p className="text-[11px] text-[#89928c]">
                  Into {activeWorkspace.name}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#7c867f]">
              Meeting imports skip review and flow straight through masking,
              chunking and embeddings.
            </p>
            <div className="mt-4 flex gap-2 rounded-xl bg-[#f7f9f6] p-3 text-[11px] leading-5 text-[#6e7972]">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              Emails, phones, IDs and KRA PIN-like values are masked first.
            </div>
            <div className="mt-3 flex gap-2 rounded-xl bg-[#f7f9f6] p-3 text-[11px] leading-5 text-[#6e7972]">
              <LockKeyhole
                size={15}
                className="mt-0.5 shrink-0 text-[#527060]"
              />
              {form.visibility === "private"
                ? "This meeting stays private to you."
                : "This meeting is shared with the workspace."}
            </div>
            {error && (
              <div className="mt-4 flex gap-2 rounded-xl bg-[#fff0ed] p-3 text-xs leading-5 text-[#b53d31]">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {result && (
              <div className="mt-4 rounded-xl bg-[#edf8f2] p-3 text-xs text-[#197a5b]">
                <p className="flex items-center gap-2 font-semibold">
                  <Check size={14} />
                  Meeting imported
                </p>
                <p className="mt-1">
                  {result.chunkCount} searchable chunk
                  {result.chunkCount === 1 ? "" : "s"} created.
                </p>
              </div>
            )}
            <button
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#174f3d] disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Spinner />
                  Processing meeting…
                </>
              ) : (
                <>
                  <CalendarRange size={17} />
                  Import meeting
                </>
              )}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
