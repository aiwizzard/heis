import React, { useEffect, useRef } from "react";

// Serialize decoding so a large timeline cannot open many video decoders at once.
let pending: Promise<void> = Promise.resolve();
const frames = new Map<string, HTMLCanvasElement>();
function mediaReady(
  video: HTMLVideoElement,
  event: string,
  action: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      error ? reject(error) : resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("Frame unavailable"));
    const timer = setTimeout(failed, 8000);
    video.addEventListener(event, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    action();
  });
}

export function Filmstrip({
  src,
  sourceIn,
  duration,
  sourceDuration,
  width,
}: {
  src: string;
  sourceIn: number;
  duration: number;
  sourceDuration: number;
  width: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const count = Math.max(1, Math.min(80, Math.ceil(width / 72)));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      timer = setTimeout(() => {
        pending = pending
          .catch(() => {})
          .then(async () => {
            if (cancelled) return;
            const context = canvas.getContext("2d");
            if (!context) return;
            const video = document.createElement("video");
            video.muted = true;
            video.preload = "auto";
            video.crossOrigin = "anonymous";
            try {
              for (let i = 0; i < count && !cancelled; i++) {
                const time = Math.max(
                  0,
                  Math.min(
                    sourceDuration - 0.04,
                    sourceIn + (i / count) * duration,
                  ),
                );
                const key = `${src}:${time.toFixed(3)}`;
                let tile = frames.get(key);
                if (!tile) {
                  if (!video.src)
                    await mediaReady(video, "loadeddata", () => {
                      video.src = src;
                    });
                  if (cancelled) break;
                  if (Math.abs(video.currentTime - time) > 0.001)
                    await mediaReady(video, "seeked", () => {
                      video.currentTime = time;
                    });
                  if (cancelled) break;
                  tile = document.createElement("canvas");
                  tile.width = 96;
                  tile.height = 54;
                  const ctx = tile.getContext("2d")!;
                  const scale = Math.max(
                    96 / video.videoWidth,
                    54 / video.videoHeight,
                  );
                  ctx.drawImage(
                    video,
                    (96 - video.videoWidth * scale) / 2,
                    (54 - video.videoHeight * scale) / 2,
                    video.videoWidth * scale,
                    video.videoHeight * scale,
                  );
                  frames.set(key, tile);
                  if (frames.size > 256)
                    frames.delete(frames.keys().next().value!);
                }
                context.drawImage(tile, i * 96, 0);
              }
            } catch {
              // Keep the clip's name and thumbnail fallback usable for unavailable media.
            } finally {
              video.removeAttribute("src");
              video.load();
            }
          });
      }, 120);
    });
    observer.observe(canvas);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [src, sourceIn, duration, sourceDuration, count]);
  return (
    <canvas
      ref={ref}
      className="heis-filmstrip"
      width={count * 96}
      height={54}
      aria-label="Video clip frames"
    />
  );
}
