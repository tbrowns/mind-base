import { authorizeAdmin, errorResponse } from "@/lib/auth";
import { listAudit } from "@/lib/workspaces";

type Context = { params: Promise<{ id: string }> };

/** What admins have done: deletions, role changes, admissions, notices sent. */
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await authorizeAdmin(request, id);
    return Response.json({ events: await listAudit(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
