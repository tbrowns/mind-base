/**
 * Documents are stored only as overlapping chunks (1000 characters, 200 of
 * overlap), so reading one whole means stitching the chunks back together.
 *
 * Consecutive chunks share a run of text where the splitter overlapped them;
 * that run is found and kept once. A shared run shorter than MIN_OVERLAP is
 * treated as coincidence -- two chunks that happen to end and start with the
 * same letter -- and the chunks are joined as separate paragraphs instead.
 */
const MIN_OVERLAP = 20;
const MAX_OVERLAP = 400;

export function mergeChunks(chunks: string[]): string {
  let merged = "";
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (!merged) {
      merged = chunk;
      continue;
    }
    let overlap = 0;
    const longest = Math.min(MAX_OVERLAP, merged.length, chunk.length);
    for (let size = longest; size >= MIN_OVERLAP; size--) {
      if (merged.endsWith(chunk.slice(0, size))) {
        overlap = size;
        break;
      }
    }
    merged += overlap ? chunk.slice(overlap) : `\n\n${chunk}`;
  }
  return merged;
}

/**
 * Character ranges of `passages` within `text`, merged where they touch, for
 * highlighting the parts of a document an answer drew on. A passage that
 * cannot be found (say, the document changed since) is skipped.
 */
export function passageRanges(
  text: string,
  passages: string[],
): Array<[number, number]> {
  const ranges = passages
    .map((passage) => passage.trim())
    .filter(Boolean)
    .map((passage) => {
      const start = text.indexOf(passage);
      return start === -1 ? null : ([start, start + passage.length] as [number, number]);
    })
    .filter((range): range is [number, number] => range !== null)
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
