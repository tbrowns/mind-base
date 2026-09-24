"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  CalendarRange,
  Check,
  ChevronDown,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  Plus,
  ShieldCheck,
  X,
} from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";
import { Spinner } from "./ui";
import { useSession, type WorkspaceSummary } from "./session-context";
import { SignInPanel } from "./sign-in-panel";
import { NotificationsBell } from "./notifications-bell";

const nav = [
  { href: "/", label: "Command Deck", icon: LayoutDashboard },
  { href: "/inbox", label: "Mindbase Inbox", icon: Inbox },
  { href: "/meetings/import", label: "Meetings", icon: CalendarRange },
  { href: "/documents", label: "Library", icon: FileText },
  { href: "/chat", label: "Ask Mindbase", icon: BrainCircuit },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    loading,
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    signOut,
    guest,
    preparingDemo,
  } = useSession();
  const [open, setOpen] = useState(false);

  if (preparingDemo) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#eef7f4] px-6 text-center">
        <div>
          <span className="mx-auto grid size-12 place-items-center text-[#0aa37f]">
            <Spinner size={26} />
          </span>
          <p className="mt-4 text-sm font-black text-[#101b18]">
            Setting up your demo workspace
          </p>
          <p className="mt-1 text-[13px] text-[#60756c]">
            Masking, chunking and indexing the sample document.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#eef7f4] text-[#0aa37f]">
        <Spinner size={26} />
      </div>
    );
  }

  // There is no anonymous view: the whole app is somebody's private knowledge.
  if (!user) return <SignInPanel />;

  const canAdminister =
    activeWorkspace?.role === "admin" || activeWorkspace?.role === "owner";

  const items = [
    ...nav,
    ...(canAdminister
      ? [{ href: "/admin", label: "Administration", icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#eef7f4] text-[#101b18]">
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-[#071512]/35 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-[#d9e9e2] bg-[#fbfffd]/95 px-4 py-6 shadow-[20px_0_50px_rgba(11,65,55,.08)] backdrop-blur transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Logo />
          <button
            aria-label="Close menu"
            className="rounded-xl border border-[#d9e9e2] p-2 text-[#48635b] lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-9 space-y-1.5">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[#0a3f37] text-white shadow-[0_12px_26px_rgba(10,63,55,.18)]"
                    : "text-[#587067] hover:bg-[#e5f4ee] hover:text-[#10231e]"
                }`}
              >
                <span
                  className={`grid size-8 place-items-center rounded-xl ${
                    active
                      ? "bg-white/12 text-[#98ffe1]"
                      : "bg-white text-[#0b8068] shadow-sm group-hover:bg-[#f8fffc]"
                  }`}
                >
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-[#e0efe9] pt-4">
          <p className="px-2 text-[12px] font-bold text-[#244039]">
            {guest ? "Demo guest" : user.displayName || user.email}
          </p>
          <button
            onClick={() => void signOut()}
            className="px-2 text-[12px] font-bold text-[#8a9b94] hover:text-[#b53d31]"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#d9e9e2] bg-[#eef7f4]/88 px-5 backdrop-blur md:px-8 lg:px-10">
          <button
            aria-label="Open menu"
            className="rounded-xl border border-[#cfe1da] bg-white p-2 text-[#244940] shadow-sm lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="h-6 w-px bg-[#cfe1da]" />
            <p className="text-xs font-bold uppercase text-[#617a71]">
              Mindbase control room
            </p>
          </div>

          {/*
            The workspace menu replaces the old "Viewing as" role picker. That
            control let the client choose its own clearance, which the server
            then believed. This one only chooses which workspace to look at;
            the rights that come with it are resolved server-side from
            membership.
          */}
          <div className="ml-auto flex items-center">
            <NotificationsBell />
          </div>
          <WorkspaceMenu
            guest={guest}
            workspaces={workspaces}
            activeId={activeWorkspace?.id ?? ""}
            onPick={setActiveWorkspaceId}
          />
        </header>
        {guest && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0dfb0] bg-[#fff8e6] px-5 py-2.5 text-[12px] text-[#6b5412] md:px-8 lg:px-10">
            <p>
              <span className="font-black">Demo workspace.</span> It&apos;s
              private to this browser and is gone once you leave the demo.
              Guests can ask 25 questions and upload 5 documents.
            </p>
            <button
              onClick={() => void signOut()}
              className="font-black text-[#0a3f37] hover:underline"
            >
              Leave demo
            </button>
          </div>
        )}
        <main>{children}</main>
      </div>
    </div>
  );
}

/**
 * The one place to switch workspace, plus the way into creating or joining
 * one -- which used to be a separate sidebar link doing half the same job.
 */
function WorkspaceMenu({
  guest,
  workspaces,
  activeId,
  onPick,
}: {
  guest: boolean;
  workspaces: WorkspaceSummary[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = workspaces.find((w) => w.id === activeId);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (w: WorkspaceSummary) =>
    `${w.name}${w.type === "personal" ? " (personal)" : ""}`;

  return (
    <div ref={root} className="relative ml-3">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-2 rounded-full border border-[#cfe1da] bg-white py-2.5 pl-4 pr-3 text-xs font-bold text-[#244039] shadow-sm outline-none hover:border-[#9fcfbf] focus-visible:border-[#0aa37f]"
      >
        <span className="sr-only">Workspace: </span>
        <span className="truncate">{active ? label(active) : "No workspace"}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-[#587067] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-[#d9e9e2] bg-white py-1.5 shadow-[0_18px_44px_rgba(10,63,55,.14)]"
        >
          <p className="px-4 pb-1 pt-2 text-[10px] font-black uppercase text-[#8a9b94]">
            Switch workspace
          </p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="menuitemradio"
              aria-checked={w.id === activeId}
              onClick={() => {
                onPick(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-[#244039] hover:bg-[#eef7f4] focus-visible:bg-[#eef7f4] focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{label(w)}</span>
              <span className="shrink-0 text-[10px] font-bold uppercase text-[#8a9b94]">
                {w.role}
              </span>
              <Check
                size={14}
                className={`shrink-0 text-[#0aa37f] ${w.id === activeId ? "" : "invisible"}`}
              />
            </button>
          ))}
          {/* Guests cannot start or join organisations; the API refuses too. */}
          {!guest && (
            <>
              <div className="my-1.5 h-px bg-[#e0efe9]" />
              <Link
                role="menuitem"
                href="/workspaces"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-[#0a8068] hover:bg-[#eef7f4] focus-visible:bg-[#eef7f4] focus-visible:outline-none"
              >
                <Plus size={14} />
                Create or join a workspace
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
