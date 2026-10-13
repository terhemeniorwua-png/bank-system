"use client";

import { Loader2 } from "lucide-react";
import PinInput from "@/app/components/PinInput";
import { formatNaira } from "@/lib/utils";

// Bottom-sheet confirmation used by every payment flow. It shows the
// transaction summary, collects the transaction PIN and exposes loading/error
// state. Dismissal is disabled while a request is in flight.
export default function PaymentConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Payment",
  details = [],
  amount,
  pin,
  onPinChange,
  pinError,
  loading = false,
  error = null,
}) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={!loading ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white pb-safe shadow-2xl sm:mx-auto sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-text-primary">{title}</h2>

          {details.length > 0 && (
            <div className="mb-5 space-y-1">
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

          {amount !== undefined && amount !== null && (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-pale-bg px-4 py-3">
              <span className="text-sm font-medium text-text-secondary">
                Total to pay
              </span>
              <span className="text-lg font-bold text-text-primary">
                {formatNaira(amount)}
              </span>
            </div>
          )}

          <div className="flex flex-col items-center">
            <PinInput
              label="Enter your 4-digit transaction PIN"
              value={pin}
              onChange={onPinChange}
              error={pinError}
              disabled={loading}
              id="payment-pin"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-error/25 bg-error/10 p-3 text-sm text-error"
            >
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-border px-4 py-3 text-text-primary transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 px-4 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Pay Now"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
