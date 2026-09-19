import React, { useEffect, useRef, useState } from "react";
import { CropLayoutPicker } from "./CropLayoutPicker";
import type { TimelineClip } from "@heis/core";
export type Transform = Pick<
  TimelineClip,
  "x" | "y" | "scale" | "rotation" | "opacity" | "fit" | "crop"
>;
const defaults: Transform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: "fit",
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
};
export function TransformPanel({
  clip,
  media,
  disabled,
  onPreview,
  onCommit,
  onCrop,
  cropLayout,
  onCropLayout,
}: {
  onCrop: () => void;
  cropLayout: string;
  onCropLayout: (layout: string) => void;
  clip: TimelineClip;
  media: boolean;
  disabled: boolean;
  onPreview: (value?: Transform) => void;
  onCommit: (value: Transform) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Transform>();
  const pending = useRef<Transform | undefined>(undefined);
  const pointer = useRef(false);
  const notify = useRef(onPreview);
  notify.current = onPreview;
  const value: Transform = draft || {
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
    fit: clip.fit,
    crop: clip.crop,
  };
  const cancel = () => {
    pending.current = undefined;
    pointer.current = false;
    setDraft(undefined);
    notify.current(undefined);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      notify.current(undefined);
    };
  }, []);
  const update = (patch: Partial<Transform>) => {
    const next = { ...value, ...patch };
    pending.current = next;
    setDraft(next);
    onPreview(next);
  };
  const commit = () => {
    pointer.current = false;
    const next = pending.current;
    pending.current = undefined;
    if (next) void onCommit(next).finally(cancel);
  };
  const quick = (patch: Partial<Transform>) => {
    update(patch);
    commit();
  };
  const slider = (
    label: string,
    amount: number,
    min: number,
    max: number,
    step: number,
    display: string,
    hints: [string, string],
    change: (v: number) => Partial<Transform>,
    reset: Partial<Transform>,
    neutral: number,
  ) => (
    <div className="heis-color-control" key={label}>
      <div className="heis-color-label">
        <label htmlFor={`transform-${label}`}>{label}</label>
        <output>{display}</output>
        <button
          disabled={disabled || amount === neutral}
          aria-label={`Reset ${label.toLowerCase()}`}
          title={`Reset ${label.toLowerCase()}`}
          onClick={() => quick(reset)}
        >
          ↺
        </button>
      </div>
      <div className="heis-color-range">
        <input
          id={`transform-${label}`}
          type="range"
          value={amount}
          min={Math.min(min, amount)}
          max={Math.max(max, amount)}
          step={step}
          disabled={disabled}
          aria-valuetext={display}
          onPointerDown={(event) => {
            pointer.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onChange={(event) =>
            update(change(Number(event.currentTarget.value)))
          }
          onPointerUp={commit}
          onPointerCancel={cancel}
          onLostPointerCapture={() => {
            if (pointer.current) cancel();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              commit();
          }}
          onBlur={() => {
            if (!pointer.current) commit();
          }}
        />
        <span
          className="heis-color-neutral"
          style={{
            left: `${((neutral - Math.min(min, amount)) / Math.max(1, Math.max(max, amount) - Math.min(min, amount))) * 100}%`,
          }}
        />
      </div>
      <div className="heis-color-hints">
        <span>{hints[0]}</span>
        <span>{hints[1]}</span>
      </div>
    </div>
  );
  return (
    <div className="heis-transform-controls">
      {media && (
        <div
          className="heis-transform-sizing"
          role="group"
          aria-label="Video sizing"
        >
          <button
            disabled={disabled}
            aria-pressed={value.fit === "fit"}
            title="Show the entire image"
            onClick={() => quick({ fit: "fit", scale: 1, x: 0.5, y: 0.5 })}
          >
            Fit<span>Entire image</span>
          </button>
          <button
            disabled={disabled}
            aria-pressed={value.fit === "fill"}
            title="Cover the frame, cropping edges if needed"
            onClick={() => quick({ fit: "fill", scale: 1, x: 0.5, y: 0.5 })}
          >
            Fill<span>Cover frame</span>
          </button>
        </div>
      )}
      <div className="heis-transform-actions">
        <strong>Position</strong>
        <button disabled={disabled} onClick={() => quick({ x: 0.5, y: 0.5 })}>
          Center
        </button>
      </div>
      {slider(
        "Horizontal",
        (value.x - 0.5) * 100,
        -100,
        100,
        1,
        `${Math.round((value.x - 0.5) * 100)}%`,
        ["Left", "Right"],
        (v) => ({ x: v / 100 + 0.5 }),
        { x: 0.5 },
        0,
      )}
      {slider(
        "Vertical",
        (value.y - 0.5) * 100,
        -100,
        100,
        1,
        `${Math.round((value.y - 0.5) * 100)}%`,
        ["Up", "Down"],
        (v) => ({ y: v / 100 + 0.5 }),
        { y: 0.5 },
        0,
      )}
      {slider(
        "Size",
        Math.log2(value.scale),
        Math.log2(0.01),
        Math.log2(20),
        0.01,
        `${Math.round(value.scale * 100)}%`,
        ["Smaller", "Larger"],
        (v) => ({ scale: Math.max(0.01, Math.min(20, 2 ** v)) }),
        { scale: 1 },
        0,
      )}
      {slider(
        "Rotation",
        value.rotation,
        -180,
        180,
        1,
        `${Math.round(value.rotation)}°`,
        ["Counterclockwise", "Clockwise"],
        (v) => ({ rotation: v }),
        { rotation: 0 },
        0,
      )}
      <div className="heis-transform-actions">
        <button
          disabled={disabled}
          onClick={() =>
            quick({ rotation: (((value.rotation - 90) % 360) + 360) % 360 })
          }
        >
          ↶ Rotate 90°
        </button>
        <button
          disabled={disabled}
          onClick={() => quick({ rotation: (value.rotation + 90) % 360 })}
        >
          ↷ Rotate 90°
        </button>
      </div>
      {slider(
        "Opacity",
        value.opacity * 100,
        0,
        100,
        1,
        `${Math.round(value.opacity * 100)}%`,
        ["Transparent", "Solid"],
        (v) => ({ opacity: v / 100 }),
        { opacity: 1 },
        100,
      )}
      {media && <div className="heis-crop-actions"><button disabled={disabled} onClick={onCrop}>Crop</button><CropLayoutPicker value={cropLayout} disabled={disabled} onSelect={onCropLayout} /></div>}
      {media && (
        <details className="heis-transform-crop">
          <summary>Advanced crop</summary>
          <p>Trim each edge of the source image.</p>
          {(["left", "right", "top", "bottom"] as const).map((side) => {
            const opposite = {
              left: "right",
              right: "left",
              top: "bottom",
              bottom: "top",
            } as const;
            const max = Math.max(
              0,
              Math.floor((0.99 - value.crop[opposite[side]]) * 100 + 1e-6),
            );
            return slider(
              `Crop ${side}`,
              value.crop[side] * 100,
              0,
              max,
              1,
              `${Math.round(value.crop[side] * 100)}%`,
              ["Keep edge", "Trim inward"],
              (v) => ({
                crop: { ...value.crop, [side]: Math.min(max, v) / 100 },
              }),
              { crop: { ...value.crop, [side]: 0 } },
              0,
            );
          })}
          <button
            disabled={disabled}
            onClick={() => quick({ crop: { ...defaults.crop } })}
          >
            Reset crop
          </button>
        </details>
      )}
      <button
        className="heis-transform-reset"
        disabled={disabled}
        onClick={() => quick({ ...defaults, crop: { ...defaults.crop } })}
      >
        Reset transform
      </button>
    </div>
  );
}
