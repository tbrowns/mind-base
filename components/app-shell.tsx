"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrainCircuit, CalendarRange, ChevronDown, FileText, Inbox, LayoutDashboard, Menu, Settings, X } from "@/components/icons";
import { useState } from "react";
import { Logo } from "./logo";
import { useRole } from "./role-context";
import type { ViewerRole } from "@/lib/types";
import { roleLabels } from "@/lib/types";

const nav = [{ href: "/", label: "Dashboard", icon: LayoutDashboard }, { href: "/inbox", label: "Brain Inbox", icon: Inbox }, { href: "/meetings/import", label: "Meetings", icon: CalendarRange }, { href: "/documents", label: "Documents", icon: FileText }, { href: "/chat", label: "Ask Brain", icon: BrainCircuit }, { href: "/settings", label: "Settings", icon: Settings }];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const { role, setRole } = useRole(); const [open, setOpen] = useState(false);
  return <div className="min-h-screen bg-[#f6f8f4]">
    {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col border-r border-[#e7ebe5] bg-white px-4 py-6 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between px-2"><Logo /><button className="lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <nav className="mt-10 space-y-1">{nav.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-[#e9f5ef] text-[#0f3d2e]" : "text-[#657068] hover:bg-[#f4f6f3] hover:text-[#17211c]"}`}><Icon size={18} strokeWidth={1.8} />{item.label}{active && <span className="ml-auto size-1.5 rounded-full bg-[#21a67a]" />}</Link>; })}</nav>
      <div className="mt-auto rounded-2xl bg-[#0f3d2e] p-4 text-white"><div className="mb-3 grid size-8 place-items-center rounded-lg bg-white/10"><BrainCircuit size={17} /></div><p className="text-sm font-medium">Knowledge, connected.</p><p className="mt-1 text-xs leading-5 text-white/60">Every answer stays grounded in your team’s sources.</p></div>
      <p className="mt-5 px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#a0aaa3]">Internal workspace · MVP</p>
    </aside>
    <div className="lg:pl-[244px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e7ebe5] bg-[#f6f8f4]/90 px-5 backdrop-blur md:px-8 lg:px-10"><button className="rounded-lg border border-[#dfe5df] bg-white p-2 lg:hidden" onClick={() => setOpen(true)}><Menu size={19} /></button><div className="hidden text-xs font-medium uppercase tracking-[.15em] text-[#89928c] sm:block">Internal knowledge command center</div><label className="relative ml-auto"><span className="sr-only">Viewing as</span><select value={role} onChange={(e) => setRole(e.target.value as ViewerRole)} className="appearance-none rounded-full border border-[#dfe5df] bg-white py-2 pl-3 pr-8 text-xs font-semibold text-[#344039] outline-none focus:border-[#21a67a]"><option value="team-member">Viewing as: {roleLabels["team-member"]}</option><option value="management">Viewing as: {roleLabels.management}</option><option value="management-investees">Viewing as: {roleLabels["management-investees"]}</option></select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#738078]" /></label></header><main>{children}</main></div>
  </div>;
}
