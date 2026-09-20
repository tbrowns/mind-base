"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { clientAuth, firebaseClientConfigured } from "@/lib/client/firebase";
import type { MemberRole, Workspace } from "@/lib/types";

export type WorkspaceSummary = Workspace & { role: MemberRole };

type SessionValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** fetch() with the ID token and active workspace attached. */
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const ACTIVE_KEY = "mindbase-active-workspace";

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = firebaseClientConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(clientAuth(), (next) => {
      setUser(next);
      setLoading(false);
      if (!next) {
        setWorkspaces([]);
        setActiveId("");
      }
    });
  }, [configured]);

  /**
   * Always ask for a fresh token rather than caching one. Firebase refreshes
   * it internally when it is close to expiry, and this is also how a revoked
   * session stops working promptly rather than at the end of its hour.
   */
  const apiFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const current = clientAuth().currentUser;
      if (!current) throw new Error("Sign in to continue.");
      const token = await current.getIdToken();

      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      if (activeId) headers.set("x-workspace-id", activeId);
      if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    [activeId],
  );

  // A promise chain rather than async/await so every setState sits inside a
  // callback: the effect below may then kick off a refresh without the
  // compiler reading it as a synchronous state update.
  const refreshWorkspaces = useCallback((): Promise<void> => {
    const current = clientAuth().currentUser;
    if (!current) return Promise.resolve();
    return current
      .getIdToken()
      .then((token) =>
        fetch("/api/workspaces", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ workspaces: WorkspaceSummary[] }>)
          : null,
      )
      .then((data) => {
        if (!data) return;
        setWorkspaces(data.workspaces);

        setActiveId((previous) => {
          // Keep the current selection if it survived; otherwise fall back to
          // the last one used on this device, then to the personal workspace.
          if (previous && data.workspaces.some((w) => w.id === previous)) {
            return previous;
          }
          let remembered = "";
          try {
            remembered = localStorage.getItem(ACTIVE_KEY) ?? "";
          } catch {
            remembered = "";
          }
          if (remembered && data.workspaces.some((w) => w.id === remembered)) {
            return remembered;
          }
          return data.workspaces[0]?.id ?? "";
        });
      });
  }, []);

  useEffect(() => {
    if (user) void refreshWorkspaces();
  }, [user, refreshWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      // Private browsing or blocked storage: the choice just won't persist.
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(clientAuth(), email.trim(), password);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const credential = await createUserWithEmailAndPassword(
        clientAuth(),
        email.trim(),
        password,
      );
      const displayName = name.trim();
      if (displayName) {
        await updateProfile(credential.user, { displayName });
        // The token is minted before the profile update, so refresh it or the
        // server sees an account with no name on the very first request.
        await credential.user.getIdToken(true);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fbSignOut(clientAuth());
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      configured,
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      refreshWorkspaces,
      signIn,
      signUp,
      signOut,
      apiFetch,
    }),
    [
      user,
      loading,
      configured,
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      refreshWorkspaces,
      signIn,
      signUp,
      signOut,
      apiFetch,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
