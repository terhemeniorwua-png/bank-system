"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import PinInput from "@/app/components/PinInput";
import api from "@/lib/api";

const PIN_FORMAT = /^\d{4}$/;

// Step-by-step transaction PIN reset.
//
//  intro    : explains what will happen; nothing is entered yet.
//  oldPin   : the current PIN is verified against the backend (POST
//             /user/verify-pin) before the user may continue.
//  newPin   : choose the new four-digit PIN.
//  confirm  : re-enter the new PIN; the change is submitted to the backend
//             (PATCH /user/change-pin) only when both entries match.
//  success  : shown only after the backend confirms the change was saved.
//
// All PIN values live only in component state and are cleared whenever the
// modal is closed or dismissed.
export default function PinResetFlow({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState("intro");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the flow whenever the modal is (re)opened so a dismissed attempt can
  // never leak stale PIN digits into the next one.
  useEffect(() => {
    if (isOpen) {
      setStep("intro");
      setOldPin("");
      setNewPin("");
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

  const clearPins = () => {
    setOldPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const handleBackdrop = () => {
    if (!submitting) onClose();
  };

  // Step 2 — verify the old PIN before unlocking the rest of the flow.
  const handleVerifyOldPin = async (event) => {
    event.preventDefault();

    if (!PIN_FORMAT.test(oldPin)) {
      setError("Enter your current 4-digit PIN");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.verifyPin({ pin: oldPin });
      setStep("newPin");
    } catch (err) {
      if (err?.status === 400) {
        setOldPin("");
        setError(err.message || "Your current PIN is incorrect");
      } else {
        setError(err.message || "Could not verify your PIN. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3 — validate the chosen PIN locally, then move to confirmation.
  const handleNewPin = (event) => {
    event.preventDefault();

    if (!PIN_FORMAT.test(newPin)) {
      setError("Your new PIN must be exactly 4 digits");
      return;
    }
    if (newPin === oldPin) {
      setError("New PIN must be different from your current PIN");
      setNewPin("");
      return;
    }

    setError(null);
    setConfirmPin("");
    setStep("confirm");
  };

  // Step 4 — submit the change once the confirmation matches.
  const handleConfirm = async (event) => {
    event.preventDefault();

    if (!PIN_FORMAT.test(confirmPin)) {
      setError("Please confirm your 4-digit PIN");
      return;
    }
    if (confirmPin !== newPin) {
      setError("The two PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.changePin({
        currentPin: oldPin,
        newPin,
        confirmPin,
      });

      clearPins();
      setStep("success");
    } catch (err) {
      if (err?.status === 400 && /current pin/i.test(err.message || "")) {
        // The PIN changed elsewhere mid-flow: send the user back to step 2.
        clearPins();
        setStep("oldPin");
        setError(err.message);
      } else if (err?.status === 400 && /different/i.test(err.message || "")) {
        clearPins();
        setStep("newPin");
        setError(err.message);
      } else if (err?.status === 409) {
        setError(err.message || "You have not created a transaction PIN yet.");
      } else {
        setError(err.message || "Could not reset your PIN. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stepMeta = {
    intro: { label: "", title: "Reset PIN" },
    oldPin: { label: "Step 1 of 3", title: "Enter Current PIN" },
    newPin: { label: "Step 2 of 3", title: "Enter New PIN" },
    confirm: { label: "Step 3 of 3", title: "Confirm New PIN" },
    success: { label: "", title: "PIN Reset Successful" },
  }[step];

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
        aria-label="Reset transaction PIN"
      >
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              {stepMeta.label && (
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {stepMeta.label}
                </p>
              )}
              <h2 className="mt-1 text-xl font-semibold text-text-primary">
                {stepMeta.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleBackdrop}
              disabled={submitting}
              className="rounded-full p-2 transition-colors hover:bg-gray-100 disabled:opacity-40"
              aria-label="Close PIN reset"
            >
              <X className="h-5 w-5 text-text-secondary" />
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-error/25 bg-error/10 p-3 text-sm text-error"
            >
              {error}
            </div>
          )}

          {step === "intro" && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-light-blue">
                  <KeyRound className="h-7 w-7 text-primary" />
                </span>
              </div>
              <p className="text-center text-sm text-text-secondary">
                You will enter your current PIN first. Once it is confirmed you
                can choose a new PIN and confirm it. Your PIN is never shared
                with anyone.
              </p>
              <button
                type="button"
                onClick={() => setStep("oldPin")}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95"
              >
                Start Reset
              </button>
            </div>
          )}

          {step === "oldPin" && (
            <form onSubmit={handleVerifyOldPin} className="space-y-5">
              <p className="text-sm text-text-secondary">
                Enter your current 4-digit transaction PIN to continue.
              </p>
              <div className="flex justify-center">
                <PinInput
                  id="reset-old-pin"
                  label="Current PIN"
                  value={oldPin}
                  onChange={(value) => {
                    setOldPin(value);
                    setError(null);
                  }}
                  disabled={submitting}
                  circular
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !PIN_FORMAT.test(oldPin)}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          )}

          {step === "newPin" && (
            <form onSubmit={handleNewPin} className="space-y-5">
              <p className="text-sm text-text-secondary">
                Current PIN confirmed. Choose a new 4-digit PIN.
              </p>
              <div className="flex justify-center">
                <PinInput
                  id="reset-new-pin"
                  label="New PIN"
                  value={newPin}
                  onChange={(value) => {
                    setNewPin(value);
                    setError(null);
                  }}
                  disabled={submitting}
                  circular
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!PIN_FORMAT.test(newPin)}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          )}

          {step === "confirm" && (
            <form onSubmit={handleConfirm} className="space-y-5">
              <p className="text-sm text-text-secondary">
                Enter the same new PIN again to confirm it.
              </p>
              <div className="flex justify-center">
                <PinInput
                  id="reset-confirm-pin"
                  label="Confirm New PIN"
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
                    setStep("newPin");
                    setNewPin("");
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
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      Reset PIN
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === "success" && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <ShieldCheck className="h-8 w-8 text-success" />
                </span>
              </div>
              <p className="text-center text-sm text-text-secondary">
                Your transaction PIN has been reset successfully. Use the new
                PIN for your next transaction.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSuccess?.();
                  onClose();
                }}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95"
              >
                Done
              </button>
            </div>
          )}

          {step !== "success" && step !== "intro" && (
            <button
              type="button"
              onClick={handleBackdrop}
              disabled={submitting}
              className="mt-4 w-full text-center text-sm font-medium text-text-secondary transition-colors hover:text-primary disabled:opacity-40"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
