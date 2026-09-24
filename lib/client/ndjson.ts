/**
 * Read a newline-delimited JSON response, calling `onEvent` for each line as
 * it arrives. Network chunks do not respect line boundaries, so partial lines
 * are held until their newline turns up.
 *
 * If `onEvent` throws, reading stops and the stream is cancelled, which tells
 * the server to stop generating.
 */
export async function readNdjson<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) throw new Error("The response has no body to read.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLines = () => {
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as T);
      newline = buffer.indexOf("\n");
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flushLines();
    }
    buffer += decoder.decode();
    flushLines();
    const rest = buffer.trim();
    if (rest) onEvent(JSON.parse(rest) as T);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}
