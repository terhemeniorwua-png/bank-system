"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import PinInput from "@/app/components/PinInput";
import api from "@/lib/api";

const PIN_FORMAT = /^\d{4}$/;

// Two-step transaction PIN setup used by the post-login reminder.
//
//  Step 1 (create)  : choose a four-digit PIN.
//  Step 2 (confirm) : re-enter the same PIN. A mismatch is surfaced and the
//                     user can retry without losing the flow.
//
// The PIN is kept only in component state and is never written to localStorage,
// sessionStorage or the URL. Setup is only treated as complete once the backend
// confirms it was saved.
export default function PinSetupModal({
  isOpen,
  onClose,
  onSuccess,
  accountNumber,
}) {
  const [step, setStep] = useState("create");
  const [createPin, setCreatePin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the flow whenever the modal is (re)opened so a dismissed attempt can
  // never leak stale PIN digits into the next one.
  useEffect(() => {
    if (isOpen) {
      setStep("create");
      setCreatePin("");
      setConfirmPin("");
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleContinue = (event) => {
    event.preventDefault();
    if (!PIN_FORMAT.test(createPin)) {
      setError("Your PIN must be exactly 4 digits");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!PIN_FORMAT.test(confirmPin)) {
      setError("Please confirm your 4-digit PIN");
      return;
    }

    if (confirmPin !== createPin) {
      setError("The two PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createPin({
        accNum: accountNumber || undefined,
        pin: createPin,
      });

      // Only clear and report success once the backend has confirmed the save.
      setCreatePin("");
      setConfirmPin("");
      onSuccess();
    } catch (err) {
      if (err?.status === 400 && /already exist/i.test(err.message || "")) {
        // The account already has a PIN (for example it was created on another
        // device) - treat it as complete rather than showing an error.
        setCreatePin("");
        setConfirmPin("");
        onSuccess();
        return;
      }
      setError(err.message || "Could not create your PIN. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdrop = () => {
    if (!submitting) onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={handleBackdrop}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-white pb-safe shadow-2xl sm:mx-auto sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label="Create your transaction PIN"
      >
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {step === "create" ? "Step 1 of 2" : "Step 2 of 2"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">
                {step === "create"
                  ? "Create Your Transaction PIN"
                  : "Confirm Your PIN"}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleBackdrop}
              disabled={submitting}
              className="rounded-full p-2 transition-colors hover:bg-gray-100 disabled:opacity-40"
              aria-label="Postpone PIN setup"
            >
              <X className="h-5 w-5 text-text-secondary" />
            </button>
          </div>

          <p className="mb-5 text-sm text-text-secondary">
            {step === "create"
              ? "Choose a 4-digit PIN. You will need it to authorise transfers, airtime, data and bill payments."
              : "Enter the same 4-digit PIN again to confirm it."}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-error/25 bg-error/10 p-3 text-sm text-error"
            >
              {error}
            </div>
          )}

          {step === "create" ? (
            <form onSubmit={handleContinue} className="space-y-5">
              <div className="flex justify-center">
                <PinInput
                  id="setup-pin"
                  label="New PIN"
                  value={createPin}
                  onChange={(value) => {
                    setCreatePin(value);
                    setError(null);
                  }}
                  disabled={submitting}
                  circular
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!PIN_FORMAT.test(createPin)}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex justify-center">
                <PinInput
                  id="confirm-pin"
                  label="Confirm PIN"
                  value={confirmPin}
                  onChange={(value) => {
                    setConfirmPin(value);
                    setError(null);
                  }}
                  disabled={submitting}
                  circular
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("create");
                    setConfirmPin("");
                    setError(null);
                  }}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-3 text-text-primary transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !PIN_FORMAT.test(confirmPin)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Create PIN"
                  )}
                </button>
              </div>
            </form>
          )}

          <button
            type="button"
            onClick={handleBackdrop}
            disabled={submitting}
            className="mt-4 w-full text-center text-sm font-medium text-text-secondary transition-colors hover:text-primary disabled:opacity-40"
          >
            Remind Me Later
          </button>
        </div>
      </div>
    </>
  );
}
