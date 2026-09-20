import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

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
    cachedDb = getFirestore(adminApp());
    return cachedDb;
  } catch (error) {
    throw new Error(
      `Firestore initialization failed: ${error instanceof Error ? error.message : "Unknown Firebase Admin error."}`,
    );
  }
}

/** One initialised admin app, shared by Firestore and Auth. */
function adminApp() {
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
  return getAuth(adminApp());
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
