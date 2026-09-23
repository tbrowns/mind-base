"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  FileSearch,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Network,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "@/components/icons";
import type {
  AccessLevel,
  AuditEvent,
  DocVisibility,
  JoinRequest,
  MemberRole,
  Membership,
  WorkspaceSettings,
} from "@/lib/types";
import {
  ACCESS_LEVEL_ORDER,
  MEMBER_ROLES,
  NOTIFICATION_MAX_LENGTH,
  accessLabels,
  memberRoleLabels,
} from "@/lib/types";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import {
  useSession,
  type WorkspaceSummary,
} from "@/components/session-context";

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

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

/** Mirror of the server's rank: an unknown role is the least privileged. */
function roleRank(role: MemberRole): number {
  return Math.max(0, MEMBER_ROLES.indexOf(role));
}

function tierRank(level: AccessLevel): number {
  return Math.max(0, ACCESS_LEVEL_ORDER.indexOf(level));
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function newestFirst<T extends { createdAt: string }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * "pdf, .md report.txt" -> ["pdf", "md", "txt"]. Same normalisation the
 * server applies, so the preview chips show exactly what will be stored.
 */
function parseExtensions(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const lowered = part.trim().toLowerCase();
    const ext = lowered.includes(".")
      ? lowered.slice(lowered.lastIndexOf(".") + 1)
      : lowered;
    if (ext) seen.add(ext);
  }
  return Array.from(seen);
}

function describePolicy(settings: WorkspaceSettings) {
  const types =
    settings.allowedFileTypes === null
      ? "any file type"
      : settings.allowedFileTypes.length
        ? settings.allowedFileTypes.map((t) => `.${t}`).join(", ")
        : "no file types";
  return `Members may upload ${types}, up to ${settings.maxFileSizeMb} MB each.`;
}

const auditActionLabels: Record<AuditEvent["action"], string> = {
  "member.removed": "Member removed",
  "member.role-changed": "Role changed",
  "member.access-changed": "Access tier changed",
  "join-request.approved": "Join request approved",
  "join-request.rejected": "Join request rejected",
  "document.deleted-by-admin": "Document deleted",
  "document.access-changed-by-admin": "Document access changed",
  "document.viewed-by-admin": "Private document viewed",
  "workspace.settings-changed": "Upload policy changed",
  "notification.sent": "Notification sent",
};

function auditActionLabel(action: string) {
  return (auditActionLabels as Record<string, string>)[action] ?? action;
}

/**
 * Load something for the active workspace and ignore results from a run that
 * was superseded (workspace switched, component unmounted). `version` lets a
 * parent ask for a silent reload after an audited action elsewhere on the page.
 */
function useLoader<T>(load: () => Promise<T>, initial: T, version = 0) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err, "Could not load."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, version, tick]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  return { data, setData, loading, error, setError, refresh };
}

/* ---------------------------------------------------------------------------
 * Shared styling
 * ------------------------------------------------------------------------- */

const inputClass =
  "mt-2 w-full rounded-xl border border-[#dde3dc] px-3.5 py-3 text-sm font-normal text-[#101b18] outline-none focus:border-[#21a67a] disabled:bg-[#f4faf8] disabled:text-[#869089]";
