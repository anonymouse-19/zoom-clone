/**
 * A row of bars that light up green as you speak: proof the right microphone works.
 *
 * Owns the useMicLevel hook itself, so only this small component re-renders ~60 times a
 * second, not the whole pre-join screen.
 */

"use client";

import { useMicLevel } from "@/hooks/useMicLevel";

const BAR_COUNT = 12;

export function MicLevelMeter({ track }: { track: MediaStreamTrack | null }) {
  const level = useMicLevel(track);
  const litBars = Math.round(level * BAR_COUNT);

  return (
    <div
      className="flex h-3 items-end gap-0.5"
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={BAR_COUNT}
      aria-valuenow={litBars}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-sm transition-colors duration-75 ${
            index < litBars ? "bg-zoom-green" : "bg-line"
          }`}
          style={{ height: `${40 + (index / BAR_COUNT) * 60}%` }}
        />
      ))}
    </div>
  );
}
