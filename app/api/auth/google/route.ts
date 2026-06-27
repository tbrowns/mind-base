import {
  GMAIL_CREDENTIALS_PATH,
  GMAIL_SCOPES,
  GMAIL_TOKEN_PATH,
  gmailConfigurationStatus,
} from "@/lib/server/google/gmail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const status = gmailConfigurationStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        error: `Missing ${status.missing.join(", ")}`,
        credentialsPath: GMAIL_CREDENTIALS_PATH,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message:
      "Gmail auth uses Google's credentials.json local-auth flow. Click Sync Gmail or POST /api/connectors/gmail/sync to authorize and save token.json.",
    credentialsPath: GMAIL_CREDENTIALS_PATH,
    tokenPath: GMAIL_TOKEN_PATH,
    scopes: GMAIL_SCOPES,
    authorized: status.authorized,
  });
}
