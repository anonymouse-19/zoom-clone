/**
 * An original text logo in Zoom's style (blue lowercase wordmark + product name).
 * Deliberately plain text, not Zoom's trademarked logo file.
 */

import Link from "next/link";

export function ZoomLogo() {
  return (
    <Link
      href="/"
      aria-label="Home"
      className="flex items-baseline gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-zoom-blue"
    >
      <span className="text-[22px] leading-none font-extrabold tracking-tight text-zoom-blue">
        zoom
      </span>
      <span className="hidden text-sm font-semibold text-ink sm:inline">Workplace</span>
    </Link>
  );
}
