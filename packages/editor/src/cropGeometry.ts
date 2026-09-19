import type { TimelineClip } from "@heis/core";
export type Crop = TimelineClip["crop"];
export type CropHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "move";
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function cropRatio(c: Crop, ratio: number): Crop {
  let w = 1 - c.left - c.right,
    h = 1 - c.top - c.bottom;
  const cx = c.left + w / 2,
    cy = c.top + h / 2;
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  return {
    left: cx - w / 2,
    right: 1 - cx - w / 2,
    top: cy - h / 2,
    bottom: 1 - cy - h / 2,
  };
}
export function dragCrop(
  c: Crop,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio = 0,
): Crop {
  const l = c.left,
    r = 1 - c.right,
    t = c.top,
    b = 1 - c.bottom;
  if (handle === "move") {
    dx = clamp(dx, -l, 1 - r);
    dy = clamp(dy, -t, 1 - b);
    return { left: l + dx, right: 1 - r - dx, top: t + dy, bottom: 1 - b - dy };
  }
  const west = handle.includes("w"),
    east = handle.includes("e"),
    north = handle.includes("n"),
    south = handle.includes("s");
  let x0 = west ? clamp(l + dx, 0, r - 0.01) : l,
    x1 = east ? clamp(r + dx, l + 0.01, 1) : r;
  let y0 = north ? clamp(t + dy, 0, b - 0.01) : t,
    y1 = south ? clamp(b + dy, t + 0.01, 1) : b;
  if (ratio > 0) {
    const cx = (l + r) / 2,
      cy = (t + b) / 2;
    const maxW = west ? r : east ? 1 - l : 2 * Math.min(cx, 1 - cx);
    const maxH = north ? b : south ? 1 - t : 2 * Math.min(cy, 1 - cy);
    const useWidth =
      (west || east) &&
      (!(north || south) || Math.abs(dx) >= Math.abs(dy) * ratio);
    const w = clamp(
      useWidth ? x1 - x0 : (y1 - y0) * ratio,
      Math.min(0.01 * Math.max(1, ratio), maxW, maxH * ratio),
      Math.min(maxW, maxH * ratio),
    );
    const h = w / ratio;
    x0 = west ? r - w : east ? l : cx - w / 2;
    x1 = x0 + w;
    y0 = north ? b - h : south ? t : cy - h / 2;
    y1 = y0 + h;
  }
  return {
    left: clamp(x0, 0, 0.99),
    right: clamp(1 - x1, 0, 0.99),
    top: clamp(y0, 0, 0.99),
    bottom: clamp(1 - y1, 0, 0.99),
  };
}
