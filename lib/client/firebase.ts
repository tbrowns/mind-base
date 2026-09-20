"use client";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
} from "firebase/auth";

/**
 * Client-side Firebase, used only to sign in and obtain an ID token.
 *
 * These NEXT_PUBLIC_* values are the public web config, not secrets -- access
 * is enforced server-side by verifying the resulting token. They are still
 * required: without them the app cannot authenticate at all, so a missing
 * value fails loudly here rather than producing a confusing 401 later.
 */

const CONFIG_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

// Read as whole literals: Next inlines process.env.NEXT_PUBLIC_* at build time
// only when the property is written out statically, so a dynamic lookup would
// silently yield undefined in the browser.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function firebaseClientConfigured(): boolean {
  return Boolean(
    config.apiKey && config.authDomain && config.projectId && config.appId,
  );
}

export function missingClientConfig(): string[] {
  const present: Record<string, unknown> = {
    NEXT_PUBLIC_FIREBASE_API_KEY: config.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: config.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: config.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: config.appId,
  };
  return CONFIG_KEYS.filter((key) => !present[key]);
}

let app: FirebaseApp | undefined;

export function clientApp(): FirebaseApp {
  if (!firebaseClientConfigured()) {
    throw new Error(
      `Firebase is not configured in the browser. Add to .env.local: ${missingClientConfig().join(", ")}`,
    );
  }
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function clientAuth(): Auth {
  return getAuth(clientApp());
}
