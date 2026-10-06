/**
 * One of the big rounded-square buttons on the Home page (New meeting, Join, Schedule,
 * Share screen), with its label underneath, as in Zoom.
 *
 * `labelAccessory` sits next to the label. The New meeting tile uses it for its "⌄"
 * options menu.
 */

import type { ReactNode } from "react";

type TileColor = "orange" | "blue";

const COLOR_CLASSES: Record<TileColor, string> = {
  orange: "bg-zoom-orange hover:bg-zoom-orange-hover",
  blue: "bg-zoom-blue hover:bg-zoom-blue-hover",
};

type ActionTileProps = {
  label: string;
  icon: ReactNode;
  color: TileColor;
  onClick: () => void;
  disabled?: boolean;
  labelAccessory?: ReactNode;
};

export function ActionTile({
  label,
  icon,
  color,
  onClick,
  disabled = false,
  labelAccessory,
}: ActionTileProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`grid h-16 w-16 place-items-center rounded-2xl text-white shadow-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zoom-blue disabled:opacity-60 sm:h-[88px] sm:w-[88px] sm:rounded-tile ${COLOR_CLASSES[color]}`}
      >
        {icon}
      </button>
      <div className="flex items-center gap-0.5">
        <span className="text-xs text-ink sm:text-sm">{label}</span>
        {labelAccessory}
      </div>
    </div>
  );
}
