import { ingestDocument } from "@/lib/ingest";
import type { AccessLevel } from "@/lib/types";

export async function POST(request: Request) {
  try { const body = await request.json(); const document = await ingestDocument({ ...body, accessLevel: body.accessLevel as AccessLevel }); return Response.json({ document }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Document processing failed." }, { status: 400 }); }
}
