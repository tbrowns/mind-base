import {
  GMAIL_CREDENTIALS_PATH,
  GMAIL_TOKEN_PATH,
} from "@/lib/server/google/gmail";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    message:
      "This app now uses Google's local-auth Gmail quickstart flow from credentials.json. The temporary callback server is created by @google-cloud/local-auth during Gmail Sync, not by this Next route.",
    credentialsPath: GMAIL_CREDENTIALS_PATH,
    tokenPath: GMAIL_TOKEN_PATH,
  });
}
