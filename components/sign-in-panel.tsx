"use client";
import { useState } from "react";
import { Logo } from "./logo";
import { Spinner } from "./ui";
import { useSession } from "./session-context";
import { missingClientConfig } from "@/lib/client/firebase";

/**
 * Sign in / create account. Shown in place of the app when there is no session,
 * which is now every route: there is no anonymous view of a knowledge base.
 */
export function SignInPanel() {
  const { signIn, signUp, startDemo, configured } = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!configured) {
    return (
      <Shell>
        <h1 className="text-2xl font-black text-[#101b18]">Setup needed</h1>
        <p className="mt-3 text-sm leading-6 text-[#60756c]">
          Mindbase needs its Firebase web config to sign anyone in. Add these to{" "}
          <code className="rounded bg-[#e9f2ee] px-1.5 py-0.5 text-[12px]">
            .env.local
          </code>{" "}
          and restart:
        </p>
        <ul className="mt-3 space-y-1">
          {missingClientConfig().map((key) => (
            <li
              key={key}
              className="rounded-lg bg-[#f4faf8] px-3 py-2 font-mono text-[12px] text-[#2c4a41]"
            >
              {key}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-6 text-[#60756c]">
          They are in the Firebase console under Project settings, Your apps.
          These are public client values, not secrets. Email/password sign-in
          also has to be enabled under Authentication, Sign-in method.
        </p>
      </Shell>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email, password);
      } else {
        await signUp(email, password, name);
      }
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function tryDemo() {
    setError("");
    setBusy(true);
    try {
      await startDemo();
    } catch (caught) {
      setError(readableAuthError(caught));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <button
        type="button"
        onClick={() => void tryDemo()}
        disabled={busy}
        className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#b9e6d6] bg-[#effaf5] px-4 py-3.5 text-left transition hover:border-[#0aa37f] disabled:opacity-60"
      >
        <span>
          <span className="block text-sm font-black text-[#0a3f37]">
            Try the demo
          </span>
          <span className="mt-0.5 block text-[12px] leading-5 text-[#48635b]">
            No sign-up. A private workspace with a sample document, ready to
            question.
          </span>
        </span>
        <span className="shrink-0 rounded-xl bg-[#0aa37f] px-3 py-2 text-[12px] font-black text-white">
          Start
        </span>
      </button>

      <h1 className="text-2xl font-black text-[#101b18]">
        {mode === "in" ? "Sign in to Mindbase" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#60756c]">
        {mode === "in"
          ? "Ask your workspace's knowledge and get cited answers."
          : "You'll get a personal workspace straight away, and can join your team's afterwards."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "up" && (
          <Field
            label="Name"
            value={name}
            onChange={setName}
            autoComplete="name"
            placeholder="Ann Wanjiru"
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
          placeholder={mode === "up" ? "At least 6 characters" : ""}
        />

        {error && (
          <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-[13px] text-[#b53d31]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0aa37f] px-4 py-3 text-sm font-black text-white transition hover:bg-[#08856a] disabled:opacity-60"
        >
          {busy && <Spinner size={16} />}
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError("");
        }}
        className="mt-4 text-[13px] font-bold text-[#0aa37f] hover:underline"
      >
        {mode === "in"
          ? "No account yet? Create one"
          : "Already have an account? Sign in"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef7f4] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#d9e9e2] bg-white p-8 shadow-[0_30px_80px_rgba(11,65,55,.10)]">
        <div className="mb-6">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase text-[#48635b]">
        {label}
      </span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#d9e9e2] bg-[#fbfffd] px-3.5 py-2.5 text-sm text-[#101b18] outline-none focus:border-[#0aa37f]"
      />
    </label>
  );
}

/** Firebase error codes are not user-facing text. */
function readableAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account.";
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in.";
    case "auth/weak-password":
      return "Passwords need at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/admin-restricted-operation":
      return "The demo isn't switched on for this site yet. Create an account instead.";
    case "auth/operation-not-allowed":
      return "Email sign-in isn't enabled on this Firebase project yet.";
    case "auth/network-request-failed":
      return "Couldn't reach Firebase. Check your connection.";
    default:
      return error instanceof Error ? error.message : "Sign-in failed.";
  }
}
