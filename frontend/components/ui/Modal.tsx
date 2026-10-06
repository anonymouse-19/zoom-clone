/**
 * A modal dialog built on the browser's native <dialog> element.
 *
 * Why <dialog> instead of a hand-made overlay: `showModal()` gives us, for free, focus
 * kept inside the dialog, Esc to close, the rest of the page made inert, and rendering
 * above everything else (the "top layer"). Those are the accessibility details hand-made
 * modals usually get wrong.
 *
 * Controlled: the parent owns `isOpen` and gets `onClose` when the user dismisses it
 * (Esc, the X button, or a click on the dimmed backdrop).
 */

"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons row at the bottom (e.g. Cancel / Save). */
  footer?: ReactNode;
  /** Tailwind max-width class, e.g. "max-w-md" (default) or "max-w-2xl". */
  widthClass?: string;
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  widthClass = "max-w-md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Keep the real <dialog> in step with the `isOpen` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  /**
   * The browser fires "close" both when the user presses Esc and when the effect above
   * calls dialog.close() because the parent already set isOpen to false. Only the first
   * is news to the parent; passing on the second would run onClose twice (and, e.g.,
   * navigate twice).
   */
  function handleNativeClose() {
    if (isOpen) {
      onClose();
    }
  }

  /** A click whose target is the <dialog> itself (not its content) hit the backdrop. */
  function closeOnBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleNativeClose}
      onClick={closeOnBackdropClick}
      className={`m-auto w-[calc(100%-2rem)] ${widthClass} rounded-xl bg-white p-0 text-ink shadow-xl backdrop:bg-black/40`}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-zoom-blue"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
      )}
    </dialog>
  );
}
