"use client";
import Link from "next/link";
import {
  ChevronDown,
  FileText,
  Layers3,
  Plus,
  Search,
  Trash2,
} from "@/components/icons";
import { useCallback, useEffect, useState } from "react";
import type { AccessLevel, DocumentRecord } from "@/lib/types";
import { ACCESS_LEVEL_ORDER, accessLabels } from "@/lib/types";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import { useSession, type WorkspaceSummary } from "@/components/session-context";

/** Pull the server `{error}` text out of a failed response, with a fallback. */
async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Non-JSON body (proxy page, empty response); fall through.
  }
  return fallback;
}

const statusBadge: Record<
  DocumentRecord["status"],
  { label: string; tone: "green" | "gold" | "gray" }
> = {
  ready: { label: "Ready", tone: "green" },
  processing: { label: "Processing", tone: "gray" },
  error: { label: "Error", tone: "gold" },
};

export default function DocumentsPage() {
  const { activeWorkspace } = useSession();

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Knowledge library"
        title="Documents"
        description="Manage the source material Mindbase can search and cite."
        action={
          activeWorkspace ? (
            <Link
              href="/documents/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white"
            >
              <Plus size={17} />
              Add document
            </Link>
          ) : undefined
        }
      />
      {activeWorkspace ? (
        // Keyed on the workspace so switching resets the list, search and any
        // stale error, and the load effect runs again for the new workspace.
        <Library key={activeWorkspace.id} workspace={activeWorkspace} />
      ) : (
        <div className="mt-8 rounded-2xl border border-[#e3e8e2] bg-white px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f2ee] text-[#0a3f37]">
            <Layers3 size={20} />
          </span>
          <h2 className="mt-5 text-lg font-black text-[#101b18]">
            No workspace selected
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#60756c]">
            Pick a workspace from the menu at the top right to browse its documents.
          </p>
        </div>
      )}
    </div>
  );
}

function Library({ workspace }: { workspace: WorkspaceSummary }) {
  const { user, apiFetch } = useSession();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string>();
  const [changing, setChanging] = useState<string>();
  const [error, setError] = useState("");

  const canManageAll = workspace.role === "admin" || workspace.role === "owner";
  const isOwner = (doc: DocumentRecord) =>
    !!user && doc.ownerId === user.uid;

  const load = useCallback(async () => {
    const response = await apiFetch("/api/documents");
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load documents."));
    }
    const data = (await response.json()) as { documents?: DocumentRecord[] };
    return data.documents ?? [];
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    load()
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load documents.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load, workspace.id]);

  async function remove(id: string) {
    if (!confirm("Delete this document and all its chunks?")) return;
    setDeleting(id);
    setError("");
    try {
      const response = await apiFetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not delete that document."),
        );
      }
      setDocuments(await load());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete that document.",
      );
    } finally {
      setDeleting(undefined);
    }
  }

  async function changeAccess(doc: DocumentRecord, accessLevel: AccessLevel) {
    if (accessLevel === doc.accessLevel) return;
    setChanging(doc.id);
    setError("");
    try {
      const response = await apiFetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ accessLevel }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, "Could not change who can access it."),
        );
      }
      setDocuments((list) =>
        list.map((d) => (d.id === doc.id ? { ...d, accessLevel } : d)),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not change who can access it.",
      );
    } finally {
      setChanging(undefined);
    }
  }

  const shown = documents.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      {error && (
        <div className="mt-6 rounded-2xl border border-[#f3cfc9] bg-[#fff0ed] px-4 py-3 text-sm text-[#b53d31]">
          {error}
        </div>
      )}
      <div className="mt-8 rounded-2xl border border-[#e3e8e2] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#edf0ec] p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative max-w-sm flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c9690]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-xl border border-[#e1e6e0] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#21a67a]"
            />
          </label>
          <p className="text-xs text-[#869089]">
            {documents.length} total document{documents.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-[#929b95]">
                <th className="px-5 py-3">Document</th>
                <th className="px-5 py-3">Visibility</th>
                <th className="px-5 py-3">Access</th>
                <th className="px-5 py-3">Chunks</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ec]">
              {shown.map((doc) => {
                const mine = isOwner(doc);
                const status = statusBadge[doc.status] ?? statusBadge.ready;
                return (
                  <tr key={doc.id} className="group hover:bg-[#fafbf9]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-[#edf5f0] text-[#39705a]">
                          <FileText size={18} />
                        </span>
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="mt-1 max-w-sm truncate text-xs text-[#8a948e]">
                            {doc.description ||
                              doc.fileName ||
                              "Internal knowledge source"}
                          </p>
                          <p className="mt-1 max-w-sm truncate text-xs text-[#60756c]">
                            {mine
                              ? doc.ownerEmail
                              : `Shared by ${doc.ownerEmail}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {doc.visibility === "private" ? (
                        <Badge tone="gold">Private</Badge>
                      ) : (
                        <Badge tone="green">Shared</Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {mine || canManageAll ? (
                        <label className="relative inline-flex items-center">
                          <span className="sr-only">
                            Who can access {doc.title}
                          </span>
                          <select
                            value={doc.accessLevel}
                            disabled={changing === doc.id}
                            onChange={(e) =>
                              void changeAccess(
                                doc,
                                e.target.value as AccessLevel,
                              )
                            }
                            className="appearance-none rounded-full border border-[#dde3dc] bg-[#f4f6f3] py-1 pl-2.5 pr-7 text-[11px] font-semibold text-[#4c5750] outline-none hover:border-[#bfcac2] focus:border-[#21a67a] disabled:cursor-wait disabled:opacity-60"
                          >
                            {ACCESS_LEVEL_ORDER.map((level) => (
                              <option key={level} value={level}>
                                {accessLabels[level]}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-2 text-[#7e8882]">
                            {changing === doc.id ? (
                              <Spinner size={11} />
                            ) : (
                              <ChevronDown size={11} />
                            )}
                          </span>
                        </label>
                      ) : (
                        <Badge tone="gray">
                          {accessLabels[doc.accessLevel]}
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium">
                      {doc.chunkCount}
                    </td>
                    <td className="px-5 py-4 text-xs text-[#6f7973]">
                      {new Date(doc.uploadedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {(mine || canManageAll) && (
                        <button
                          aria-label="Delete document"
                          disabled={deleting === doc.id}
                          onClick={() => remove(doc.id)}
                          className="rounded-lg p-2 text-[#9da59f] hover:bg-red-50 hover:text-red-600 disabled:cursor-wait"
                        >
                          {deleting === doc.id ? (
                            <Spinner size={16} />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loading && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Spinner size={24} />
                  </td>
                </tr>
              )}
              {!loading && !shown.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-16 text-center text-sm text-[#7e8882]"
                  >
                    {error
                      ? "Documents could not be loaded."
                      : "No matching documents found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
