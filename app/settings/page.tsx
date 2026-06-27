"use client";
import {
  CheckCircle2,
  Cloud,
  Database,
  KeyRound,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from "@/components/icons";
import { PageHeader, Spinner } from "@/components/ui";
import { useEffect, useState } from "react";

type Connection = {
  configured: boolean;
  connected?: boolean;
  mode: string;
  error?: string;
};
type Health = {
  firestore: Connection;
  ai: Connection;
  storageBucket: Connection;
  gmail: Connection;
};

export default function SettingsPage() {
  const [health, setHealth] = useState<Health>();
  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then(setHealth);
  }, []);
  const connections = health
    ? [
        { name: "Firestore", health: health.firestore, icon: Database },
        { name: "Groq AI", health: health.ai, icon: KeyRound },
        { name: "Firebase Storage", health: health.storageBucket, icon: Cloud },
        { name: "Gmail connector", health: health.gmail, icon: Mail },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Check the services that power ingestion, connectors, retrieval, and cited answers."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-[#e3e8e2] bg-white">
          <div className="border-b border-[#edf0ec] px-5 py-4">
            <h2 className="text-sm font-semibold">Connection status</h2>
            <p className="mt-1 text-xs text-[#89928c]">
              Server-side checks only — credentials never reach the browser.
            </p>
          </div>
          {!health ? (
            <div className="grid place-items-center py-16"><Spinner size={24} /></div>
          ) : (
            <div className="divide-y divide-[#edf0ec]">
              {connections.map(({ name, health: status, icon: Icon }) => {
                const ok = status.connected ?? status.configured;
                return (
                  <div key={name} className="flex items-center gap-4 px-5 py-5">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#f1f5f1] text-[#527060]"><Icon size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="mt-1 text-xs text-[#89928c]">{status.error ?? status.mode}</p>
                    </div>
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${ok ? "bg-[#e8f5ef] text-[#197a5b]" : "bg-[#fff4dc] text-[#8a6511]"}`}>
                      {ok ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}
                      {ok ? "Connected" : "Setup needed"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <aside className="space-y-5">
          <div className="rounded-2xl bg-[#0f3d2e] p-5 text-white">
            <ShieldCheck size={22} className="text-[#77d5b4]" />
            <h3 className="mt-4 text-sm font-semibold">Private by design</h3>
            <p className="mt-2 text-xs leading-5 text-white/60">Firebase, Groq, Pinecone, and Google OAuth credentials stay inside server route handlers.</p>
          </div>
          <div className="rounded-2xl border border-[#e3e8e2] bg-white p-5">
            <h3 className="text-sm font-semibold">Server configuration</h3>
            <code className="mt-3 block whitespace-pre-wrap rounded-xl bg-[#f5f7f4] p-3 text-[10px] leading-5 text-[#516059]">credentials.json<br />FIREBASE_PROJECT_ID<br />FIREBASE_CLIENT_EMAIL<br />FIREBASE_PRIVATE_KEY<br />FIREBASE_STORAGE_BUCKET<br />GROQ_API_KEY<br />PINECONE_API_KEY<br />PINECONE_INDEX<br />BRAIN_INBOX_EMAIL</code>
          </div>
        </aside>
      </div>
    </div>
  );
}
