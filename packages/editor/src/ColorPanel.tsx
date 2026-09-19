import React, { useEffect, useRef, useState } from "react";
import { colorControls, neutralColor, type ColorCorrection } from "@heis/core";
const hints: Record<keyof ColorCorrection, [string, string]> = {
  exposure: ["Darker", "Brighter"],
  contrast: ["Softer", "Stronger"],
  highlights: ["Recover", "Brighten"],
  shadows: ["Deeper", "Lift"],
  temperature: ["Cool", "Warm"],
  tint: ["Green", "Magenta"],
  saturation: ["Muted", "Vivid"],
};
export function ColorPanel({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value?: ColorCorrection;
  disabled: boolean;
  onPreview: (color?: ColorCorrection) => void;
  onCommit: (color: ColorCorrection) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ColorCorrection>();
  const pending = useRef<ColorCorrection | undefined>(undefined);
  const pointer = useRef(false);
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  useEffect(() => () => previewCallback.current(undefined), []);
  const shown = draft || value || neutralColor;
  const cancel = () => {
    pending.current = undefined;
    pointer.current = false;
    setDraft(undefined);
    onPreview(undefined);
  };
  const update = (key: keyof ColorCorrection, number: number) => {
    const next = { ...shown, [key]: number };
    pending.current = next;
    setDraft(next);
    onPreview(next);
  };
  const commit = () => {
    pointer.current = false;
    const next = pending.current;
    pending.current = undefined;
    if (!next) return;
    void onCommit(next).finally(cancel);
  };
  return (
    <div className="heis-color-controls">
      {colorControls.map((control) => {
        const key = control.key as keyof ColorCorrection;
        const amount = shown[key];
        const formatted =
          key === "exposure"
            ? `${amount > 0 ? "+" : ""}${amount.toFixed(1)} EV`
            : key === "saturation"
              ? `${amount}%`
              : `${amount > 0 ? "+" : ""}${amount}`;
        return (
          <div className="heis-color-control" key={key}>
            {(key === "exposure" || key === "temperature") && (
              <p className="heis-color-group">
                {key === "exposure" ? "Light" : "Color balance"}
              </p>
            )}
            <div className="heis-color-label">
              <label htmlFor={`color-${key}`}>{control.label}</label>
              <output htmlFor={`color-${key}`}>{formatted}</output>
              <button
                disabled={disabled || amount === neutralColor[key]}
                aria-label={`Reset ${control.label.toLowerCase()}`}
                title={`Reset ${control.label.toLowerCase()}`}
                onClick={() => {
                  update(key, neutralColor[key]);
                  pending.current = { ...shown, [key]: neutralColor[key] };
                  commit();
                }}
              >
                ↺
              </button>
            </div>
            <div className={`heis-color-range ${key}`}>
              <input
                id={`color-${key}`}
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={amount}
                disabled={disabled}
                aria-valuetext={formatted}
                onPointerDown={(event) => {
                  pointer.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onChange={(event) =>
                  update(key, Number(event.currentTarget.value))
                }
                onPointerUp={commit}
                onPointerCancel={cancel}
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
              <span className="heis-color-neutral" />
            </div>
            <div className="heis-color-hints">
              <span>{hints[key][0]}</span>
              <span>{hints[key][1]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
