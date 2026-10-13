"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A reusable selectable option card used across the payment flows (network,
// plan, provider and category selection).
export default function SelectableCard({
  icon: Icon,
  title,
  subtitle,
  right,
  selected = false,
  disabled = false,
  onClick,
  className,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left transition-colors disabled:opacity-60",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:bg-pale-bg",
        className
      )}
    >
      {Icon && (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-light-blue text-primary"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block text-xs text-text-secondary">
            {subtitle}
          </span>
        )}
      </span>
      {right != null ? (
        <span className="text-sm font-medium text-text-primary">{right}</span>
      ) : selected ? (
        <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </button>
  );
}
