import React, { useId, useRef, useState } from "react";
export function CropLayoutPicker({
  value,
  disabled,
  onSelect,
}: {
  value: string;
  disabled: boolean;
  onSelect: (layout: string) => void;
}) {
  const id = useId();
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  return (
    <>
      <button
        aria-label="Crop layout"
        title="Crop layout"
        popoverTarget={id}
        disabled={disabled}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(
              8,
              Math.min(window.innerWidth - 208, box.right - 200),
            ),
            top: Math.max(
              8,
              Math.min(window.innerHeight - 252, box.bottom + 6),
            ),
          });
        }}
      >
        {value} ▾
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        className="heis-crop-layout-popover"
        style={position}
        role="group"
        aria-label="Crop layouts"
      >
        {[
          ["Free", "Free", "Unlocked"],
          ["Original", "Original", "Source ratio"],
          ["16:9", "Landscape", "16:9"],
          ["9:16", "Portrait", "9:16"],
          ["1:1", "Square", "1:1"],
        ].map(([layout, name, detail]) => (
          <button
            key={layout}
            aria-pressed={value === layout}
            onClick={() => {
              onSelect(layout);
              popover.current?.hidePopover();
            }}
          >
            <span>{name}</span>
            <small>{detail}</small>
          </button>
        ))}
      </div>
    </>
  );
}
