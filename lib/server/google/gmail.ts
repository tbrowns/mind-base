import "server-only";
import fs from "fs";
import path from "path";
import { type GmailMessage } from "@/lib/types";

export type { GmailMessage };

export const GMAIL_CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
export const GMAIL_TOKEN_PATH = path.join(process.cwd(), "token.json");
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

type GmailPayloadPart = {
  headers?: { name: string; value: string }[];
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
};

export function gmailConfigurationStatus() {
  const missing: string[] = [];
  const hasCredentials = fs.existsSync(GMAIL_CREDENTIALS_PATH);
  const hasToken = fs.existsSync(GMAIL_TOKEN_PATH);

  if (!hasCredentials) {
    missing.push("credentials.json");
  }

  return {
    configured: hasCredentials,
    authorized: hasToken,
    missing,
  };
}

/**
 * Fetch Gmail messages using a client-provided OAuth token
 */
export async function fetchGmailMessagesWithToken(
  accessToken: string,
): Promise<GmailMessage[]> {
  if (!accessToken) {
    throw new Error("Access token is required");
  }

  try {
    const listResponse = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/messages?q=newer_than:30d&maxResults=25",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!listResponse.ok) {
      throw new Error(
        `Gmail API error: ${listResponse.status} ${listResponse.statusText}`,
      );
    }

    const listData = (await listResponse.json()) as {
      messages?: { id: string }[];
    };
    const messageIds = listData.messages || [];
    const messages: GmailMessage[] = [];

    for (const item of messageIds) {
      const messageResponse = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!messageResponse.ok) {
        console.error(
          `Failed to fetch message ${item.id}:`,
          messageResponse.statusText,
        );
        continue;
      }

      const messageData = (await messageResponse.json()) as {
        id: string;
        threadId: string;
        snippet: string;
        payload?: GmailPayloadPart;
      };

      const headers = messageData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      let text = extractPlainText(messageData.payload);
      if (!text && messageData.payload?.mimeType === "text/html") {
        text = htmlToText(decodeBase64Url(messageData.payload?.body?.data));
      }

      messages.push({
        messageId: item.id,
        threadId: messageData.threadId || "",
        from: getHeader("From"),
        subject: getHeader("Subject") || "Untitled email",
        date: getHeader("Date") || new Date().toISOString(),
        snippet: messageData.snippet || "",
        text: text.trim(),
      });
    }

    return messages;
  } catch (error) {
    throw new Error(
      `Failed to fetch Gmail messages: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function decodeBase64Url(value?: string | null): string {
  if (!value) return "";
  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function extractPlainText(part?: GmailPayloadPart): string {
  if (part?.mimeType === "text/plain") {
    return decodeBase64Url(part?.body?.data);
  }
  for (const child of part?.parts || []) {
    const result = extractPlainText(child);
    if (result) return result;
  }
  return "";
}

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
