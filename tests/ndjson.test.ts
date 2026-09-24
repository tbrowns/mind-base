import { describe, expect, it } from "vitest";
import { readNdjson } from "@/lib/client/ndjson";

/** A response whose body arrives in exactly these pieces. */
function responseFrom(pieces: string[]): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = pieces.shift();
      if (next === undefined || cancelled) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream);
}

describe("readNdjson", () => {
  it("reassembles lines split across network chunks", async () => {
    const events: unknown[] = [];
    await readNdjson(
      responseFrom(['{"type":"del', 'ta","text":"Hel"}\n{"type":"delta",', '"text":"lo"}\n']),
      (event) => events.push(event),
    );
    expect(events).toEqual([
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
    ]);
  });

  it("keeps a multi-byte character split between chunks intact", async () => {
    const bytes = new TextEncoder().encode('{"text":"【1】 café"}\n');
    const events: Array<{ text: string }> = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 11));
        controller.enqueue(bytes.slice(11));
        controller.close();
      },
    });
    await readNdjson<{ text: string }>(new Response(stream), (e) => events.push(e));
    expect(events).toEqual([{ text: "【1】 café" }]);
  });

  it("reads a final line with no trailing newline", async () => {
    const events: unknown[] = [];
    await readNdjson(responseFrom(['{"a":1}\n{"b":2}']), (e) => events.push(e));
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("stops reading when the handler throws, and rethrows", async () => {
    const seen: unknown[] = [];
    await expect(
      readNdjson(responseFrom(['{"type":"error"}\n', '{"type":"delta"}\n']), (e) => {
        seen.push(e);
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    expect(seen).toHaveLength(1);
  });
});
