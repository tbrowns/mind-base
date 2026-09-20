import "server-only";
import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

/*
 * firebase-admin is loaded on demand, never at module scope. It is a large
 * dependency graph, and the moment it is imported statically every consumer of
 * this file pays for it - including `lib/workspaces`, which in local-storage
 * mode does not touch Firebase at all. That import alone was enough to time
 * out the workspace test suite's setup hook and it lengthens cold starts on
 * routes that only read the JSON store.
 *
 * These are all behind async functions already, so deferring the import costs
 * nothing at the call sites.
 */

const FIREBASE_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

export function firebaseConfigured() {
  return FIREBASE_KEYS.every((key) => Boolean(process.env[key]));
}

let cachedDb: Firestore | undefined;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Opt in explicitly to the on-disk JSON store. Never on by accident. */
export function usingLocalStorage() {
  return process.env.LOCAL_DEMO_STORAGE === "true";
}

export async function getAdminDb(): Promise<Firestore | null> {
  // Returning null selects the local JSON store in the callers' `if (db)`
  // branches. Until this check existed, LOCAL_DEMO_STORAGE was named in the
  // error message below but read nowhere, so getAdminDb could only ever return
  // a Firestore or throw -- and every local fallback in the codebase was
  // unreachable.
  if (usingLocalStorage()) return null;

  const missing = FIREBASE_KEYS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Firestore is not configured. Missing server environment variables: ${missing.join(", ")}. Set LOCAL_DEMO_STORAGE=true only for explicit local development.`,
    );
  }
  if (cachedDb) return cachedDb;
  try {
    const { getFirestore } = await import("firebase-admin/firestore");
    cachedDb = getFirestore(await adminApp());
    return cachedDb;
  } catch (error) {
    throw new Error(
      `Firestore initialization failed: ${error instanceof Error ? error.message : "Unknown Firebase Admin error."}`,
    );
  }
}

/** One initialised admin app, shared by Firestore and Auth. */
async function adminApp(): Promise<App> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    })
  );
}

/**
 * Firebase Auth admin, used only to verify ID tokens presented by the client.
 * This is the root of trust for every access decision: a request is anonymous
 * until a token verifies here.
 */
export async function getAdminAuth(): Promise<Auth> {
  const missing = FIREBASE_KEYS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Authentication is not configured. Missing server environment variables: ${missing.join(", ")}.`,
    );
  }
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await adminApp());
}

export async function probeFirestore() {
  if (!firebaseConfigured()) {
    return {
      configured: false,
      connected: false,
      mode: "Firestore configuration missing",
    };
  }
  try {
    const db = await getAdminDb();
    await withTimeout(db!.listCollections(), 8000, "Firestore probe");
    return { configured: true, connected: true, mode: "Firestore connected" };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      mode: "Firestore connection failed",
      error:
        error instanceof Error ? error.message : "Unknown Firestore error.",
    };
  }
}
