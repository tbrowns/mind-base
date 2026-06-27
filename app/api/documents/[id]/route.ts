import { deleteDocument, getDocument } from "@/lib/store";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const result = await getDocument(id);
  return result
    ? Response.json(result)
    : Response.json({ error: "Document not found." }, { status: 404 });
}
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await deleteDocument(id);
  return Response.json({ ok: true });
}
