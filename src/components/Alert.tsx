"use client";

import type { ReactNode } from "react";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";

type AlertVariant = "destructive" | "warning" | "info" | "success";

const VARIANT_ICON: Record<AlertVariant, typeof AlertCircleIcon> = {
  destructive: AlertCircleIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
  success: CheckCircle2Icon,
};

export type AlertProps = {
  variant?: AlertVariant;
  /** Override the default icon for this variant. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Inline alert banner styled to match shadcn's Alert pattern but bound to
 * the AMS theme tokens (`--danger`, `--warn`, `--info`, `--success`).
 *
 * Compose with <AlertTitle> + <AlertDescription> + optional inline actions:
 *   <Alert variant="destructive">
 *     <AlertTitle>Couldn't save the entry</AlertTitle>
 *     <AlertDescription>{message}</AlertDescription>
 *   </Alert>
 */
export function Alert({ variant = "destructive", icon, children, className }: AlertProps) {
  const IconCmp = VARIANT_ICON[variant];
  return (
    <div className={`ams-alert is-${variant}${className ? ` ${className}` : ""}`} role="alert">
      <div className="ams-alert-icon" aria-hidden="true">
        {icon ?? <IconCmp size={16} strokeWidth={2} />}
      </div>
      <div className="ams-alert-body">{children}</div>
    </div>
  );
}

export function AlertTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ams-alert-title${className ? ` ${className}` : ""}`}>{children}</div>;
}

export function AlertDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ams-alert-description${className ? ` ${className}` : ""}`}>{children}</div>;
}

export function AlertActions({ children }: { children: ReactNode }) {
  return <div className="ams-alert-actions">{children}</div>;
}
