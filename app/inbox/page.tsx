"use client";
import { CircleSlash, Inbox, Mail, RefreshCw } from "@/components/icons";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import { GmailAuth } from "@/components/gmail-auth";
import { useSession } from "@/components/session-context";
import { accessLabels, type IngestionJob } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

/** Pull the server `{error}` text out of a failed response, with a fallback. */
async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Non-JSON body (proxy page, empty response); fall through.
  }
  return fallback;
}

function messageOf(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const statusLabel: Record<IngestionJob["status"], string> = {
  needs_review: "Needs review",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

type SyncResult = {
  found: number;
  imported: number;
  skipped: number;
  failed: number;
};

/**
 * Loaded jobs and notices are tagged with the workspace they belong to. A
 * response that lands after the user has switched workspaces is then ignored
 * instead of briefly showing another workspace's inbox, and switching resets
 * the list to its loading state without any extra bookkeeping.
 */
type Feed = { workspaceId: string; jobs: IngestionJob[] };
type Notice = { workspaceId: string; tone: "ok" | "error"; text: string };

export default function InboxPage() {
  const { user, activeWorkspace, apiFetch } = useSession();
  const workspaceId = activeWorkspace?.id;
  // The server returns every member's jobs to admins and owners, and only
  // the caller's own jobs to members.
  const seesWholeWorkspace =
    activeWorkspace?.role === "admin" || activeWorkspace?.role === "owner";

  const [feed, setFeed] = useState<Feed | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [working, setWorking] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const jobs = feed && feed.workspaceId === workspaceId ? feed.jobs : [];
  const loading = !!workspaceId && feed?.workspaceId !== workspaceId;
  const shownNotice =
    notice && notice.workspaceId === workspaceId ? notice : null;

  const load = useCallback(async () => {
    const response = await apiFetch("/api/inbox");
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load the inbox."));
    }
    const data = (await response.json()) as { jobs?: IngestionJob[] };
    return data.jobs ?? [];
  }, [apiFetch]);

  // Refetch whenever the active workspace changes. `apiFetch` is rebound to
  // the new workspace at the same moment, so `load` changes along with it.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    load()
      .then((next) => {
        if (!cancelled) setFeed({ workspaceId, jobs: next });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFeed({ workspaceId, jobs: [] });
        setNotice({
          workspaceId,
          tone: "error",
          text: messageOf(err, "Could not load the inbox."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [load, workspaceId]);

  async function action(jobId: string, kind: "process" | "skip") {
    if (!workspaceId) return;
    const fallback =
      kind === "process"
        ? "Could not process that item."
        : "Could not skip that item.";
    setWorking(jobId);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/inbox/${kind}`, {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, fallback));
      }
      setFeed({ workspaceId, jobs: await load() });
    } catch (err) {
      setNotice({ workspaceId, tone: "error", text: messageOf(err, fallback) });
      // A failed run is recorded on the job itself, so refresh to show it.
      try {
        setFeed({ workspaceId, jobs: await load() });
      } catch {
        // Keep the notice above; the list simply stays as it was.
      }
    } finally {
      setWorking(undefined);
    }
  }

  async function sync() {
    if (!workspaceId) return;
    if (!accessToken) {
      setNotice({
        workspaceId,
        tone: "error",
        text: "Authorize Gmail first.",
      });
      return;
    }

    setSyncing(true);
    setNotice(null);
    try {
      const response = await apiFetch("/api/connectors/gmail/sync", {
        method: "POST",
        body: JSON.stringify({ accessToken }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Gmail sync failed."));
      }
      const data = (await response.json()) as SyncResult;
      setNotice({
        workspaceId,
        tone: "ok",
        text: `Found ${data.found} · imported ${data.imported} · skipped ${data.skipped} · failed ${data.failed}`,
      });
      setFeed({ workspaceId, jobs: await load() });
    } catch (err) {
      setNotice({
        workspaceId,
        tone: "error",
        text: messageOf(err, "Gmail sync failed."),
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Automated knowledge intake"
        title="Mindbase Inbox"
        description="Review Gmail knowledge before it becomes searchable. Gmail imports are private to you by default; meeting imports appear here as an audit trail."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <GmailAuth
              onAuthSuccess={setAccessToken}
              onSignOut={() => setAccessToken(null)}
            />
            <button
              onClick={sync}
              disabled={syncing || !accessToken || !activeWorkspace}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            >
              {syncing ? <Spinner /> : <RefreshCw size={17} />}
              Sync Gmail Inbox
            </button>
          </div>
        }
      />
      {shownNotice && (
        <div
          role={shownNotice.tone === "error" ? "alert" : "status"}
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${shownNotice.tone === "error" ? "border-[#f3cfc9] bg-[#fff0ed] text-[#b53d31]" : "border-[#bee3d1] bg-[#edf8f2] text-[#197a5b]"}`}
        >
          {shownNotice.text}
        </div>
      )}
      {!activeWorkspace ? (
        <div className="mt-8 rounded-2xl border border-[#e3e8e2] bg-white px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
            <Inbox size={20} />
          </span>
          <h2 className="mt-5 text-lg font-black text-[#101b18]">
            No workspace selected
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
            Pick a workspace from the menu at the top right to review its inbox.
          </p>
        </div>
      ) : (
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#e3e8e2] bg-white">
          <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Imported items</h2>
              <p className="mt-1 text-xs text-[#89928c]">
                {seesWholeWorkspace
                  ? "Showing every member's imports. "
                  : "Showing your imports. "}
                Only processed items join the searchable knowledge base.
              </p>
            </div>
            <Badge tone="gold">
              {jobs.filter((job) => job.status === "needs_review").length}{" "}
              pending
            </Badge>
          </div>
          <div className="divide-y divide-[#edf0ec]">
            {jobs.map((job) => {
              const mine = !!user && job.ownerId === user.uid;
              return (
                <article
                  key={job.id}
                  className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_200px_210px] lg:items-center"
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
                        <p className="mt-2 text-xs text-[#b53d31]">
                          {job.error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs text-[#778179]">
                    <p className="font-medium capitalize">{job.sourceType}</p>
                    <p className="mt-1">
                      {new Date(job.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {seesWholeWorkspace && (
                      <p
                        className="mt-1 truncate text-[#60756c]"
                        title={job.ownerEmail}
                      >
                        {job.ownerEmail}
                        {mine ? " (you)" : ""}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{accessLabels[job.accessLevel]}</Badge>
                      {job.visibility === "private" && (
                        <Badge tone="gold">Private</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {job.status === "needs_review" && (
                      <>
                        <button
                          onClick={() => action(job.id, "skip")}
                          disabled={working === job.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#dde3dc] px-3 py-2.5 text-xs font-semibold text-[#647068] disabled:opacity-70"
                        >
                          <CircleSlash size={14} />
                          Skip
                        </button>
                        <button
                          onClick={() => action(job.id, "process")}
                          disabled={working === job.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f3d2e] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-70"
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
              );
            })}
            {loading && (
              <div className="grid place-items-center py-20">
                <Spinner size={24} />
              </div>
            )}
            {!loading && !jobs.length && (
              <div className="px-5 py-16 text-center">
                <Inbox className="mx-auto text-[#9ba59e]" />
                <h3 className="mt-4 text-sm font-semibold">
                  {shownNotice?.tone === "error"
                    ? "The inbox could not be loaded"
                    : "Your Mindbase Inbox is clear"}
                </h3>
                <p className="mt-1 text-xs text-[#89928c]">
                  {shownNotice?.tone === "error"
                    ? "Fix the problem above, then reload to try again."
                    : "Sync Gmail or import a meeting to bring in new knowledge."}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
