/**
 * The app's button: Zoom's pill-shaped buttons in four looks.
 *
 * Accepts every normal <button> prop (onClick, disabled, aria-label, ...). Defaults to
 * type="button", so a button inside a form never submits it by accident; pass
 * type="submit" when you mean it.
 */

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-zoom-blue text-white hover:bg-zoom-blue-hover",
  secondary: "border border-line bg-white text-ink hover:bg-canvas",
  danger: "bg-zoom-red text-white hover:bg-zoom-red-hover",
  ghost: "text-ink hover:bg-canvas",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
};

// Shared by every variant: layout, the pill shape, a visible keyboard focus ring, and
// the disabled look.
const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap " +
  "transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zoom-blue " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...buttonProps}
    />
  );
}
