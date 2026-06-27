import { demoText } from "@/lib/demo";
import { ingestDocument } from "@/lib/ingest";
import { listDocuments } from "@/lib/store";
export async function POST() {
  try {
    const existing = (await listDocuments()).find(
      (d) => d.title === "Mindbase Demo Guide",
    );
    if (existing) return Response.json({ document: existing, existing: true });
    const document = await ingestDocument({
      title: "Mindbase Demo Guide",
      description:
        "2026 MiniHack rules, deliverables, dates, and bounty guidance.",
      text: demoText,
      accessLevel: "all-team",
      fileName: "mindbase-demo-guide.txt",
      fileType: "text/plain",
    });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load demo document.",
      },
      { status: 500 },
    );
  }
}
