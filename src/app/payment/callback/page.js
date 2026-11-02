"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

function CallbackContent() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("reference") || params.get("trxref");
  const [status, setStatus] = useState("checking"); // checking | success | failed
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) {
      setStatus("failed");
      setMessage("No payment reference found.");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    // The webhook credits the deposit, so poll until its status changes.
    const check = async () => {
      try {
        const res = await api.verifyDeposit(reference);
        const state = String(res?.deposit?.status || "").toLowerCase();

        if (cancelled) return;

        if (["success", "successful", "completed"].includes(state)) {
          setStatus("success");
          setMessage("Your deposit was successful.");
          setTimeout(() => router.push("/dashboard"), 2500);
          return;
        }
        if (["failed", "abandoned", "reversed"].includes(state)) {
          setStatus("failed");
          setMessage("The payment was not completed.");
          return;
        }
        if (++attempts < 10) {
          setTimeout(check, 2000);
        } else {
          setStatus("failed");
          setMessage("We could not confirm your payment yet. Check your balance shortly.");
        }
      } catch (e) {
        if (cancelled) return;
        if (++attempts < 10) setTimeout(check, 2000);
        else {
          setStatus("failed");
          setMessage(e.message || "Could not verify payment.");
        }
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  return (
    <div className="min-h-screen bg-pale-bg flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-border p-8 text-center max-w-sm w-full">
        {status === "checking" && (
          <>
            <h1 className="text-lg font-semibold text-text-primary mb-2">Confirming payment...</h1>
            <p className="text-sm text-text-secondary">Please do not close this page.</p>
          </>
        )}
        {status === "success" && (
          <>
            <h1 className="text-lg font-semibold text-success mb-2">Payment successful</h1>
            <p className="text-sm text-text-secondary">{message} Redirecting to your dashboard...</p>
          </>
        )}
        {status === "failed" && (
          <>
            <h1 className="text-lg font-semibold text-error mb-2">Payment not confirmed</h1>
            <p className="text-sm text-text-secondary mb-4">{message}</p>
            <Link href="/deposit" className="text-primary underline">
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}