const selectClass =
  "rounded-lg border border-[#dde3dc] bg-white px-2.5 py-1.5 text-xs font-medium text-[#101b18] outline-none focus:border-[#21a67a] disabled:cursor-not-allowed disabled:bg-[#f4faf8] disabled:text-[#869089]";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a3f37] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-[#dde3dc] bg-white px-3 py-2 text-xs font-semibold text-[#0a3f37] hover:border-[#21a67a] hover:bg-[#f4faf8] disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-[#f3cfc9] bg-white px-3 py-2 text-xs font-semibold text-[#b53d31] hover:bg-[#fff0ed] disabled:cursor-not-allowed disabled:opacity-60";
const headRowClass = "text-[10px] font-bold uppercase text-[#929b95]";

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const classes =
    tone === "error"
      ? "border-[#f3cfc9] bg-[#fff0ed] text-[#b53d31]"
      : tone === "success"
        ? "border-[#c5e6d8] bg-[#e9f2ee] text-[#0a3f37]"
        : "border-[#d9e9e2] bg-[#f4faf8] text-[#587067]";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-6 ${classes}`}
    >
      {tone === "success" && (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
      )}
      {tone === "error" && (
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
      )}
      {tone === "info" && (
        <LockKeyhole size={18} className="mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

function Card({
  id,
  icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-3xl border border-[#d9e9e2] bg-white"
    >
      <div className="flex flex-col gap-4 border-b border-[#edf0ec] p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
            {icon}
          </span>
          <div>
            <h2
              id={`${id}-title`}
              className="text-sm font-semibold text-[#101b18]"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-[#60756c]">
              {description}
            </p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RefreshButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`${secondaryButtonClass} shrink-0`}
    >
      {busy ? <Spinner size={14} /> : <RefreshCw size={14} />}
      Refresh
    </button>
  );
}

function TableState({
  colSpan,
  loading,
  message,
}: {
  colSpan: number;
  loading: boolean;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-14 text-center text-sm text-[#7e8882]">
        {loading ? <Spinner size={24} /> : message}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function AdminPage() {
  const { activeWorkspace } = useSession();
  const canAdminister =
    activeWorkspace?.role === "admin" || activeWorkspace?.role === "owner";

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Administration"
        title="Admin console"
        description="Admit people, set what they can see and upload, keep an eye on every file in the workspace, and review what other admins have done."
        action={
          activeWorkspace ? (
            <p className="inline-flex items-center gap-2 rounded-xl border border-[#d9e9e2] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0a3f37]">
              <span className="size-2 rounded-full bg-[#0aa37f]" />
              {activeWorkspace.name}
              <Badge tone="gray">{memberRoleLabels[activeWorkspace.role]}</Badge>
            </p>
          ) : undefined
        }
      />

      {!activeWorkspace ? (
        <EmptyCard
          icon={<ShieldCheck size={20} />}
          title="No workspace selected"
          body="Pick a workspace from the menu at the top right to administer it."
        />
      ) : !canAdminister ? (
        <EmptyCard
          icon={<LockKeyhole size={20} />}
          title="Admins only"
          body={`Administration of ${activeWorkspace.name} is open to its admins and owner. Ask one of them if you need something changed.`}
        />
      ) : (
        // Keyed on the workspace so every section's state resets and reloads
        // when the active workspace changes.
        <AdminConsole key={activeWorkspace.id} workspace={activeWorkspace} />
      )}
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-8 rounded-3xl border border-[#d9e9e2] bg-white px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
        {icon}
      </span>
      <h2 className="mt-5 text-lg font-black text-[#101b18]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
        {body}
      </p>
    </div>
  );
}

const SECTIONS = [
  { id: "requests", label: "Requests" },
  { id: "members", label: "Members" },
  { id: "files", label: "Files" },
  { id: "policy", label: "Upload policy" },
  { id: "notify", label: "Notify" },
  { id: "audit", label: "Audit log" },
];

function AdminConsole({ workspace }: { workspace: WorkspaceSummary }) {
  const { user, apiFetch } = useSession();
  // Bumped after any audited action so the log at the bottom stays current
  // without asking the person to refresh it by hand.
  const [auditVersion, setAuditVersion] = useState(0);
  const touchAudit = useCallback(() => setAuditVersion((v) => v + 1), []);

  const loadMembers = useCallback(async () => {
    const response = await apiFetch(`/api/workspaces/${workspace.id}/members`);
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load members."));
    }
    const data = (await response.json()) as { members?: Membership[] };
    return data.members ?? [];
  }, [apiFetch, workspace.id]);

  const members = useLoader<Membership[]>(loadMembers, []);
  const me = members.data.find((m) => m.userId === user?.uid);

  return (
    <div className="mt-8 grid gap-6">
      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-[#d9e9e2] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0a3f37] hover:border-[#21a67a] hover:bg-[#f4faf8]"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <PendingRequestsCard
        workspace={workspace}
        onDecided={(list) => {
          members.setData(list);
          touchAudit();
        }}
      />

      <MembersCard
        workspace={workspace}
        members={members.data}
        loading={members.loading}
        error={members.error}
        onRefresh={members.refresh}
        setMembers={members.setData}
        myUserId={user?.uid}
        myAccessLevel={me?.accessLevel}
        onAudited={touchAudit}
      />

      <FilesCard onAudited={touchAudit} />

      <div className="grid gap-6 lg:grid-cols-2">
        <UploadPolicyCard workspace={workspace} onAudited={touchAudit} />
        <NotificationCard
          members={members.data}
          myUserId={user?.uid}
          onAudited={touchAudit}
        />
      </div>

      <AuditCard workspace={workspace} version={auditVersion} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * (a) Pending join requests
 * ------------------------------------------------------------------------- */

function PendingRequestsCard({
  workspace,
  onDecided,
}: {
  workspace: WorkspaceSummary;
  onDecided: (members: Membership[]) => void;
}) {
  const { apiFetch } = useSession();
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    const response = await apiFetch(
      `/api/workspaces/${workspace.id}/join-requests?status=pending`,
    );
    if (!response.ok) {
      throw new Error(
        await readError(response, "Could not load join requests."),
      );
    }
    const data = (await response.json()) as { requests?: JoinRequest[] };
    return (data.requests ?? []).slice().sort(newestFirst);
  }, [apiFetch, workspace.id]);

  const requests = useLoader<JoinRequest[]>(load, []);

  async function decide(request: JoinRequest, decision: "approve" | "reject") {
    setBusyId(request.id);
    setActionError("");
    try {
      const response = await apiFetch(
        `/api/workspaces/${workspace.id}/join-requests`,
        {
          method: "POST",
          body: JSON.stringify({ requestId: request.id, decision }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not record that decision."),
        );
      }
      const data = (await response.json()) as { members?: Membership[] };
      requests.setData((prev) => prev.filter((r) => r.id !== request.id));
      if (data.members) onDecided(data.members);
    } catch (err) {
      setActionError(messageOf(err, "Could not record that decision."));
      // A 409 means someone else decided it first; drop it from the list.
      requests.refresh();
    } finally {
      setBusyId(undefined);
    }
  }

  const error = actionError || requests.error;

  return (
    <Card
      id="requests"
      icon={<KeyRound size={18} />}
      title="Pending requests"
      description={
        workspace.joinCode
          ? `People who entered join code ${workspace.joinCode}. Approved members start as Members at the All Team tier.`
          : "People who asked to join with the workspace code. Approved members start as Members at the All Team tier."
      }
      action={
        <RefreshButton onClick={requests.refresh} busy={requests.loading} />
      }
    >
      {error && (
        <div className="px-5 pt-4 md:px-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {requests.loading && !requests.data.length ? (
        <div className="py-14 text-center">
          <Spinner size={24} />
        </div>
      ) : !requests.data.length ? (
        <p className="px-5 py-10 text-center text-sm text-[#7e8882]">
          No one is waiting to join.
        </p>
      ) : (
        <ul className="divide-y divide-[#edf0ec]">
          {requests.data.map((request) => {
            const busy = busyId === request.id;
            return (
              <li
                key={request.id}
                className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#101b18]">
                    {request.displayName || request.email}
                  </p>
                  {request.displayName && (
                    <p className="truncate text-xs text-[#60756c]">
                      {request.email}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[#869089]">
                    Requested {formatDateTime(request.createdAt)}
                  </p>
                  {request.message && (
                    <blockquote className="mt-2 max-w-xl rounded-xl bg-[#f4faf8] px-3.5 py-2.5 text-sm leading-6 text-[#4c5750]">
                      {request.message}
                    </blockquote>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(request, "reject")}
                    className={dangerButtonClass}
                  >
                    <X size={14} />
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(request, "approve")}
                    className={`${primaryButtonClass} px-3.5 py-2 text-xs`}
                  >
                    {busy ? <Spinner size={14} /> : <Check size={14} />}
                    Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * (b) Members
 * ------------------------------------------------------------------------- */

function MembersCard({
  workspace,
  members,
  loading,
  error,
  onRefresh,
  setMembers,
  myUserId,
  myAccessLevel,
  onAudited,
}: {
  workspace: WorkspaceSummary;
  members: Membership[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  setMembers: Dispatch<SetStateAction<Membership[]>>;
  myUserId?: string;
  myAccessLevel?: AccessLevel;
  onAudited: () => void;
}) {
  const { apiFetch } = useSession();
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState("");

  const myRank = roleRank(workspace.role);
  // Until our own membership row is known, offer every tier; the server still
  // enforces the real ceiling and the 403 text is surfaced below.
  const myTier = myAccessLevel
    ? tierRank(myAccessLevel)
    : ACCESS_LEVEL_ORDER.length - 1;

  async function patch(
    member: Membership,
    change: { role?: MemberRole; accessLevel?: AccessLevel },
  ) {
    setBusyId(member.userId);
    setActionError("");
    try {
      const response = await apiFetch(
        `/api/workspaces/${workspace.id}/members`,
        {
          method: "PATCH",
          body: JSON.stringify({ userId: member.userId, ...change }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not update that member."),
        );
      }
      const data = (await response.json()) as { member?: Membership };
      const updated = data.member ?? { ...member, ...change };
      setMembers((prev) =>
        prev.map((m) => (m.userId === updated.userId ? updated : m)),
      );
      onAudited();
    } catch (err) {
      setActionError(messageOf(err, "Could not update that member."));
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(member: Membership) {
    if (
      !confirm(
        `Remove ${member.email} from ${workspace.name}? Their documents stay in the workspace.`,
      )
    ) {
      return;
    }
    setBusyId(member.userId);
    setActionError("");
    try {
      const response = await apiFetch(
        `/api/workspaces/${workspace.id}/members?userId=${encodeURIComponent(member.userId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not remove that member."),
        );
      }
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      onAudited();
    } catch (err) {
      setActionError(messageOf(err, "Could not remove that member."));
    } finally {
      setBusyId(undefined);
    }
  }

  const shownError = actionError || error;

  return (
    <Card
      id="members"
      icon={<Network size={18} />}
      title="Members"
      description="Who is in the workspace, what they can do, and which document tiers they can read."
      action={<RefreshButton onClick={onRefresh} busy={loading} />}
    >
      {shownError && (
        <div className="px-5 pt-4 md:px-6">
          <Notice tone="error">{shownError}</Notice>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className={headRowClass}>
              <th className="px-5 py-3 md:px-6">Member</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Access tier</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0ec]">
            {members.map((member) => {
              const isMe = member.userId === myUserId;
              // Same rule as the server: never yourself, never anyone whose
              // rank is at or above your own.
              const locked = isMe || roleRank(member.role) >= myRank;
              const busy = busyId === member.userId;
              const roleOptions = MEMBER_ROLES.filter(
                (r) => roleRank(r) <= myRank || r === member.role,
              );
              const tierOptions = ACCESS_LEVEL_ORDER.filter(
                (l) => tierRank(l) <= myTier || l === member.accessLevel,
              );
              return (
                <tr key={member.id} className="hover:bg-[#fafbf9]">
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#101b18]">
                          {member.displayName || member.email}
                        </p>
                        {member.displayName && (
                          <p className="truncate text-xs text-[#60756c]">
                            {member.email}
                          </p>
                        )}
                      </div>
                      {isMe && <Badge tone="green">You</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      aria-label={`Role for ${member.email}`}
                      value={member.role}
                      disabled={locked || busy}
                      onChange={(e) =>
                        void patch(member, {
                          role: e.target.value as MemberRole,
                        })
                      }
                      className={selectClass}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {memberRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      aria-label={`Access tier for ${member.email}`}
                      value={member.accessLevel}
                      disabled={locked || busy}
                      onChange={(e) =>
                        void patch(member, {
                          accessLevel: e.target.value as AccessLevel,
                        })
                      }
                      className={selectClass}
                    >
                      {tierOptions.map((level) => (
                        <option key={level} value={level}>
                          {accessLabels[level]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#6f7973]">
                    {formatDate(member.joinedAt)}
                  </td>
                  <td className="px-5 py-4 text-right md:px-6">
                    {busy ? (
                      <span className="inline-flex p-2 text-[#9da59f]">
                        <Spinner size={16} />
                      </span>
                    ) : (
                      !locked && (
                        <button
                          type="button"
                          onClick={() => void remove(member)}
                          className={dangerButtonClass}
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {loading && !members.length && (
              <TableState colSpan={5} loading message="" />
            )}
            {!loading && !members.length && (
              <TableState
                colSpan={5}
                loading={false}
                message={
                  error ? "Members could not be loaded." : "No members yet."
                }
              />
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#edf0ec] px-5 py-3 text-xs leading-5 text-[#869089] md:px-6">
        You cannot change your own row or anyone at or above your role, and you
        can only grant roles and tiers up to your own.
        {workspace.type === "personal" &&
          " This is your personal workspace, so there is nobody else to manage."}
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * (c) Files: the governance view, including private documents
 * ------------------------------------------------------------------------- */

type AdminDocument = {
  id: string;
  title: string;
  fileName?: string;
  fileType?: string;
  visibility: DocVisibility;
  accessLevel: AccessLevel;
  uploadedAt: string;
  chunkCount: number;
  sourceType?: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  ownerIsMember: boolean;
};

type AdminDocumentsData = {
  documents: AdminDocument[];
  totals: { documents: number; shared: number; private: number };
};

const emptyDocuments: AdminDocumentsData = {
  documents: [],
  totals: { documents: 0, shared: 0, private: 0 },
};

/**
 * Takes no workspace prop on purpose: the header comes from apiFetch, whose
 * identity changes with the active workspace, and the console above is keyed
 * on the workspace id, so a switch remounts this card and reloads.
 */
function FilesCard({ onAudited }: { onAudited: () => void }) {
  const { apiFetch } = useSession();
  const [deleting, setDeleting] = useState<string>();
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/documents");
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load files."));
    }
    const data = (await response.json()) as Partial<AdminDocumentsData>;
    const documents = (data.documents ?? [])
      .slice()
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return {
      documents,
      totals: data.totals ?? {
        documents: documents.length,
        shared: documents.filter((d) => d.visibility === "shared").length,
        private: documents.filter((d) => d.visibility === "private").length,
      },
    };
  }, [apiFetch]);

  const files = useLoader<AdminDocumentsData>(load, emptyDocuments);

  async function remove(doc: AdminDocument) {
    if (
      !confirm(
        `Delete "${doc.title}" and all its chunks? This is recorded in the audit log.`,
      )
    ) {
      return;
    }
    setDeleting(doc.id);
    setActionError("");
    try {
      const response = await apiFetch(`/api/documents/${doc.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not delete that document."),
        );
      }
      files.setData((prev) => {
        const documents = prev.documents.filter((d) => d.id !== doc.id);
        return {
          documents,
          totals: {
            documents: documents.length,
            shared: documents.filter((d) => d.visibility === "shared").length,
            private: documents.filter((d) => d.visibility === "private")
              .length,
          },
        };
      });
      onAudited();
    } catch (err) {
      setActionError(messageOf(err, "Could not delete that document."));
    } finally {
      setDeleting(undefined);
    }
  }

  const { documents, totals } = files.data;
  const shownError = actionError || files.error;

  return (
    <Card
      id="files"
      icon={<FileSearch size={18} />}
      title="Files"
      description="Every document in the workspace, including members' private files. Private files never surface in your own chat answers."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">{totals.documents} total</Badge>
          <Badge tone="green">{totals.shared} shared</Badge>
          <Badge tone="gold">{totals.private} private</Badge>
          <RefreshButton onClick={files.refresh} busy={files.loading} />
        </div>
      }
    >
      <div className="grid gap-3 px-5 pt-4 md:px-6">
        <Notice tone="info">
          Deleting a file here, and opening a private file as an admin, is
          recorded in the audit log below with your email.
        </Notice>
        {shownError && <Notice tone="error">{shownError}</Notice>}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead>
            <tr className={headRowClass}>
              <th className="px-5 py-3 md:px-6">Document</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Visibility</th>
              <th className="px-5 py-3">Access</th>
              <th className="px-5 py-3">Uploaded</th>
              <th className="px-5 py-3">Chunks</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0ec]">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-[#fafbf9]">
                <td className="px-5 py-4 md:px-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
                      <FileText size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#101b18]">
                        {doc.title}
                      </p>
                      <p className="mt-1 max-w-xs truncate text-xs text-[#8a948e]">
                        {doc.fileName ||
                          (doc.sourceType
                            ? `Imported from ${doc.sourceType}`
                            : "Internal knowledge source")}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <p className="max-w-[220px] truncate text-sm text-[#101b18]">
                    {doc.ownerName}
                  </p>
                  {doc.ownerName !== doc.ownerEmail && (
                    <p className="max-w-[220px] truncate text-xs text-[#60756c]">
                      {doc.ownerEmail}
                    </p>
                  )}
                  {!doc.ownerIsMember && (
                    <span className="mt-1 inline-block">
                      <Badge tone="gray">Former member</Badge>
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {doc.visibility === "private" ? (
                    <Badge tone="gold">Private</Badge>
                  ) : (
                    <Badge tone="green">Shared</Badge>
                  )}
                </td>
                <td className="px-5 py-4">
                  <Badge tone="gray">{accessLabels[doc.accessLevel]}</Badge>
                </td>
                <td className="px-5 py-4 text-xs text-[#6f7973]">
                  {formatDate(doc.uploadedAt)}
                </td>
                <td className="px-5 py-4 text-sm font-medium">
                  {doc.chunkCount}
                </td>
                <td className="px-5 py-4 text-right md:px-6">
                  <button
                    type="button"
                    aria-label={`Delete ${doc.title}`}
                    disabled={deleting === doc.id}
                    onClick={() => void remove(doc)}
                    className="rounded-lg p-2 text-[#9da59f] hover:bg-red-50 hover:text-red-600 disabled:cursor-wait"
                  >
                    {deleting === doc.id ? (
                      <Spinner size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {files.loading && !documents.length && (
              <TableState colSpan={7} loading message="" />
            )}
            {!files.loading && !documents.length && (
              <TableState
                colSpan={7}
                loading={false}
                message={
                  files.error
                    ? "Files could not be loaded."
                    : "Nothing has been uploaded to this workspace yet."
                }
              />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * (d) Upload policy
 * ------------------------------------------------------------------------- */

const MAX_FILE_SIZE_CEILING_MB = 200;

function UploadPolicyCard({
  workspace,
  onAudited,
}: {
  workspace: WorkspaceSummary;
  onAudited: () => void;
}) {
  const { apiFetch, refreshWorkspaces } = useSession();
  const settings = workspace.settings;
  const [allowAny, setAllowAny] = useState(settings.allowedFileTypes === null);
  const [types, setTypes] = useState(
    (settings.allowedFileTypes ?? []).join(", "),
  );
  const [maxSize, setMaxSize] = useState(String(settings.maxFileSizeMb));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const parsedTypes = useMemo(() => parseExtensions(types), [types]);

  const savedTypes = (settings.allowedFileTypes ?? []).join(",");
  const dirty =
    allowAny !== (settings.allowedFileTypes === null) ||
    (!allowAny && parsedTypes.join(",") !== savedTypes) ||
    Number(maxSize) !== settings.maxFileSizeMb;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const size = Number(maxSize);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE_CEILING_MB) {
      setError(`Size limit must be between 1 and ${MAX_FILE_SIZE_CEILING_MB} MB.`);
      return;
    }
    if (
      !allowAny &&
      parsedTypes.length === 0 &&
      !confirm(
        "No extensions are listed, so members will not be able to upload any files. Save anyway?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const response = await apiFetch(
        `/api/workspaces/${workspace.id}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            allowedFileTypes: allowAny ? null : parsedTypes,
            maxFileSizeMb: Math.round(size),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not save the upload policy."),
        );
      }
      const data = (await response.json()) as { settings?: WorkspaceSettings };
      if (data.settings) {
        // Show the normalised form the server actually stored.
        setAllowAny(data.settings.allowedFileTypes === null);
        setTypes((data.settings.allowedFileTypes ?? []).join(", "));
        setMaxSize(String(data.settings.maxFileSizeMb));
        setSaved(describePolicy(data.settings));
      } else {
        setSaved("Upload policy saved.");
      }
      onAudited();
      // The session owns activeWorkspace.settings, so the upload form and
      // every other page only see the new policy once it is pulled again.
      await refreshWorkspaces();
    } catch (err) {
      setError(messageOf(err, "Could not save the upload policy."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="policy"
      icon={<Settings size={18} />}
      title="Upload policy"
      description="What members may add to the library. Uploads outside the policy are refused with the reason."
    >
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 p-5 md:p-6">
        <label className="flex items-start gap-3 text-sm text-[#101b18]">
          <input
            type="checkbox"
            checked={allowAny}
            disabled={busy}
            onChange={(e) => setAllowAny(e.target.checked)}
            className="mt-1 size-4 accent-[#0aa37f]"
          />
          <span>
            <span className="font-semibold">Allow any file type</span>
            <span className="block text-xs leading-5 text-[#60756c]">
              When off, only the extensions listed below are accepted.
            </span>
          </span>
        </label>

        <label className="block text-xs font-semibold text-[#4c5750]">
          Allowed extensions
          <input
            value={types}
            disabled={busy || allowAny}
            onChange={(e) => setTypes(e.target.value)}
            placeholder="pdf, md, txt"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <span className="mt-1.5 block text-[11px] font-normal text-[#869089]">
            Comma separated, with or without the dot.
          </span>
        </label>
        {!allowAny && (
          <div className="flex flex-wrap gap-1.5" aria-live="polite">
            {parsedTypes.length ? (
              parsedTypes.map((ext) => (
                <span
                  key={ext}
                  className="rounded-full bg-[#e9f2ee] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#0a3f37]"
                >
                  .{ext}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#b53d31]">
                <TriangleAlert size={14} />
                No extensions listed: nothing could be uploaded.
              </span>
            )}
          </div>
        )}

        <label className="block text-xs font-semibold text-[#4c5750]">
          Maximum file size (MB)
          <input
            type="number"
            min={1}
            max={MAX_FILE_SIZE_CEILING_MB}
            step={1}
            inputMode="numeric"
            value={maxSize}
            disabled={busy}
            onChange={(e) => setMaxSize(e.target.value)}
            className={`${inputClass} max-w-[180px]`}
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[#869089]">
            Now: {describePolicy(settings)}
          </p>
          <button
            type="submit"
            disabled={busy || !dirty}
            className={`${primaryButtonClass} shrink-0`}
          >
            {busy ? <Spinner size={16} /> : <Check size={16} />}
            {busy ? "Saving" : "Save policy"}
          </button>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * (e) Send a notification
 * ------------------------------------------------------------------------- */

function NotificationCard({
  members,
  myUserId,
  onAudited,
}: {
  members: Membership[];
  myUserId?: string;
  onAudited: () => void;
}) {
  const { apiFetch } = useSession();
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState(""); // "" = everyone
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const remaining = NOTIFICATION_MAX_LENGTH - body.length;
  const overLimit = remaining < 0;
  const ready = body.trim().length > 0 && !overLimit;

  // A chosen member who has since been removed falls back to "everyone"
  // rather than posting to an id the server would reject.
  const recipientValid =
    recipient === "" || members.some((m) => m.userId === recipient);
  const effectiveRecipient = recipientValid ? recipient : "";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    setSent("");
    try {
      const response = await apiFetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          userId: effectiveRecipient || null,
          body: body.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not send the notification."),
        );
      }
      const data = (await response.json()) as { recipients?: number };
      const count = data.recipients ?? (effectiveRecipient ? 1 : members.length);
      setSent(`Sent to ${count} ${count === 1 ? "person" : "people"}.`);
      setBody("");
      onAudited();
    } catch (err) {
      setError(messageOf(err, "Could not send the notification."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="notify"
      icon={<MessageSquareText size={18} />}
      title="Send a notification"
      description="A short notice that appears in members' notifications the next time they open Mindbase."
    >
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 p-5 md:p-6">
        <label className="block text-xs font-semibold text-[#4c5750]">
          Recipient
          <select
            value={effectiveRecipient}
            disabled={busy}
            onChange={(e) => setRecipient(e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="">Everyone in the workspace</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName
                  ? `${member.displayName} (${member.email})`
                  : member.email}
                {member.userId === myUserId ? " - you" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-[#4c5750]">
          Message
          <textarea
            value={body}
            rows={4}
            disabled={busy}
            maxLength={NOTIFICATION_MAX_LENGTH + 20}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. The Q3 board pack is now in the library under Management."
            className={`${inputClass} resize-y`}
          />
          <span
            aria-live="polite"
            className={`mt-1.5 block text-[11px] font-normal ${
              overLimit ? "text-[#b53d31]" : "text-[#869089]"
            }`}
          >
            {body.length} / {NOTIFICATION_MAX_LENGTH}
            {overLimit && ` (${-remaining} over)`}
          </span>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !ready}
            className={primaryButtonClass}
          >
            {busy ? <Spinner size={16} /> : <MessageSquareText size={16} />}
            {busy ? "Sending" : "Send"}
          </button>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {sent && <Notice tone="success">{sent}</Notice>}
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * (f) Audit log
 * ------------------------------------------------------------------------- */

function AuditCard({
  workspace,
  version,
}: {
  workspace: WorkspaceSummary;
  version: number;
}) {
  const { apiFetch } = useSession();

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/workspaces/${workspace.id}/audit`);
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load the audit log."));
    }
    const data = (await response.json()) as { events?: AuditEvent[] };
    return (data.events ?? []).slice().sort(newestFirst);
  }, [apiFetch, workspace.id]);

  const audit = useLoader<AuditEvent[]>(load, [], version);

  return (
    <Card
      id="audit"
      icon={<Clock3 size={18} />}
      title="Audit log"
      description="What admins have done here, newest first: admissions, role and tier changes, deletions, private-file views and notices sent."
      action={
        <div className="flex items-center gap-2">
          <Badge tone="gray">
            {audit.data.length} event{audit.data.length === 1 ? "" : "s"}
          </Badge>
          <RefreshButton onClick={audit.refresh} busy={audit.loading} />
        </div>
      }
    >
      {audit.error && (
        <div className="px-5 pt-4 md:px-6">
          <Notice tone="error">{audit.error}</Notice>
        </div>
      )}
      {audit.loading && !audit.data.length ? (
        <div className="py-14 text-center">
          <Spinner size={24} />
        </div>
      ) : !audit.data.length ? (
        <p className="px-5 py-10 text-center text-sm text-[#7e8882]">
          {audit.error
            ? "The audit log could not be loaded."
            : "Nothing has been recorded yet."}
        </p>
      ) : (
        <ol className="divide-y divide-[#edf0ec]">
          {audit.data.map((event) => (
            <li
              key={event.id}
              className="grid gap-1.5 px-5 py-4 md:grid-cols-[170px_minmax(0,1fr)] md:gap-6 md:px-6"
            >
              <time
                dateTime={event.createdAt}
                className="text-xs text-[#6f7973] md:pt-1"
              >
                {formatDateTime(event.createdAt)}
              </time>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gray">{auditActionLabel(event.action)}</Badge>
                  <span className="truncate text-sm font-medium text-[#101b18]">
                    {event.actorEmail}
                  </span>
                </div>
                {event.detail && (
                  <p className="mt-1 wrap-break-word text-sm leading-6 text-[#587067]">
                    {event.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
