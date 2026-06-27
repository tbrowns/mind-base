"use client";

import { useState } from "react";

export default function FileToMarkdownUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");

  async function handleConvert() {
    const MARKITDOWN_URL = process.env.NEXT_PUBLIC_MARKITDOWN_URL || "";
    if (!file) {
      setError("Please select a file first.");
      return;
    }

    setLoading(true);
    setError("");
    setMarkdown("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${MARKITDOWN_URL}/convert`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Failed to convert file.");
      }

      const mdText = await res.text();
      setMarkdown(mdText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function downloadMarkdown() {
    if (!markdown) return;

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `${file.name.split(".")[0]}.md` : "converted.md";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        File to Markdown Converter
      </h1>

      <p className="mb-6 text-sm text-gray-500">
        Upload a file and convert it to Markdown using your FastAPI backend.
      </p>

      <div className="mb-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
      </div>

      {file && (
        <p className="mb-4 text-sm text-gray-600">
          Selected: <span className="font-medium">{file.name}</span>
        </p>
      )}

      <button
        onClick={handleConvert}
        disabled={loading}
        className="rounded-lg bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Converting..." : "Convert to Markdown"}
      </button>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {markdown && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Markdown Output</h2>

            <button
              onClick={downloadMarkdown}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Download .md
            </button>
          </div>

          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="h-80 w-full rounded-lg border p-3 font-mono text-sm"
          />
        </div>
      )}
    </div>
  );
}
