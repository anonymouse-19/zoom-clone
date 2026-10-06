/**
 * A button that opens a small menu underneath it (profile menu, New meeting options).
 *
 * Closes on: clicking outside, pressing Esc, or choosing a <DropdownItem>. Other content
 * inside the menu (like toggles) leaves it open, so several options can be changed.
 * Items close the menu through a React context, so they don't need a prop passed down.
 */

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** Lets a DropdownItem close the menu it lives in. */
const CloseMenuContext = createContext<() => void>(() => {});

type DropdownProps = {
  /** What the trigger button shows (an avatar, a caret icon, ...). */
  trigger: ReactNode;
  triggerAriaLabel: string;
  triggerClassName?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: "left" | "right";
  children: ReactNode;
};

export function Dropdown({
  trigger,
  triggerAriaLabel,
  triggerClassName = "",
  align = "right",
  children,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // While open, listen for clicks outside and for Esc. Remove the listeners on close,
  // so a closed menu costs nothing.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnOutsideClick(event: MouseEvent) {
      const clickedInside = containerRef.current?.contains(event.target as Node);
      if (!clickedInside) {
        setIsOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        className={`focus-visible:outline-2 focus-visible:outline-zoom-blue ${triggerClassName}`}
      >
        {trigger}
      </button>
      {isOpen && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-2 min-w-56 rounded-xl border border-line bg-white py-2 text-sm text-ink shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <CloseMenuContext.Provider value={() => setIsOpen(false)}>
            {children}
          </CloseMenuContext.Provider>
        </div>
      )}
    </div>
  );
}

type DropdownItemProps = {
  onSelect: () => void;
  children: ReactNode;
  isDestructive?: boolean;
};

/** A clickable menu row. Runs `onSelect`, then closes the menu. */
export function DropdownItem({ onSelect, children, isDestructive = false }: DropdownItemProps) {
  const closeMenu = useContext(CloseMenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect();
        closeMenu();
      }}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left whitespace-nowrap hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none ${
        isDestructive ? "text-zoom-red" : ""
      }`}
    >
      {children}
    </button>
  );
}

/** A thin line between groups of menu items. */
export function DropdownDivider() {
  return <div role="separator" className="my-2 border-t border-line" />;
}
