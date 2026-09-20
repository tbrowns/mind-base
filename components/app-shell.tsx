"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  CalendarRange,
  ChevronDown,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  X,
} from "@/components/icons";
import { useState } from "react";
import { Logo } from "./logo";
import { Spinner } from "./ui";
import { useSession } from "./session-context";
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
  } = useSession();
  const [open, setOpen] = useState(false);

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
            {user.displayName || user.email}
          </p>
          <Link
            href="/workspaces"
            onClick={() => setOpen(false)}
            className="block px-2 text-[12px] font-bold text-[#0aa37f] hover:underline"
          >
            Workspaces
          </Link>
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
            Replaces the old "Viewing as" role picker. That control let the
            client choose its own clearance, which the server then believed.
            This one only chooses which workspace to look at; the rights that
            come with it are resolved server-side from membership.
          */}
          <div className="ml-auto flex items-center">
            <NotificationsBell />
          </div>
          <label className="relative ml-3">
            <span className="sr-only">Workspace</span>
            <select
              value={activeWorkspace?.id ?? ""}
              onChange={(event) => setActiveWorkspaceId(event.target.value)}
              className="appearance-none rounded-full border border-[#cfe1da] bg-white py-2.5 pl-4 pr-9 text-xs font-bold text-[#244039] shadow-sm outline-none focus:border-[#0aa37f]"
            >
              {workspaces.length === 0 && <option value="">No workspace</option>}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                  {workspace.type === "personal" ? " (personal)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#587067]"
            />
          </label>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
