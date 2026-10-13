"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira } from "@/lib/utils";
import { isValidNgPhone, normalizePhone, newReference } from "@/lib/payments";
import SelectableCard from "@/app/components/SelectableCard";
import PaymentConfirmModal from "@/app/components/PaymentConfirmModal";
import PaymentResult from "@/app/components/PaymentResult";
import ErrorState from "@/app/components/ErrorState";

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export default function AirtimePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState("network");
  const [networks, setNetworks] = useState([]);
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [balance, setBalance] = useState(null);

  const [network, setNetwork] = useState(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const loadNetworks = async () => {
    setLoadingNetworks(true);
    setLoadError(null);
    try {
      const [networksRes, balanceRes] = await Promise.all([
        api.getNetworks(),
        api.getBalance().catch(() => null),
      ]);
      setNetworks(networksRes?.networks || []);
      setBalance(balanceRes?.balance ?? null);
    } catch (e) {
      setLoadError(e.message || "Unable to load networks");
    } finally {
      setLoadingNetworks(false);
    }
  };

  useEffect(() => {
    if (user) loadNetworks();
  }, [user]);

  const selectNetwork = (net) => {
    setNetwork(net);
    setPhone("");
    setAmount("");
    setError(null);
    setStep("form");
  };

  const validateForm = () => {
    if (!isValidNgPhone(phone)) {
      setError("Enter a valid Nigerian phone number (e.g. 0803 000 0000)");
      return false;
    }
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Enter a valid amount");
      return false;
    }
    if (value < network.min || value > network.max) {
      setError(
        `Amount must be between ${formatNaira(network.min)} and ${formatNaira(
          network.max
        )}`
      );
      return false;
    }
    if (balance !== null && value > balance) {
      setError("Insufficient balance for this purchase");
      return false;
    }
    return true;
  };

  const goToReview = (e) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) return;
    setReference(newReference("AIR"));
    setPin("");
    setPinError(null);
    setStep("review");
  };

  const submit = async () => {
    if (pin.length !== 4) {
      setPinError("Enter your 4-digit PIN");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.purchaseAirtime({
        network: network.id,
        phone: normalizePhone(phone),
        amount,
        pin,
        reference,
      });
      setResult({
        status: res.status === "pending" ? "pending" : "success",
        message: res.message,
        transaction: res.transaction,
      });
      setStep("result");
    } catch (e) {
      const data = e.data;
      if (e.status === 402 && data?.transaction) {
        setResult({
          status: "failed",
          message: e.message,
          transaction: data.transaction,
        });
        setStep("result");
      } else {
        setError(e.message || "Payment failed. Please try again.");
        setPinError(e.message || "Payment failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("network");
    setNetwork(null);
    setPhone("");
    setAmount("");
    setPin("");
    setReference(null);
    setResult(null);
    setError(null);
    setPinError(null);
    loadNetworks();
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link
          href={step === "network" ? "/pay" : "#"}
          onClick={(e) => {
            if (step !== "network") {
              e.preventDefault();
              setStep(step === "review" ? "form" : "network");
              if (step === "review") setPin("");
            }
          }}
          className="mb-4 inline-flex items-center gap-2 text-text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
          {step === "network" ? "Back to Pay" : "Back"}
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">Buy Airtime</h1>
        {balance !== null && (
          <p className="mt-1 text-sm text-text-secondary">
            Available balance:{" "}
            <span className="font-medium text-text-primary">
              {formatNaira(balance)}
            </span>
          </p>
        )}
      </div>

      <div className="px-4">
        {step === "result" && result ? (
          <PaymentResult
            status={result.status}
            amount={result.amount ?? Number(amount)}
            reference={result.reference ?? reference}
            simulated
            details={[
              { label: "Network", value: network?.name },
              { label: "Recipient", value: normalizePhone(phone) },
            ]}
            onReset={() => {
              setStep("network");
              setResult(null);
              setReference(null);
              setPin("");
              setPhone("");
              setAmount("");
            }}
            resetLabel="Buy more airtime"
          />
        ) : (
          <div className="rounded-2xl border border-border bg-white p-5">
            {loadingNetworks && (
              <div className="flex items-center justify-center gap-2 py-10 text-text-secondary">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading networks...
              </div>
            )}

            {!loadingNetworks && loadError && (
              <ErrorState message={loadError} onRetry={loadNetworks} />
            )}

            {!loadingNetworks && !loadError && step === "network" && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Select the network you want to top up.
                </p>
                {networks.map((net) => (
                  <SelectableCard
                    key={net.id}
                    icon={Phone}
                    title={net.name}
                    subtitle={`${formatNaira(net.min)} - ${formatNaira(net.max)}`}
                    selected={network?.id === net.id}
                    onClick={() => selectNetwork(net)}
                  />
                ))}
              </div>
            )}

            {!loadingNetworks && !loadError && step === "form" && (
              <form onSubmit={goToReview} className="space-y-4" noValidate>
                <div className="flex items-center justify-between rounded-xl bg-pale-bg px-4 py-3">
                  <span className="text-sm text-text-secondary">Network</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {network?.name}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="0803 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                <div>
                  <label
                    htmlFor="amount"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    Amount (NGN)
                  </label>
                  <input
                    id="amount"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAmount(String(value))}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-pale-bg"
                      >
                        {formatNaira(value)}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-error/25 bg-error/10 p-3 text-sm text-error"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-deep"
                >
                  Continue
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <PaymentConfirmModal
        isOpen={step === "review"}
        onClose={() => {
          if (!submitting) {
            setStep("form");
            setPin("");
            setPinError(null);
          }
        }}
        onConfirm={submit}
        title="Confirm Airtime Purchase"
        amount={Number(amount)}
        pin={pin}
        onPinChange={(value) => {
          setPin(value);
          setPinError(null);
        }}
        pinError={pinError}
        loading={submitting}
        error={error}
        details={[
          { label: "Network", value: network?.name },
          { label: "Recipient", value: normalizePhone(phone) },
          { label: "Amount", value: formatNaira(amount) },
        ]}
      />
    </div>
  );
}
