/**
 * The card shown instead of the pre-join screen when the meeting can't be joined at all:
 * not found, ended, or cancelled. Wording comes from the server (Zoom's own phrases).
 */

import { CalendarX } from "lucide-react";
import Link from "next/link";

export function JoinStatusCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-line bg-white px-8 py-10 text-center shadow-sm">
      <CalendarX size={40} className="text-ink-muted" aria-hidden />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-ink-muted">{message}</p>
      <Link
        href="/"
        className="mt-3 inline-flex h-10 items-center rounded-full bg-zoom-blue px-5 text-sm font-semibold text-white hover:bg-zoom-blue-hover"
      >
        Return to Home
      </Link>
    </div>
  );
}
