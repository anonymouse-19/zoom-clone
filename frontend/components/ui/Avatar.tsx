/**
 * A round avatar showing someone's initials on their colour, like Zoom shows when there's
 * no profile photo (and, later, on video tiles when the camera is off).
 * Optionally shows a green "available" presence dot.
 */

type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-24 w-24 text-3xl",
};

/** "Alex Morgan" → "AM"; "Priya" → "P"; "Sam (Agency)" → "SA". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const firstInitial = words[0][0];
  if (words.length === 1) {
    return firstInitial.toUpperCase();
  }
  // Strip punctuation so "(Agency)" gives "A", not "(".
  const lastWord = words[words.length - 1].replace(/[^\p{L}\p{N}]/gu, "");
  const lastInitial = lastWord[0] ?? "";
  return (firstInitial + lastInitial).toUpperCase();
}

type AvatarProps = {
  name: string;
  color: string;
  size?: AvatarSize;
  showPresence?: boolean;
};

export function Avatar({ name, color, size = "md", showPresence = false }: AvatarProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        // The colour comes from the user's data, so it can't be a fixed Tailwind class.
        style={{ backgroundColor: color }}
        className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${SIZE_CLASSES[size]}`}
        aria-hidden
      >
        {getInitials(name)}
      </span>
      {showPresence && (
        <span
          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-zoom-green"
          aria-label="Available"
        />
      )}
    </span>
  );
}
