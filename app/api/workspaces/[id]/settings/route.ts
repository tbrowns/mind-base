import { authorizeAdmin, errorResponse, HttpError } from "@/lib/auth";
import { normaliseExtension } from "@/lib/authz";
import { recordAudit, updateWorkspaceSettings } from "@/lib/workspaces";
import type { WorkspaceSettings } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/**
 * Restrict what members may upload.
 *
 * `allowedFileTypes: null` means unrestricted. An empty array means nothing is
 * accepted, which is distinct from null and is honoured as written.
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { workspace, user } = await authorizeAdmin(request, id);
    const body = (await request.json()) as {
      allowedFileTypes?: unknown;
      maxFileSizeMb?: unknown;
    };

    const next: WorkspaceSettings = { ...workspace.settings };

    if (body.allowedFileTypes !== undefined) {
      if (body.allowedFileTypes === null) {
        next.allowedFileTypes = null;
      } else if (Array.isArray(body.allowedFileTypes)) {
        const cleaned = body.allowedFileTypes
          .filter((item): item is string => typeof item === "string")
          // Accept "pdf", ".pdf" or "report.pdf" and store the bare extension.
          .map((item) =>
            item.includes(".")
              ? normaliseExtension(item)
              : item.trim().toLowerCase(),
          )
          .filter((item): item is string => Boolean(item));
        next.allowedFileTypes = Array.from(new Set(cleaned));
      } else {
        throw new HttpError(400, "allowedFileTypes must be a list or null.");
      }
    }

    if (body.maxFileSizeMb !== undefined) {
      const size = Number(body.maxFileSizeMb);
      if (!Number.isFinite(size) || size <= 0 || size > 200) {
        throw new HttpError(400, "Size limit must be between 1 and 200 MB.");
      }
      next.maxFileSizeMb = Math.round(size);
    }

    await updateWorkspaceSettings(id, next);
    await recordAudit({
      workspaceId: id,
      actor: user,
      action: "workspace.settings-changed",
      targetType: "workspace",
      targetId: id,
      detail: `uploads: ${
        next.allowedFileTypes === null
          ? "any type"
          : next.allowedFileTypes.map((t) => `.${t}`).join(", ") || "none"
      }; max ${next.maxFileSizeMb} MB`,
    });

    return Response.json({ settings: next });
  } catch (error) {
    return errorResponse(error);
  }
}
