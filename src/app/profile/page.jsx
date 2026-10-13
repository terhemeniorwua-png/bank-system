"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  LogOut,
  Mail,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { maskAccount } from "@/lib/utils";
import PinInput from "@/app/components/PinInput";
import { PIN_CREATED_EVENT } from "@/app/components/PinReminder";

const PIN_FORMAT = /^\d{4}$/;

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (!user) return;

    let active = true;
    (async () => {
      try {
        const res = await api.me();
        if (active) setProfile(res?.user || null);
      } catch (err) {
        if (active) setProfileError(err.message || "Could not load profile");
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  const hasPin =
    profile?.hasPin !== undefined ? profile.hasPin : Boolean(profile?.pin);

  const resetFields = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setFieldError({});
  };

  const validate = () => {
    const errors = {};

    if (!hasPin) {
      if (!PIN_FORMAT.test(newPin)) {
        fieldError.newPin = "PIN must be exactly 4 digits";
      }
      if (newPin !== confirmPin) {
        fieldError.confirmPin = "PIN and confirmation do not match";
      }
      return Object.keys(fieldError).length === 0;
    }

    if (!PIN_FORMAT.test(currentPin)) {
      setFieldError((prev) => ({ ...prev, currentPin: "Enter your 4-digit current PIN" }));
      return false;
    }
    if (!PIN_FORMAT.test(newPin)) {
      setFieldError((prev) => ({
        ...prev,
        newPin: "Your new PIN must be exactly 4 digits",
      }));
      return false;
    }
    if (newPin !== confirmPin) {
      setFieldError({ confirmPin: "New PIN and confirmation do not match" });
      return false;
    }
    if (newPin === currentPin) {
      setFieldError({
        newPin: "New PIN must be different from your current PIN",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBanner(null);
    setFieldError({});

    if (!hasPin) {
      if (!PIN_FORMAT.test(newPin)) {
        setFieldError({ newPin: "Your PIN must be exactly 4 digits" });
        return;
      }
    } else {
      if (!PIN_FORMAT.test(currentPin)) {
        setFieldError({ currentPin: "Enter your current 4-digit PIN" });
        return;
      }
      if (!PIN_FORMAT.test(newPin)) {
        setFieldError({ newPin: "Your new PIN must be exactly 4 digits" });
        return;
      }
      if (newPin !== confirmPin) {
        setFieldError({ confirmPin: "New PIN and confirmation do not match" });
        return;
      }
      if (newPin === currentPin) {
        setFieldError({
          newPin: "Your new PIN must be different from your current PIN",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!hasPin) {
        await api.createPin({
          accNum: profile?.accountNumber,
          pin: newPin,
        });
        setBanner({
          type: "success",
          message: "Your transaction PIN has been created successfully.",
        });
        setProfile((prev) => (prev ? { ...prev, hasPin: true } : prev));
        // Let the global PIN reminder know setup is done so it stops nagging.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(PIN_CREATED_EVENT));
        }
      } else {
        await api.changePin({ currentPin, newPin, confirmPin });
        setBanner({
          type: "success",
          message: "Your transaction PIN has been changed successfully.",
        });
      }
      resetFields();
    } catch (err) {
      const status = err?.status;

      if (status === 400 && /current pin/i.test(err.message)) {
        setFieldError({ currentPin: err.message });
      } else if (status === 400 && /different/i.test(err.message)) {
        setFieldError({ newPin: err.message });
      } else {
        setBanner({
          type: "error",
          message: err.message || "Could not update your PIN. Please try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="min-h-screen bg-pale-bg">
        <div className="mx-auto max-w-md px-4 py-8">
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-full hover:bg-pale-bg transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-text-primary" />
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">
            Profile &amp; Settings
          </h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {profileError && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
            {profileError}
          </div>
        )}

        <section className="rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-lg font-semibold text-white">
              {(profile?.name || user?.name || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text-primary">
                {profile?.name || user?.name}
              </p>
              <p className="flex items-center gap-1 truncate text-sm text-text-secondary">
                <Mail className="h-3.5 w-3.5" />
                {profile?.email || user?.email}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-pale-bg px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              <CreditCard className="h-4 w-4" />
              Account number
            </span>
            <span className="text-sm font-medium text-text-primary">
              {profile?.accountNumber
                ? maskAccount(profile.accountNumber)
                : "Unavailable"}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-light-blue">
              <KeyRound className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {hasPin ? "Change Transaction PIN" : "Create Transaction PIN"}
              </h2>
              <p className="text-xs text-text-secondary">
                {hasPin
                  ? "Update the 4-digit PIN used to authorise transactions."
                  : "Set a 4-digit PIN to authorise your transactions."}
              </p>
            </div>
          </div>

          {banner && (
            <div
              role="status"
              className={`mb-4 rounded-xl p-3 text-sm ${
                banner.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}
            >
              {banner.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {hasPin && (
              <PinInput
                id="current-pin"
                label="Current PIN"
                value={currentPin}
                onChange={setCurrentPin}
                error={fieldError.currentPin}
                disabled={submitting}
              />
            )}

            <PinInput
              id="new-pin"
              label="New PIN"
              value={newPin}
              onChange={setNewPin}
              error={fieldError.newPin}
              disabled={submitting}
            />

            {hasPin && (
              <PinInput
                id="confirm-pin"
                label="Confirm New PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                error={fieldError.confirmPin}
                disabled={submitting}
              />
            )}

            <button
              type="submit"
              disabled={submitting || (hasPin && (!currentPin || !newPin))}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-white transition-colors hover:bg-primary-deep disabled:opacity-50"
            >
              {submitting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  {hasPin ? "Change PIN" : "Create PIN"}
                </>
              )}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-white p-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-error transition-colors hover:bg-error/5"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </section>
      </div>
    </div>
  );
}
