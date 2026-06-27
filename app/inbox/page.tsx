"use client";
import { CircleSlash, Inbox, Mail, RefreshCw } from "@/components/icons";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import { GmailAuth } from "@/components/gmail-auth";
import { accessLabels, type IngestionJob } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

const statusLabel = {
  needs_review: "Needs review",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

export default function InboxPage() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/inbox", { cache: "no-store" });
    setJobs((await response.json()).jobs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetch("/api/inbox", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.jobs ?? []);
        setLoading(false);
      });
  }, []);

  async function action(jobId: string, kind: "process" | "skip") {
    setWorking(jobId);
    setError("");
    const response = await fetch(`/api/inbox/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error);
    await load();
    setWorking(undefined);
  }

  async function sync() {
    if (!accessToken) {
      setError("Please authorize Gmail first");
      return;
    }

    setSyncing(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/connectors/gmail/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage(
        `Found ${data.found} · imported ${data.imported} · skipped ${data.skipped} · failed ${data.failed}`,
      );
      await load();
    } else setError(data.error);
    setSyncing(false);
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Automated knowledge intake"
        title="Mindbase Inbox"
        description="Review Gmail knowledge before it becomes searchable. Meeting imports appear here as an audit trail."
        action={
          <div className="flex items-center gap-3">
            <GmailAuth
              onAuthSuccess={(token) => setAccessToken(token)}
              onSignOut={() => {
                setAccessToken(null);
                setError("");
              }}
            />
            <button
              onClick={sync}
              disabled={syncing || !accessToken}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            >
              {syncing ? <Spinner /> : <RefreshCw size={17} />}
              Sync Gmail Inbox
            </button>
          </div>
        }
      />
      {(message || error) && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-[#bee3d1] bg-[#edf8f2] text-[#197a5b]"}`}
        >
          {error || message}
        </div>
      )}
      <section className="mt-8 overflow-hidden rounded-2xl border border-[#e3e8e2] bg-white">
        <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Imported items</h2>
            <p className="mt-1 text-xs text-[#89928c]">
              Only processed items join the searchable knowledge base.
            </p>
          </div>
          <Badge tone="gold">
            {jobs.filter((job) => job.status === "needs_review").length} pending
          </Badge>
        </div>
        <div className="divide-y divide-[#edf0ec]">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_150px_210px] lg:items-center"
            >
              <div className="flex min-w-0 gap-4">
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-xl ${job.sourceType === "gmail" ? "bg-[#edf5f0] text-[#197a5b]" : "bg-[#fff5d9] text-[#8a6511]"}`}
                >
                  {job.sourceType === "gmail" ? (
                    <Mail size={19} />
                  ) : (
                    <Inbox size={19} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {job.title}
                    </h3>
                    <Badge
                      tone={
                        job.status === "completed"
                          ? "green"
                          : job.status === "failed"
                            ? "gold"
                            : "gray"
                      }
                    >
                      {statusLabel[job.status]}
                    </Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#768078]">
                    {job.rawTextPreview}
                  </p>
                  {job.error && (
                    <p className="mt-2 text-xs text-red-600">{job.error}</p>
                  )}
                </div>
              </div>
              <div className="text-xs text-[#778179]">
                <p className="font-medium capitalize">{job.sourceType}</p>
                <p className="mt-1">
                  {new Date(job.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <div className="mt-2">
                  <Badge>{accessLabels[job.accessLevel]}</Badge>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {job.status === "needs_review" && (
                  <>
                    <button
                      onClick={() => action(job.id, "skip")}
                      disabled={working === job.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#dde3dc] px-3 py-2.5 text-xs font-semibold text-[#647068]"
                    >
                      <CircleSlash size={14} />
                      Skip
                    </button>
                    <button
                      onClick={() => action(job.id, "process")}
                      disabled={working === job.id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f3d2e] px-3 py-2.5 text-xs font-semibold text-white"
                    >
                      {working === job.id ? (
                        <Spinner size={14} />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Process
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {loading && (
            <div className="grid place-items-center py-20">
              <Spinner size={24} />
            </div>
          )}
          {!loading && !jobs.length && (
            <div className="px-5 py-16 text-center">
              <Inbox className="mx-auto text-[#9ba59e]" />
              <h3 className="mt-4 text-sm font-semibold">
                Your Mindbase Inbox is clear
              </h3>
              <p className="mt-1 text-xs text-[#89928c]">
                Sync Gmail or import a meeting to bring in new knowledge.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
