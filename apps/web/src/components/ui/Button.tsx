import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

/**
 * The pressable button (docs/DESIGN.md "Shapes"): rounded-2xl, a 3 px darker
 * bottom edge that collapses on press. Variants are the palette's jobs, not
 * colours: `primary` is the sun, `sea` is progress and "correct", `indigo`
 * is the calm default, `coral` is for stopping things. White text sits on
 * a `-deep` face, never on the base swatch (WCAG 1.4.3, palette.test.ts).
 */
export type ButtonVariant = "primary" | "sea" | "indigo" | "coral" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-sun text-indigo border-sun-deep hover:bg-[#f8c25a]",
  sea: "bg-sea-deep text-white border-sea-edge hover:bg-[#137b68]",
  indigo: "bg-indigo text-white border-indigo-deep hover:bg-indigo-soft",
  coral: "bg-coral-deep text-white border-coral-edge hover:bg-[#c74242]",
  ghost: "bg-transparent text-indigo border-transparent hover:bg-sand-deep",
  outline: "bg-cloud text-indigo border-mist-soft hover:bg-sand",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-base",
  lg: "px-6 py-3.5 text-lg",
  xl: "px-8 py-4 text-xl",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `pressable inline-flex items-center justify-center gap-2 rounded-2xl font-display font-semibold tracking-wide select-none disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 disabled:active:border-b-[3px] ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  // `ref` rides along in `rest` (React 19 passes it as a normal prop), which
  // is how CheckBar moves focus to "Continue" after a verdict.
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
