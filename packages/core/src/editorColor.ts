export interface ColorCorrection {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
}
export const neutralColor: ColorCorrection = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 100,
};
export const colorControls = [
  { key: "exposure", label: "Exposure", min: -3, max: 3, step: 0.1 },
  ...["contrast", "highlights", "shadows", "temperature", "tint"].map(
    (key) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      min: -100,
      max: 100,
      step: 1,
    }),
  ),
  { key: "saturation", label: "Saturation", min: 0, max: 200, step: 1 },
] as const;
export function validColor(value: ColorCorrection) {
  return (
    value &&
    colorControls.every(
      ({ key, min, max }) =>
        Number.isFinite(value[key as keyof ColorCorrection]) &&
        value[key as keyof ColorCorrection] >= min &&
        value[key as keyof ColorCorrection] <= max,
    )
  );
}
export function hasColor(value?: ColorCorrection) {
  return Boolean(
    value &&
      Object.keys(neutralColor).some(
        (key) =>
          value[key as keyof ColorCorrection] !==
          neutralColor[key as keyof ColorCorrection],
      ),
  );
}
function parameters(c: ColorCorrection, channel: number) {
  return {
    gain: 2 ** c.exposure,
    contrast: 1 + c.contrast / 100,
    offset:
      (channel === 0 ? c.temperature : channel === 2 ? -c.temperature : 0) /
        500 +
      (channel === 1 ? -c.tint : c.tint / 2) / 500,
  };
}
const clamp = (v: number) => Math.max(0, Math.min(255, v));
const cache = new Map<string, Uint8Array[]>();
export function applyColor(pixels: Uint8ClampedArray, c: ColorCorrection) {
  const key = JSON.stringify(c);
  let tables = cache.get(key);
  if (!tables) {
    tables = [0, 1, 2].map((channel) => {
      const p = parameters(c, channel);
      return Uint8Array.from({ length: 256 }, (_, v) => {
        const x = v / 255;
        return clamp(
          255 *
            ((x * p.gain - 0.5) * p.contrast +
              0.5 +
              (c.shadows / 400) * (1 - x) ** 2 +
              (c.highlights / 400) * x ** 2 +
              p.offset),
        );
      });
    });
    cache.set(key, tables);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  const saturation = c.saturation / 100;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = tables[0][pixels[i]],
      g = tables[1][pixels[i + 1]],
      b = tables[2][pixels[i + 2]];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    pixels[i] = clamp(luma + (r - luma) * saturation);
    pixels[i + 1] = clamp(luma + (g - luma) * saturation);
    pixels[i + 2] = clamp(luma + (b - luma) * saturation);
  }
}
export function colorFilter(c?: ColorCorrection): string {
  if (!c || !hasColor(c)) return "";
  const channels = ["r", "g", "b"].map((name, channel) => {
    const p = parameters(c, channel);
    return `${name}='clip(255*((val/255*${p.gain}-0.5)*${p.contrast}+0.5+${c.shadows / 400}*pow(1-val/255,2)+${c.highlights / 400}*pow(val/255,2)+${p.offset}),0,255)'`;
  });
  const s = c.saturation / 100;
  const matrix = ["r", "g", "b"].flatMap((out, i) =>
    ["r", "g", "b"].map(
      (input, j) =>
        `${out}${input}=${[0.2126, 0.7152, 0.0722][j] * (1 - s) + (i === j ? s : 0)}`,
    ),
  );
  return `,lutrgb=${channels.join(":")},colorchannelmixer=${matrix.join(":")}`;
}
