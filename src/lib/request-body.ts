/** Apply a byte limit while reading, including requests without Content-Length. */
export async function readBoundedJson(request: Request, limit: number, message: string): Promise<unknown | Response> {
  const tooLarge = () => Response.json({ error: message }, { status: 413 });
  if (Number(request.headers.get("content-length")) > limit) return tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return tooLarge(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; }
  finally { reader.releaseLock(); }
}
