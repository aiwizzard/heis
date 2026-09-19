import React, { useEffect, useRef, useState } from "react";
import type { ProjectAsset } from "@heis/core";
import { assetUrl } from "./Preview";
import {
  cropRatio,
  dragCrop,
  type Crop,
  type CropHandle,
} from "./cropGeometry";
const handles: [CropHandle, string][] = [
  ["nw", "top left"],
  ["n", "top"],
  ["ne", "top right"],
  ["e", "right"],
  ["se", "bottom right"],
  ["s", "bottom"],
  ["sw", "bottom left"],
  ["w", "left"],
];
export function CropOverlay({
  projectId,
  asset,
  initial,
  sourceTime,
  layout,
  onLayoutChange,
  onApply,
  onCancel,
}: {
  layout: string;
  onLayoutChange: (layout: string) => void;
  projectId: string;
  asset: ProjectAsset;
  initial: Crop;
  sourceTime: number;
  onApply: (crop: Crop) => Promise<void>;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const gesture = useRef<
    | {
        handle: CropHandle;
        x: number;
        y: number;
        crop: Crop;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !saving &&
        !document.querySelector(":popover-open")
      ) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [saving, onCancel]);
  const preset = layout;
  const aspect = asset.width / asset.height;
  const ratio =
    preset === "Free"
      ? 0
      : (preset === "Original"
          ? aspect
          : preset === "16:9"
            ? 16 / 9
            : preset === "9:16"
              ? 9 / 16
              : 1) / aspect;
  useEffect(() => {
    if (ratio > 0)
      setCrop(cropRatio({ left: 0, right: 0, top: 0, bottom: 0 }, ratio));
  }, [ratio]);
  useEffect(() => {
    dialog.current?.focus();
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.min(width, height * aspect);
      setSize({ width: w, height: w / aspect });
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [aspect]);
  const start = (event: React.PointerEvent, handle: CropHandle) => {
    if (saving) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      handle,
      x: event.clientX,
      y: event.clientY,
      crop,
      width: size.width,
      height: size.height,
    };
  };
  const move = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (g)
      setCrop(
        dragCrop(
          g.crop,
          g.handle,
          (event.clientX - g.x) / g.width,
          (event.clientY - g.y) / g.height,
          ratio,
        ),
      );
  };
  const apply = async () => {
    setSaving(true);
    setError("");
    try {
      await onApply(crop);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (!saving) onCancel();
  };
  const src = assetUrl(projectId, asset.proxyPath || asset.path);
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-label="Crop preview"
      tabIndex={-1}
      className="heis-crop-overlay"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div className="heis-crop-toolbar">
        <strong>Crop</strong>
        <button
          disabled={saving}
          onClick={() => {
            onLayoutChange("Free");
            setCrop({ left: 0, right: 0, top: 0, bottom: 0 });
          }}
        >
          Reset
        </button>
      </div>
      <div ref={host} className="heis-crop-stage">
        <div className="heis-crop-source" style={size}>
          {asset.kind === "image" ? (
            <img
              src={src}
              alt="Source for cropping"
              draggable={false}
              onError={() =>
                setError(
                  "Source could not be loaded. Relink the media and try again.",
                )
              }
            />
          ) : (
            <video
              ref={video}
              src={src}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={() => {
                if (video.current)
                  video.current.currentTime = Math.max(
                    0,
                    Math.min(sourceTime, video.current.duration - 0.04),
                  );
              }}
              onError={() =>
                setError(
                  "Source could not be loaded. Relink the media and try again.",
                )
              }
            />
          )}
          <div
            className="heis-crop-box"
            data-crop-ratio={
              ((1 - crop.left - crop.right) * aspect) /
              (1 - crop.top - crop.bottom)
            }
            style={{
              left: `${crop.left * 100}%`,
              top: `${crop.top * 100}%`,
              width: `${(1 - crop.left - crop.right) * 100}%`,
              height: `${(1 - crop.top - crop.bottom) * 100}%`,
            }}
            onPointerDown={(e) => start(e, "move")}
            onPointerMove={move}
            onPointerUp={() => {
              gesture.current = undefined;
            }}
            onPointerCancel={() => {
              if (gesture.current) setCrop(gesture.current.crop);
              gesture.current = undefined;
            }}
          >
            <div className="heis-crop-grid" />
            {handles.map(([handle, label]) => (
              <button
                key={handle}
                className={`heis-crop-handle ${handle}`}
                aria-label={`Crop ${label} handle`}
                disabled={saving}
                onPointerDown={(e) => start(e, handle)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.02 : 0.005;
                  const dx =
                    event.key === "ArrowLeft"
                      ? -step
                      : event.key === "ArrowRight"
                        ? step
                        : 0;
                  const dy =
                    event.key === "ArrowUp"
                      ? -step
                      : event.key === "ArrowDown"
                        ? step
                        : 0;
                  if (dx || dy) {
                    event.preventDefault();
                    event.stopPropagation();
                    setCrop((c) => dragCrop(c, handle, dx, dy, ratio));
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="heis-crop-footer">
        <small>Drag edges to crop. Drag inside to reposition.</small>
        <button disabled={saving} onClick={cancel}>
          Cancel crop
        </button>
        <button
          className="primary"
          disabled={saving || !!error}
          onClick={() => void apply()}
        >
          Apply crop
        </button>
      </div>
    </div>
  );
}
