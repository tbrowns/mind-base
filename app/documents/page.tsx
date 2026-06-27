"use client";
import Link from "next/link";
import { FileText, Plus, Search, Trash2 } from "@/components/icons";
import { useCallback, useEffect, useState } from "react";
import type { DocumentRecord } from "@/lib/types";
import { accessLabels } from "@/lib/types";
import { Badge, PageHeader, Spinner } from "@/components/ui";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string>();
  const load = useCallback(async () => {
    const r = await fetch("/api/documents", { cache: "no-store" });
    setDocuments((await r.json()).documents);
    setLoading(false);
  }, []);
  useEffect(() => {
    void fetch("/api/documents", { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        setDocuments(result.documents);
        setLoading(false);
      });
  }, []);
  async function remove(id: string) {
    if (!confirm("Delete this document and all its chunks?")) return;
    setDeleting(id);
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await load();
    setDeleting(undefined);
  }
  const shown = documents.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-9 md:px-8 lg:px-10">
      <PageHeader
        eyebrow="Knowledge library"
        title="Documents"
        description="Manage the source material Mindbase can search and cite."
        action={
          <Link
            href="/documents/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white"
          >
            <Plus size={17} />
            Add document
          </Link>
        }
      />
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
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-[#929b95]">
                <th className="px-5 py-3">Document</th>
                <th className="px-5 py-3">Access</th>
                <th className="px-5 py-3">Chunks</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ec]">
              {shown.map((doc) => (
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
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge>{accessLabels[doc.accessLevel]}</Badge>
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
                    <Badge tone="green">Ready</Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      aria-label="Delete document"
                      onClick={() => remove(doc.id)}
                      className="rounded-lg p-2 text-[#9da59f] hover:bg-red-50 hover:text-red-600"
                    >
                      {deleting === doc.id ? (
                        <Spinner size={16} />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Spinner size={24} />
                  </td>
                </tr>
              )}
              {!loading && !shown.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-16 text-center text-sm text-[#7e8882]"
                  >
                    No matching documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
