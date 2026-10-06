/**
 * Small "status" pieces used across pages: loading skeletons, empty states, and errors.
 * Every list in the app shows one of these instead of a blank area.
 */

import type { ReactNode } from "react";

/** A grey pulsing block shown where content is loading. Size it with `className`. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
};

/** A friendly "nothing here yet" block: icon, title, message, optional button. */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="mb-1 text-ink-muted">{icon}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="max-w-xs text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A plain error line for when a request fails. */
export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="px-4 py-6 text-center text-sm text-zoom-red">
      {message}
    </p>
  );
}
