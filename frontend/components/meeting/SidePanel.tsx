/**
 * The frame around the Participants and Chat panels: a 320px column on the right of the
 * meeting (like Zoom), or a full-screen sheet on phones. Light, like Zoom's panels.
 */

import { X } from "lucide-react";
import type { ReactNode } from "react";

type SidePanelProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned to the bottom (e.g. the chat box, or host buttons). */
  footer?: ReactNode;
};

export function SidePanel({ title, onClose, children, footer }: SidePanelProps) {
  return (
    <aside
      aria-label={title}
      className="fixed inset-0 z-20 flex flex-col bg-white text-ink md:static md:inset-auto md:w-80 md:shrink-0"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-zoom-blue"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <footer className="border-t border-line p-3">{footer}</footer>}
    </aside>
  );
}
