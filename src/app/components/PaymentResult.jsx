"use client";

import Link from "next/link";
import {
  CircleCheck,
  Clock,
  CircleX,
  ArrowLeft,
  History,
  RotateCcw,
} from "lucide-react";
import { formatNaira, formatDateTime } from "@/lib/utils";

const STATES = {
  success: {
    Icon: CircleCheck,
    className: "text-success bg-success/10",
    heading: "Payment Successful",
  },
  pending: {
    Icon: Clock,
    className: "text-text-secondary bg-pale-bg",
    heading: "Payment Pending",
  },
  failed: {
    Icon: CircleX,
    className: "text-error bg-error/10",
    heading: "Payment Failed",
  },
};

// Final screen shown after a payment attempt. Displays the server-provided
// status, reference and details, with links to history and dashboard.
export default function PaymentResult({
  status = "success",
  title,
  message,
  amount,
  reference,
  details = [],
  simulated = false,
  onReset,
  resetLabel = "Make another payment",
}) {
  const state = STATES[status] || STATES.success;
  const Icon = state.Icon;

  return (
    <div className="px-4">
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <span
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state.className}`}
          aria-hidden="true"
        >
          <Icon className="h-8 w-8" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-text-primary">
          {title || state.heading}
        </h2>
        {message && (
          <p className="mt-1 text-sm text-text-secondary">{message}</p>
        )}

        {amount !== undefined && amount !== null && (
          <p className="mt-3 text-2xl font-bold text-text-primary">
            {formatNaira(amount)}
          </p>
        )}

        {details.length > 0 && (
          <div className="mt-5 space-y-1 text-left">
            {details.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between border-b border-border py-2 last:border-b-0"
              >
                <span className="text-sm text-text-secondary">{item.label}</span>
                <span className="text-right text-sm font-medium text-text-primary">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {reference && (
          <div className="mt-4 rounded-xl bg-pale-bg px-4 py-3 text-left">
          <p className="text-xs uppercase tracking-wide text-text-secondary">
            Transaction reference
          </p>
            <p className="mt-0.5 break-all text-sm font-semibold text-text-primary">
              {reference}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {formatDateTime(new Date())}
            </p>
          </div>
        )}

        {status === "failed" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-light-blue p-3 text-left text-xs text-text-secondary">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              If funds were reserved for this payment, they have been returned
              to your account.
            </span>
          </div>
        )}

        {simulated && (
          <p className="mt-4 text-xs text-text-secondary/70">
            Simulated test transaction — no live biller or telecom provider was
            contacted.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-deep"
          >
            {resetLabel}
          </button>
        )}
        <Link
          href="/transactions"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white py-3 text-sm font-medium text-primary transition-colors hover:bg-pale-bg"
        >
          <History className="h-4 w-4" />
          View transaction history
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex w-full items-center justify-center gap-2 py-2 text-sm text-text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
