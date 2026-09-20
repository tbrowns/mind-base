"use client";
import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  KeyRound,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "@/components/icons";
import type { Workspace } from "@/lib/types";
import { memberRoleLabels } from "@/lib/types";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import {
  useSession,
  type WorkspaceSummary,
} from "@/components/session-context";

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

const JOIN_CODE_LENGTH = 8;
const WORKSPACE_NAME_MAX = 80;

/**
 * Join codes are stored upper-case alphanumeric and the server upper-cases
 * before lookup, so mirror that as the person types rather than rejecting a
 * lower-case paste.
 */
function sanitiseJoinCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, JOIN_CODE_LENGTH);
}

const inputClass =
  "mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal outline-none focus:border-[#21a67a] disabled:bg-[#f4faf8] disabled:text-[#869089]";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a3f37] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-[#dde3dc] bg-white px-3 py-2 text-xs font-semibold text-[#0a3f37] hover:border-[#21a67a] hover:bg-[#f4faf8] disabled:cursor-not-allowed disabled:opacity-60";

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const classes =
    tone === "error"
      ? "border-[#f3cfc9] bg-[#fff0ed] text-[#b53d31]"
      : "border-[#c5e6d8] bg-[#e9f2ee] text-[#0a3f37]";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-6 ${classes}`}
    >
      {tone === "success" && (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

export default function WorkspacesPage() {
  const { activeWorkspace } = useSession();

  return (
    <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Tenancy"
        title="Workspaces"
        description="Everything in Mindbase belongs to a workspace. Switch between the ones you are in, start an organisation, or ask to join one with a code."
        action={
          activeWorkspace ? (
            <p className="inline-flex items-center gap-2 rounded-xl border border-[#d9e9e2] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0a3f37]">
              <span className="size-2 rounded-full bg-[#0aa37f]" />
              Active: {activeWorkspace.name}
            </p>
          ) : undefined
        }
      />

      <section className="mt-8" aria-labelledby="your-workspaces">
        <h2
          id="your-workspaces"
          className="text-sm font-semibold text-[#101b18]"
        >
          Your workspaces
        </h2>
        <p className="mt-1 text-xs text-[#60756c]">
          Documents, chats and the inbox all read from the active workspace.
        </p>
        <WorkspaceList />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CreateWorkspaceCard />
        <JoinWorkspaceCard />
      </div>
    </div>
  );
}

function WorkspaceList() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    refreshWorkspaces,
  } = useSession();
  const [copiedId, setCopiedId] = useState<string>();
  const [copyError, setCopyError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // "Copied" reverts on its own so the button is ready for the next share.
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(undefined), 1800);
    return () => clearTimeout(timer);
  }, [copiedId]);

  async function copy(workspace: WorkspaceSummary) {
    if (!workspace.joinCode) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(workspace.joinCode);
      setCopiedId(workspace.id);
    } catch {
      setCopyError(
        "Could not reach the clipboard. Select the code and copy it by hand.",
      );
    }
  }

  async function retry() {
    setRefreshing(true);
    try {
      await refreshWorkspaces();
    } finally {
      setRefreshing(false);
    }
  }

  // The session loads the list right after sign-in, so an empty list is either
  // that first load still in flight or a request that quietly failed.
  if (!workspaces.length) {
    return (
      <div className="mt-6 rounded-2xl border border-[#e3e8e2] bg-white px-6 py-14 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
          <Layers3 size={20} />
        </span>
        <h3 className="mt-5 text-lg font-black text-[#101b18]">
          Loading your workspaces
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
          Your personal workspace is created the first time you sign in. If this
          takes more than a moment, try again.
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={refreshing}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#dde3dc] px-4 py-2.5 text-sm font-semibold text-[#0a3f37] hover:border-[#21a67a] disabled:opacity-60"
        >
          {refreshing ? <Spinner size={16} /> : <RefreshCw size={16} />}
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {copyError && <Notice tone="error">{copyError}</Notice>}
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspace?.id;
          const isOrg = workspace.type === "org";
          return (
            <li
              key={workspace.id}
              className={`rounded-2xl border bg-white p-5 ${
                isActive
                  ? "border-[#0aa37f] ring-1 ring-[#0aa37f]/30"
                  : "border-[#e3e8e2]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
                    {isOrg ? <ShieldCheck size={18} /> : <Layers3 size={18} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#101b18]">
                      {workspace.name}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={isOrg ? "green" : "gray"}>
                        {isOrg ? "Org" : "Personal"}
                      </Badge>
                      <Badge tone="gray">
                        {memberRoleLabels[workspace.role]}
                      </Badge>
                      {isActive && <Badge tone="green">Active</Badge>}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isActive}
                  aria-pressed={isActive}
                  onClick={() => setActiveWorkspaceId(workspace.id)}
                  className={
                    isActive
                      ? "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#def8ef] px-3 py-2 text-xs font-semibold text-[#08735f]"
                      : `${secondaryButtonClass} shrink-0`
                  }
                >
                  {isActive ? (
                    <>
                      <Check size={14} />
                      Current
                    </>
                  ) : (
                    "Switch to"
                  )}
                </button>
              </div>

              {isOrg && workspace.joinCode && (
                <div className="mt-4 rounded-xl border border-[#e3e8e2] bg-[#f4faf8] p-3.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#929b95]">
                    <KeyRound size={12} />
                    Join code
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <code className="select-all rounded-lg border border-[#e3e8e2] bg-white px-3 py-2 font-mono text-base font-semibold tracking-[0.2em] text-[#0a3f37]">
                      {workspace.joinCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copy(workspace)}
                      className={`${secondaryButtonClass} rounded-lg`}
                    >
                      {copiedId === workspace.id ? (
                        <>
                          <Check size={14} />
                          Copied
                        </>
                      ) : (
                        "Copy"
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#60756c]">
                    Share this code with people you want to admit. They use it
                    to request access, and an admin approves them.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CreateWorkspaceCard() {
  const { apiFetch, refreshWorkspaces, setActiveWorkspaceId } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the workspace a name.");
      return;
    }
    setBusy(true);
    setError("");
    setCreated("");
    try {
      const response = await apiFetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not create the workspace."),
        );
      }
      const data = (await response.json()) as { workspace?: Workspace };
      const workspace = data.workspace;
      if (!workspace?.id) {
        throw new Error("The server did not return the new workspace.");
      }
      // Refresh first so the new id resolves to a real entry before it is
      // made active; otherwise pages would briefly see no workspace at all.
      await refreshWorkspaces();
      setActiveWorkspaceId(workspace.id);
      setCreated(workspace.name);
      setName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the workspace.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e3e8e2] bg-white p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
          <Plus size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#101b18]">
            Create an organisation workspace
          </h2>
          <p className="mt-0.5 text-xs text-[#60756c]">
            You become its owner and get a join code to share.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-5">
        <label className="block text-xs font-semibold text-[#4c5750]">
          Workspace name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={WORKSPACE_NAME_MAX}
            disabled={busy}
            placeholder="e.g. Acme Ventures"
            autoComplete="organization"
            className={inputClass}
          />
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-[#869089]">
            {name.length} / {WORKSPACE_NAME_MAX}
          </p>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={primaryButtonClass}
          >
            {busy ? <Spinner size={16} /> : <Plus size={16} />}
            {busy ? "Creating" : "Create workspace"}
          </button>
        </div>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      {created && (
        <Notice tone="success">
          Created <strong>{created}</strong>. It is now your active workspace,
          and its join code is listed above.
        </Notice>
      )}
    </section>
  );
}

type JoinResponse = {
  status?: string;
  workspace?: { id?: string; name?: string };
};

function JoinWorkspaceCard() {
  const { apiFetch, workspaces, refreshWorkspaces, setActiveWorkspaceId } =
    useSession();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const ready = code.length === JOIN_CODE_LENGTH;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) {
      setError(`Join codes are ${JOIN_CODE_LENGTH} characters long.`);
      return;
    }
    setBusy(true);
    setError("");
    setResult("");
    try {
      const response = await apiFetch("/api/join-requests", {
        method: "POST",
        body: JSON.stringify({
          joinCode: code,
          message: message.trim() || undefined,
        }),
      });
      if (!response.ok) {
        // 404 carries "No workspace matches that code." from the server.
        throw new Error(
          await readError(response, "Could not send that request."),
        );
      }
      const data = (await response.json()) as JoinResponse;
      const name = data.workspace?.name ?? "that workspace";

      if (data.status === "already-a-member") {
        const id = data.workspace?.id;
        if (id) {
          if (!workspaces.some((w) => w.id === id)) await refreshWorkspaces();
          setActiveWorkspaceId(id);
          setResult(
            `You are already a member of ${name}. It is now your active workspace.`,
          );
        } else {
          setResult(`You are already a member of ${name}.`);
        }
      } else if (data.status === "pending") {
        setResult(
          `Request sent to ${name}'s admins. It will appear in your list once they approve it.`,
        );
      } else if (data.status === "approved") {
        await refreshWorkspaces();
        setResult(`You have been added to ${name}.`);
      } else {
        setResult(`Request recorded for ${name}.`);
      }
      setCode("");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send that request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e3e8e2] bg-white p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
          <KeyRound size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#101b18]">
            Join a workspace
          </h2>
          <p className="mt-0.5 text-xs text-[#60756c]">
            Enter the code an admin shared with you.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-5 grid gap-4">
        <label className="block text-xs font-semibold text-[#4c5750]">
          Join code
          <input
            value={code}
            onChange={(e) => setCode(sanitiseJoinCode(e.target.value))}
            maxLength={JOIN_CODE_LENGTH}
            disabled={busy}
            placeholder="ABCD1234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className={`${inputClass} font-mono text-base uppercase tracking-[0.25em] placeholder:tracking-[0.25em] placeholder:text-[#c2cbc6]`}
          />
          <span className="mt-1.5 block text-[11px] font-normal text-[#869089]">
            {code.length} / {JOIN_CODE_LENGTH} characters
          </span>
        </label>
        <label className="block text-xs font-semibold text-[#4c5750]">
          Message to the admins{" "}
          <span className="font-normal text-[#9aa29d]">(optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={busy}
            placeholder="Who you are and why you need access"
            className={`${inputClass} resize-y`}
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !ready}
            className={primaryButtonClass}
          >
            {busy ? <Spinner size={16} /> : <KeyRound size={16} />}
            {busy ? "Sending" : "Request to join"}
          </button>
        </div>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="success">{result}</Notice>}
    </section>
  );
}
