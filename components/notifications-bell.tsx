"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Mail, X } from "@/components/icons";
import type { Notification } from "@/lib/types";
import { Badge, Spinner } from "@/components/ui";
import { useSession, type WorkspaceSummary } from "@/components/session-context";

const POLL_MS = 60_000;

/**
 * A broadcast (userId === null) is one shared row for the whole workspace, so
 * the server deliberately refuses to stamp readAt on it for a single reader.
 * Which broadcasts this person has already opened is therefore remembered on
 * this device only; personal notifications are marked read server-side.
 */
const DISMISSED_KEY = "mindbase-read-broadcasts";
const DISMISSED_CAP = 300;

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    // Server render, private browsing or blocked storage: start empty.
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...ids].slice(-DISMISSED_CAP)),
    );
  } catch {
    // Storage blocked: the broadcast just shows as unread again next visit.
  }
}

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

function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const absolute = new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (now <= 0) return absolute;

  const seconds = Math.round(Math.max(0, now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return absolute;
}

const buttonBase =
  "relative grid size-10 place-items-center rounded-full border bg-white shadow-sm transition";

/**
 * Header control: unread count plus a dropdown of this member's notifications
 * for the active workspace. Polls while mounted and starts over whenever the
 * workspace changes (the inner component is keyed on it).
 */
export function NotificationsBell({ className = "" }: { className?: string }) {
  const { activeWorkspace } = useSession();

  if (!activeWorkspace) {
    return (
      <button
        type="button"
        disabled
        aria-label="Notifications"
        title="Pick a workspace to see its notifications"
        className={`${buttonBase} cursor-not-allowed border-[#cfe1da] text-[#8a9b94] opacity-60 ${className}`}
      >
        <Mail size={17} strokeWidth={1.9} />
      </button>
    );
  }

  return (
    <Bell
      key={activeWorkspace.id}
      workspace={activeWorkspace}
      className={className}
    />
  );
}

function Bell({
  workspace,
  className,
}: {
  workspace: WorkspaceSummary;
  className: string;
}) {
  const { apiFetch } = useSession();
  const panelId = useId();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Wall clock the relative times are measured against. Set from handlers and
  // fetch callbacks only, never during render.
  const [now, setNow] = useState(0);
  const alive = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/notifications");
    if (!response.ok) {
      throw new Error(
        await readError(response, "Could not load notifications."),
      );
    }
    const data = (await response.json()) as { notifications?: Notification[] };
    return data.notifications ?? [];
  }, [apiFetch]);

  // A promise chain rather than async/await so every setState sits inside a
  // callback: the effect below may then kick off a fetch without the compiler
  // reading it as a synchronous state update.
  const refresh = useCallback(
    () =>
      load()
        .then((list) => {
          if (!alive.current) return;
          setNotifications(list);
          setNow(Date.now());
          setError("");
        })
        .catch((err: unknown) => {
          if (!alive.current) return;
          setError(
            err instanceof Error
              ? err.message
              : "Could not load notifications.",
          );
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        }),
    [load],
  );

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => {
      // A hidden tab can wait; it catches up on the next tick after focus.
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh, workspace.id]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isRead = (n: Notification) => !!n.readAt || dismissed.has(n.id);
  const unread = notifications.filter((n) => !isRead(n)).length;

  function toggle() {
    setNow(Date.now());
    setOpen((previous) => !previous);
    if (!open) void refresh();
  }

  async function markRead(n: Notification) {
    if (isRead(n)) return;
    const readAt = new Date().toISOString();
    setError("");
    setNotifications((previous) =>
      previous.map((item) => (item.id === n.id ? { ...item, readAt } : item)),
    );
    if (n.userId === null) {
      setDismissed((previous) => {
        const next = new Set(previous);
        next.add(n.id);
        writeDismissed(next);
        return next;
      });
    }

    try {
      const response = await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id: n.id }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not mark that as read."),
        );
      }
    } catch (err: unknown) {
      if (!alive.current) return;
      setError(
        err instanceof Error ? err.message : "Could not mark that as read.",
      );
      // Personal notices live server-side, so undo the optimistic stamp.
      if (n.userId !== null) {
        setNotifications((previous) =>
          previous.map((item) =>
            item.id === n.id ? { ...item, readAt: n.readAt } : item,
          ),
        );
      }
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={`${buttonBase} ${
          open
            ? "border-[#0aa37f] text-[#0aa37f]"
            : "border-[#cfe1da] text-[#244039] hover:border-[#0aa37f] hover:text-[#0aa37f]"
        }`}
      >
        <Mail size={17} strokeWidth={1.9} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#0aa37f] px-1 text-[10px] font-black leading-none text-white ring-2 ring-[#eef7f4]"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-3xl border border-[#d9e9e2] bg-white shadow-[0_24px_60px_rgba(10,63,55,.16)]"
        >
          <div className="flex items-center justify-between border-b border-[#e0efe9] px-4 py-3">
            <div>
              <p className="text-sm font-black text-[#101b18]">Notifications</p>
              <p className="mt-0.5 text-[11px] text-[#60756c]">
                {unread
                  ? `${unread} unread in ${workspace.name}`
                  : `You're all caught up in ${workspace.name}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-[#d9e9e2] p-1.5 text-[#48635b] hover:bg-[#f4faf8]"
            >
              <X size={15} />
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 border-b border-[#f3cfc9] bg-[#fff0ed] px-4 py-2.5 text-xs leading-5 text-[#b53d31]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <ul className="max-h-[380px] divide-y divide-[#edf3f0] overflow-y-auto">
            {notifications.map((n) => {
              const read = isRead(n);
              const stamp = new Date(n.createdAt);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void markRead(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                      read
                        ? "cursor-default bg-white"
                        : "bg-[#f4faf8] hover:bg-[#e9f2ee]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        read ? "bg-transparent" : "bg-[#0aa37f]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block whitespace-pre-wrap wrap-break-word text-sm leading-5 ${
                          read
                            ? "text-[#587067]"
                            : "font-semibold text-[#101b18]"
                        }`}
                      >
                        {n.body}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#60756c]">
                        <time
                          dateTime={n.createdAt}
                          title={
                            Number.isNaN(stamp.getTime())
                              ? undefined
                              : stamp.toLocaleString()
                          }
                        >
                          {relativeTime(n.createdAt, now)}
                        </time>
                        {n.userId === null && <Badge tone="gray">Everyone</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            {loading && notifications.length === 0 && (
              <li className="grid place-items-center py-10 text-[#0aa37f]">
                <Spinner size={22} />
              </li>
            )}

            {!loading && notifications.length === 0 && (
              <li className="px-4 py-10 text-center">
                <span className="mx-auto grid size-10 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
                  <Mail size={17} />
                </span>
                <p className="mt-3 text-sm font-black text-[#101b18]">
                  {error ? "Notifications could not be loaded" : "Nothing yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-[#60756c]">
                  {error
                    ? "We'll try again shortly."
                    : "Notices from your workspace admins will show up here."}
                </p>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
