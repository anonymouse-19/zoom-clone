/**
 * Temporary body for routes that a later build phase fills in, so links from the
 * dashboard never lead to a 404 while the project is being built.
 * Each page using this is replaced in the phase named on it.
 */

import Link from "next/link";

type PlannedPageProps = { title: string; phase: number; isDark?: boolean };

export function PlannedPage({ title, phase, isDark = false }: PlannedPageProps) {
  return (
    <div
      className={`flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center ${
        isDark ? "min-h-screen bg-room text-white" : ""
      }`}
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className={isDark ? "text-sm text-white/70" : "text-sm text-ink-muted"}>
        This screen is built in Phase {phase}.
      </p>
      <Link href="/" className="mt-2 text-sm font-semibold text-zoom-blue hover:underline">
        Back to Home
      </Link>
    </div>
  );
}
