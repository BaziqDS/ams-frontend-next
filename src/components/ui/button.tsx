"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

/**
 * shadcn-style Button API backed by the existing AMS `.btn` theme classes.
 */

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";

type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

function variantClass(variant: ButtonVariant | undefined): string {
  switch (variant) {
    case "outline":
      // Existing `.btn` is already an outlined neutral.
      return "";
    case "ghost":
      return "btn-ghost";
    case "secondary":
      return "btn-secondary";
    case "destructive":
      return "btn-danger";
    case "link":
      return "btn-link";
    case "default":
    default:
      return "btn-primary";
  }
}

function sizeClass(size: ButtonSize | undefined): string {
  switch (size) {
    case "sm":
      return "btn-sm";
    case "md":
      return "btn-md";
    case "xs":
      return "btn-xs";
    case "lg":
      return "btn-lg";
    case "icon":
      return "btn-icon";
    case "icon-xs":
      return "btn-icon-xs";
    case "icon-sm":
      return "btn-icon-sm";
    case "icon-lg":
      return "btn-icon-lg";
    case "default":
    default:
      return "";
  }
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ asChild = false, variant, size, className, type = "button", ...props }, ref) {
    const classes = [
      "btn",
      variantClass(variant),
      sizeClass(size),
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const Comp = asChild ? Slot : "button";
    const buttonProps = asChild ? props : { type, ...props };

    return <Comp ref={ref} className={classes} {...buttonProps} />;
  },
);

Button.displayName = "Button";
