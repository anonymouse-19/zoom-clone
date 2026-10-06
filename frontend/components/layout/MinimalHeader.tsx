/**
 * A slim header for standalone screens (Join, pre-join), which don't show the app's tabs,
 * like Zoom's own join pages.
 */

import Link from "next/link";

import { ZoomLogo } from "./ZoomLogo";

export function MinimalHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4 md:px-6">
      <ZoomLogo />
      <Link href="/" className="text-sm font-semibold text-zoom-blue hover:underline">
        Back to Home
      </Link>
    </header>
  );
}
