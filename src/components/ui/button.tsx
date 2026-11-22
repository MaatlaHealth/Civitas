import clsx from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type Variant = "primary" | "secondary" | "accent" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800",
  secondary: "border border-line bg-white text-navy-900 hover:bg-navy-50",
  accent: "bg-amber-500 text-navy-950 hover:bg-amber-600",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "text-navy-900 hover:bg-navy-50",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
