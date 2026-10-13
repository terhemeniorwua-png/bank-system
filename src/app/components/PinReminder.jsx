"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import PinSetupModal from "./PinSetupModal";

// Full-screen pages that must never show a PIN reminder (splash, auth, etc.).
const AUTH_PAGES = ["/", "/register", "/login", "/verify-email"];
const INITIAL_DELAY_MS = 2000;
const REMINDER_INTERVAL_MS = 60000;
const STATUS_RETRY_MS = 5000;

// Event other components can dispatch after creating a PIN so the reminder
// stops immediately without a full page reload.
export const PIN_CREATED_EVENT = "bbt:pin-created";

// Owns the "you still need a transaction PIN" experience. The authoritative PIN
// status always comes from the backend (`GET /user/me`), so a refresh, a new
// session, or a PIN created on another device is re-checked rather than trusted
// from a client flag.
export default function PinReminder() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const [hasPin, setHasPin] = useState(null); // null = unknown, true / false
  const [accountNumber, setAccountNumber] = useState(null);
  const [view, setView] = useState("none"); // none | setup | reminder

  const userId = user?.id || null;
  const isAppPage = Boolean(user) && !AUTH_PAGES.includes(pathname);

  const isAppPageRef = useRef(isAppPage);
  const hasPinRef = useRef(hasPin);
  const initialTimerRef = useRef(null);
  const reminderTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const initialShownRef = useRef(false);
  const loadedForRef = useRef(null);

  useEffect(() => {
    isAppPageRef.current = isAppPage;
    if (!isAppPage) setView("none");
  }, [isAppPage]);

  useEffect(() => {
    isAppPageRef.current = isAppPage;
  }, [isAppPage]);

  // Re-read the trusted PIN status. Used on focus and after PIN creation.
  const refreshStatus = useCallback(async () => {
    if (!userId) return false;
    try {
      const res = await api.me();
      setAccountNumber(res?.user?.accountNumber || null);
      setHasPin(Boolean(res?.user?.hasPin));
      return true;
    } catch {
      return false;
    }
  }, [userId]);

  // Initial, authoritative status load. Retries on failure rather than assuming
  // setup is complete.
  useEffect(() => {
    if (loading) return undefined;

    if (!userId) {
      setHasPin(null);
      setAccountNumber(null);
      setView("none");
      initialShownRef.current = false;
      loadedForRef.current = null;
      return undefined;
    }

    if (loadedForRef.current === userId) return undefined;
    loadedForRef.current = userId;

    let active = true;

    const load = async () => {
      try {
        const res = await api.me();
        if (!active) return;
        setAccountNumber(res?.user?.accountNumber || null);
        setHasPin(Boolean(res?.user?.hasPin));
      } catch {
        if (!active) return;
        retryTimerRef.current = setTimeout(load, STATUS_RETRY_MS);
      }
    };

    load();

    return () => {
      active = false;
      clearTimeout(retryTimerRef.current);
    };
  }, [loading, userId]);

  // Re-check when the tab regains focus, when another part of the app reports a
  // PIN was created, or when navigating while setup is still incomplete.
  useEffect(() => {
    const onFocus = () => {
      if (loadedForRef.current === userId) refreshStatus();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(PIN_CREATED_EVENT, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(PIN_CREATED_EVENT, onFocus);
    };
  }, [refreshStatus, userId]);

  useEffect(() => {
    if (isAppPage && hasPin === false) refreshStatus();
    // Only re-check on navigation, never on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Single timer owner: one initial-delay timer and one recurring interval.
  // Cleanup prevents duplicates across re-renders, route changes (the effect
  // does not depend on pathname) and React Strict Mode's double invocation.
  useEffect(() => {
    clearTimeout(initialTimerRef.current);
    clearInterval(reminderTimerRef.current);
    initialTimerRef.current = null;
    reminderTimerRef.current = null;

    if (loading || !userId || hasPin !== false) return undefined;

    if (!initialShownRef.current) {
      initialTimerRef.current = setTimeout(() => {
        initialShownRef.current = true;
        if (isAppPageRef.current) {
          setView((current) => (current === "none" ? "setup" : current));
        }
      }, INITIAL_DELAY_MS);
    }

    reminderTimerRef.current = setInterval(() => {
      if (isAppPageRef.current) {
        setView((current) => (current === "none" ? "reminder" : current));
      }
    }, REMINDER_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimerRef.current);
      clearInterval(reminderTimerRef.current);
      initialTimerRef.current = null;
      reminderTimerRef.current = null;
    };
  }, [loading, userId, hasPin]);

  const handleSuccess = useCallback(async () => {
    // Stop the schedule immediately, then confirm completion with the backend.
    clearTimeout(initialTimerRef.current);
    clearInterval(reminderTimerRef.current);
    initialTimerRef.current = null;
    reminderTimerRef.current = null;
    setView("none");

    const confirmed = await refreshStatus();
    // `createPin` already succeeded server-side; never keep nagging if the
    // confirmation re-fetch itself fails.
    if (!confirmed) setHasPin(true);

    // Refresh the notification bell so the backend-created "PIN created"
    // notification appears promptly (no duplicate is created here).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("focus"));
    }
  }, [refreshStatus]);

  const showReminder = isAppPage && view === "reminder";
  const showSetup = isAppPage && view === "setup";

  return (
    <>
      {showReminder && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setView("none")}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-reminder-title"
            className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-light-blue">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2
              id="pin-reminder-title"
              className="text-center text-lg font-semibold text-text-primary"
            >
              Transaction PIN Required
            </h2>
            <p className="mt-2 text-center text-sm text-text-secondary">
              You haven&apos;t created your transaction PIN yet. Create your
              four-digit PIN to enable secure transactions, including transfers,
              airtime, data purchases, and bill payments.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => setView("setup")}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-deep py-3 font-semibold text-white transition-opacity hover:opacity-95"
              >
                Create PIN Now
              </button>
              <button
                type="button"
                onClick={() => setView("none")}
                className="w-full rounded-xl border border-border py-3 font-medium text-text-primary transition-colors hover:bg-gray-50"
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </>
      )}

      <PinSetupModal
        isOpen={isAppPage && view === "setup"}
        onClose={() => setView("none")}
        onSuccess={handleSuccess}
        accountNumber={accountNumber}
      />
    </>
  );
}
