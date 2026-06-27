// Client-side Gmail implementation using Google OAuth2 flow
import type { GmailMessage } from "@/lib/types";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest";
const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let accessToken: string | null = null;

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

/**
 * Initialize Google API client
 */
export async function initializeGapiClient(): Promise<void> {
  if (gapiInited) return;

  return new Promise((resolve) => {
    if (!window.gapi) {
      console.error("Google API not loaded");
      resolve();
      return;
    }

    window.gapi.load("client", async () => {
      try {
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        resolve();
      } catch (error) {
        console.error("Failed to initialize GAPI:", error);
        resolve();
      }
    });
  });
}

/**
 * Initialize Google Identity Services
 */
export async function initializeGIS(): Promise<void> {
  if (gisInited) return;

  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2) {
      console.error("Google Identity Services not loaded");
      resolve();
      return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: "", // Will be defined when needed
    });
    gisInited = true;
    resolve();
  });
}

/**
 * Load Google libraries
 */
export function loadGoogleLibraries(): void {
  // Load gapi
  if (!window.gapi) {
    const script1 = document.createElement("script");
    script1.src = "https://apis.google.com/js/api.js";
    script1.async = true;
    script1.defer = true;
    script1.onload = () => {
      void initializeGapiClient();
    };
    document.head.appendChild(script1);
  }

  // Load Google Identity Services
  if (!window.google?.accounts) {
    const script2 = document.createElement("script");
    script2.src = "https://accounts.google.com/gsi/client";
    script2.async = true;
    script2.defer = true;
    script2.onload = () => {
      void initializeGIS();
    };
    document.head.appendChild(script2);
  }
}

/**
 * Request OAuth token
 */
export async function requestAccessToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!tokenClient) {
      console.error("Token client not initialized");
      resolve(null);
      return;
    }

    tokenClient.callback = (resp: any) => {
      if (resp.error !== undefined) {
        console.error("OAuth error:", resp.error);
        resolve(null);
      } else {
        accessToken = resp.access_token;
        resolve(resp.access_token);
      }
    };

    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      tokenClient.requestAccessToken({ prompt: "" });
    }
  });
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  return accessToken || window.gapi?.client?.getToken()?.access_token || null;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * Sign out the user
 */
export async function signOut(): Promise<void> {
  const token = window.gapi?.client?.getToken();
  if (token) {
    window.google?.accounts?.oauth2?.revoke(token.access_token);
    window.gapi?.client?.setToken("");
    accessToken = null;
  }
}

/**
 * Fetch emails from Gmail
 */
export async function fetchGmailMessages(): Promise<GmailMessage[]> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  try {
    const response = await window.gapi.client.gmail.users.messages.list({
      userId: "me",
      q: "newer_than:30d",
      maxResults: 25,
    });

    const messages: GmailMessage[] = [];
    const messageIds = response.result.messages || [];

    for (const item of messageIds) {
      const message = await window.gapi.client.gmail.users.messages.get({
        userId: "me",
        id: item.id,
        format: "full",
      });

      const msg = message.result;
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      let text = extractPlainText(msg.payload);
      if (!text && msg.payload?.mimeType === "text/html") {
        text = htmlToText(decodeBase64Url(msg.payload?.body?.data));
      }

      messages.push({
        messageId: item.id,
        threadId: msg.threadId || "",
        from: getHeader("From"),
        subject: getHeader("Subject") || "Untitled email",
        date: getHeader("Date") || new Date().toISOString(),
        snippet: msg.snippet || "",
        text: text.trim(),
      });
    }

    return messages;
  } catch (error) {
    console.error("Error fetching Gmail messages:", error);
    throw error;
  }
}

/**
 * Helper: Decode base64url
 */
function decodeBase64Url(value?: string | null): string {
  if (!value) return "";
  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

/**
 * Helper: Extract plain text from message part
 */
function extractPlainText(part: any): string {
  if (part?.mimeType === "text/plain") {
    return decodeBase64Url(part?.body?.data);
  }
  for (const child of part?.parts || []) {
    const result = extractPlainText(child);
    if (result) return result;
  }
  return "";
}

/**
 * Helper: Convert HTML to text
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
