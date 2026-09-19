import sharp from "sharp";

export const MAX_LAYER_BYTES = 100 * 1024 * 1024;
const MAX_PIXELS = 16_777_216;

/** TIFF page order is preserved. Never treat a flattened image as decomposition. */
export async function decodeLayeredImage(bytes: Buffer): Promise<Buffer[]> {
  if (bytes.length > MAX_LAYER_BYTES) throw new Error("Layered image exceeds 100 MB.");
  const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  const pages = metadata.pages ?? 1;
  if (metadata.format !== "tiff" || pages < 2 || pages > 11) throw new Error("Provider must return a TIFF with 2 to 11 RGBA layers.");
  const layers: Buffer[] = [];
  let size = 0;
  for (let page = 0; page < pages; page++) {
    const image = sharp(bytes, { page, pages: 1, limitInputPixels: MAX_PIXELS });
    const info = await image.metadata();
    if (!info.hasAlpha) throw new Error("Provider layer is missing an alpha channel.");
    if (info.width !== metadata.width || (info.pageHeight ?? info.height) !== (metadata.pageHeight ?? metadata.height)) throw new Error("Provider layers have inconsistent canvas sizes.");
    const png = await image.png().toBuffer();
    size += png.length;
    if (size > MAX_LAYER_BYTES) throw new Error("Decoded layers exceed 100 MB.");
    layers.push(png);
  }
  return layers;
}

export async function fetchLayeredImage(url: string): Promise<Buffer[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "runware.ai" || parsed.hostname.endsWith(".runware.ai"))) throw new Error("Untrusted layered image URL.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error("Could not download layered image.");
  if (Number(response.headers.get("content-length")) > MAX_LAYER_BYTES) throw new Error("Layered image exceeds 100 MB.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_LAYER_BYTES) throw new Error("Layered image exceeds 100 MB.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return decodeLayeredImage(Buffer.concat(chunks));
}
