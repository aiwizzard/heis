import type { Sequence, TimelineClip } from "./editor";

// This function is also serialized into the isolated export rasterizer.
export function drawEditorText(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  sequence: Pick<Sequence, "width" | "height">,
): void {
  if (!clip.text) return;
  const t = clip.text;
  ctx.save();
  ctx.translate(clip.x * sequence.width, clip.y * sequence.height);
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.scale(clip.scale, clip.scale);
  ctx.font = `${t.fontSize}px "${t.fontFamily.replace(/["\\]/g, "")}"`;
  ctx.textAlign = t.align;
  ctx.textBaseline = "middle";
  const lines = t.text.split("\n"),
    lineHeight = t.fontSize * 1.25;
  const width = Math.max(
    1,
    ...lines.map((line) => ctx.measureText(line).width),
  );
  const height = lines.length * lineHeight;
  if (t.background && t.background !== "transparent") {
    ctx.fillStyle = t.background;
    const left =
      t.align === "center" ? -width / 2 : t.align === "right" ? -width : 0;
    ctx.fillRect(left - 12, -height / 2 - 6, width + 24, height + 12);
  }
  ctx.fillStyle = t.color;
  lines.forEach((line, i) =>
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight),
  );
  ctx.restore();
}
