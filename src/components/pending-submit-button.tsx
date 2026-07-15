"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface PendingSubmitButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  pendingLabel: string;
}

export function PendingSubmitButton({
  children,
  pendingLabel,
  disabled,
  name,
  value,
  ...props
}: PendingSubmitButtonProps) {
  const status = useFormStatus();
  const isTriggeredButton =
    !name || value === undefined || status.data?.get(name) === value;

  return (
    <button
      {...props}
      name={name}
      value={value}
      disabled={disabled || status.pending}
      aria-disabled={disabled || status.pending}
      data-pending={status.pending || undefined}
    >
      {status.pending && isTriggeredButton && (
        <span className="loading-spinner" aria-hidden="true" />
      )}
      {status.pending && isTriggeredButton ? pendingLabel : children}
    </button>
  );
}
