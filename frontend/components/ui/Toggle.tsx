/**
 * An on/off switch with a text label (Settings modal, New meeting menu).
 * role="switch" + aria-checked tells screen readers it's a switch and whether it's on.
 */

"use client";

import { useId } from "react";

type ToggleProps = {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
  description?: string;
};

export function Toggle({ label, isOn, onChange, description }: ToggleProps) {
  const labelId = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={labelId} className="text-sm font-medium text-ink">
          {label}
        </p>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-labelledby={labelId}
        onClick={() => onChange(!isOn)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zoom-blue ${
          isOn ? "bg-zoom-blue" : "bg-gray-300"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
            isOn ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
