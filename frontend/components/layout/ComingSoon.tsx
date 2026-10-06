/**
 * Placeholder body for product tabs outside this project's scope (Team Chat, Scheduler,
 * Whiteboards, Contacts). They're in the navbar so it looks like Zoom's, and they explain
 * themselves instead of showing a dead link.
 */

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type ComingSoonProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-tile bg-zoom-blue-soft text-zoom-blue">
        <Icon size={36} aria-hidden />
      </div>
      <h1 className="mt-2 text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Coming soon</p>
      <Link
        href="/"
        className="mt-2 text-sm font-semibold text-zoom-blue hover:underline focus-visible:outline-2 focus-visible:outline-zoom-blue"
      >
        Back to Home
      </Link>
    </div>
  );
}
