"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Landmark,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  LogIn,
} from "lucide-react";
import api from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const [storedEmail] = useState(() =>
    typeof window !== "undefined"
      ? (sessionStorage.getItem("bbt_pending_email") || "").trim().toLowerCase()
      : ""
  );
  const email = queryEmail || storedEmail;
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    sessionStorage.removeItem("bbt_pending_email");
    sessionStorage.removeItem("bbt_pending_name");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const code = digits.join("");

  const focusInput = (index) => {
    const el = inputRefs.current[index];
    if (el) el.focus();
  };

  const handleChange = (index, value) => {
    const cleaned = String(value).replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < CODE_LENGTH - 1) {
      focusInput(index + 1);
    } else if (!cleaned && index > 0) {
      focusInput(index - 1);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      focusInput(index - 1);
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i];
    }
    setDigits(next);
    focusInput(Math.min(pasted.length, CODE_LENGTH - 1));
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setError("Please enter the complete six-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api.verifyEmail({ email, code });
      setSuccess(result);
      setInfo(null);
      setError(null);
    } catch (err) {
      setError(err.message || "Verification failed. Please try again.");
      if (err.status === 429) {
        setDigits(Array(CODE_LENGTH).fill(""));
        focusInput(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await api.resendVerification({ email });
      setDigits(Array(CODE_LENGTH).fill(""));
      focusInput(0);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo("A new verification code has been sent to your email.");
    } catch (err) {
      setError(err.message || "Could not resend the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAccount = async () => {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(String(success.user.accountNumber));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-pale-bg flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center">
          <Landmark className="w-12 h-12 text-primary mx-auto mb-4" />
          <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Your BBT Cash account has been created!
          </h1>
          <p className="text-sm text-text-secondary mb-6">
            Your email address has been verified successfully.
          </p>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <p className="text-xs text-text-secondary mb-1">ACCOUNT NUMBER</p>
            <p className="text-2xl font-bold text-text-primary tracking-widest mb-4">
              {success.user.accountNumber}
            </p>
            <button
              onClick={handleCopyAccount}
              className="w-full py-3 px-4 rounded-xl border border-border text-text-primary font-medium hover:bg-light-blue transition-colors flex items-center justify-center gap-2 mb-3"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" /> Copy account number
                </>
              )}
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-deep text-white font-semibold hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-md shadow-primary/20"
            >
              <LogIn className="w-5 h-5" /> Continue to Login
            </button>
          </div>

          <p className="text-xs text-text-secondary mt-6">
            {success.confirmationEmail === "sent"
              ? "A confirmation email has been sent to your inbox."
              : "We could not send a confirmation email at this time."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pale-bg flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary-deep rounded-2xl shadow-lg flex items-center justify-center mb-3">
            <Landmark className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Verify your email</h1>
          <p className="text-sm text-text-secondary mt-1 text-center">
            We sent a six-digit code to{" "}
            <span className="font-medium text-text-primary">{email || "your email"}</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {error && (
            <div
              role="alert"
              className="bg-error/10 border border-error/25 text-error rounded-xl p-3 mb-4 text-sm"
            >
              {error}
            </div>
          )}
          {info && (
            <div
              role="status"
              className="bg-success/10 border border-success/25 text-success rounded-xl p-3 mb-4 text-sm"
            >
              {info}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Enter the six-digit code
              </label>
              <div
                className="flex gap-2 justify-between"
                onPaste={handlePaste}
                role="group"
                aria-label="Verification code"
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={2}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    className="w-12 h-14 text-center text-xl font-bold text-text-primary bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
                    aria-label={`Digit ${index + 1}`}
                  />
                ))}
              </div>
              <p className="text-xs text-text-secondary mt-3">
                The code expires in 10 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== CODE_LENGTH}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-deep text-white font-semibold hover:opacity-95 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Verifying...
                </>
              ) : (
                "Verify Email"
              )}
            </button>
          </form>

          <div className="flex items-center justify-between mt-6 text-sm">
            <span className="text-text-secondary">
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't receive it?"}
            </span>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || cooldown > 0}
              className="text-primary font-medium hover:text-primary-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Resend Code
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Made a mistake?{" "}
          <Link href="/register" className="text-primary font-medium hover:text-primary-deep">
            Start over
          </Link>
        </p>
        <p className="text-center text-sm text-text-secondary mt-6">
          Made a mistake?{" "}
          <Link href="/register" className="text-primary font-medium hover:text-primary-deep">
            Start over
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-pale-bg flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}