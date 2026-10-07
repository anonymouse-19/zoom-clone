/**
 * A full-screen message on the dark meeting background: "Connecting…", the waiting
 * room, "You were removed", "Connection lost", and similar, with buttons for what to
 * do next.
 */

import Link from "next/link";
import type { ReactNode } from "react";

type RoomMessageProps = {
  title: string;
  message?: string | null;
  /** Buttons/links, e.g. RoomMessageLink. */
  actions?: ReactNode;
  /** A slowly pulsing dot: "something is on its way" (the waiting room). */
  isPulsing?: boolean;
};

export function RoomMessage({ title, message, actions, isPulsing = false }: RoomMessageProps) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-room px-6 text-center text-white">
      {isPulsing && (
        <span className="mb-2 h-4 w-4 animate-pulse rounded-full bg-zoom-blue" aria-hidden />
      )}
      <h1 className="text-xl font-semibold">{title}</h1>
      {message && <p className="max-w-md text-sm text-white/70">{message}</p>}
      {actions && <div className="mt-3 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}

type RoomMessageLinkProps = {
  href: string;
  children: ReactNode;
  isPrimary?: boolean;
};

export function RoomMessageLink({ href, children, isPrimary = false }: RoomMessageLinkProps) {
  const colorClasses = isPrimary
    ? "bg-zoom-blue hover:bg-zoom-blue-hover"
    : "bg-white/10 hover:bg-white/20";
  return (
    <Link
      href={href}
      className={`rounded-full px-5 py-2 text-sm font-semibold text-white ${colorClasses}`}
    >
      {children}
    </Link>
  );
}

type RoomMessageButtonProps = {
  onClick: () => void;
  children: ReactNode;
};

/** Like RoomMessageLink, for an action instead of a page (e.g. leaving the waiting room). */
export function RoomMessageButton({ onClick, children }: RoomMessageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
    >
      {children}
    </button>
  );
}
