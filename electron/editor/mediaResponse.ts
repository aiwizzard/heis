import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

// The caller must resolve the path through EditorService's project allowlist.
export async function projectMediaResponse(
  file: string,
  request: Request,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405 });
  const size = (await stat(file)).size;
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type":
      types[extname(file).toLowerCase()] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
  });
  let start = 0,
    end = size - 1,
    status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const invalid = () => {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    };
    if (!match || (!match[1] && !match[2])) return invalid();
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid();
      start = Math.max(0, size - suffix);
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(end, Number(match[2])) : end;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    )
      return invalid();
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    status = 206;
  }
  headers.set("Content-Length", String(Math.max(0, end - start + 1)));
  const body =
    request.method === "HEAD" || size === 0
      ? null
      : (Readable.toWeb(
          createReadStream(file, { start, end }),
        ) as ReadableStream<Uint8Array>);
  return new Response(body, { status, headers });
}
