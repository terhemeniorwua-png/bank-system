"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Phone, Wifi } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira } from "@/lib/utils";
import { isValidNgPhone, normalizePhone, newReference } from "@/lib/payments";
import SelectableCard from "@/app/components/SelectableCard";
import PaymentConfirmModal from "@/app/components/PaymentConfirmModal";
import PaymentResult from "@/app/components/PaymentResult";
import ErrorState from "@/app/components/ErrorState";

export default function DataPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState("network");
  const [networks, setNetworks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [balance, setBalance] = useState(null);

  const [network, setNetwork] = useState(null);
  const [plan, setPlan] = useState(null);
  const [phone, setPhone] = useState("");

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const loadCatalog = async () => {
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
    if (user) loadCatalog();
  }, [user]);

  const selectNetwork = async (net) => {
    setNetwork(net);
    setPlan(null);
    setPhone("");
    setError(null);
    setStep("plans");
    setLoadingPlans(true);
    try {
      const res = await api.getDataPlans(net.id);
      setPlans(res?.plans || []);
    } catch (e) {
      setError(e.message || "Unable to load data plans");
    } finally {
      setLoadingPlans(false);
    }
  };

  const selectPlan = (selected) => {
    setPlan(selected);
    setPhone("");
    setError(null);
    setStep("form");
  };

  const goToReview = (e) => {
    e.preventDefault();
    setError(null);
    if (!isValidNgPhone(phone)) {
      setError("Enter a valid Nigerian phone number (e.g. 0803 000 0000)");
      return;
    }
    if (balance !== null && plan.price > balance) {
      setError("Insufficient balance for this purchase");
      return;
    }
    setReference(newReference("DAT"));
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
      const res = await api.purchaseData({
        network: network.id,
        planId: plan.id,
        phone: normalizePhone(phone),
        pin,
        reference,
      });
      setResult({
        status: res?.status === "pending" ? "pending" : "success",
        transaction: res?.transaction,
      });
      setStep("result");
    } catch (e) {
      setError(e.message || "Purchase failed");
      setPinError(e.message || "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep("network");
    setNetwork(null);
    setPlan(null);
    setPlans([]);
    setPhone("");
    setPin("");
    setReference(null);
    setResult(null);
    setError(null);
  };

  const goBack = () => {
    setError(null);
    if (step === "network") return router.push("/pay");
    if (step === "plans") return setStep("network");
    if (step === "form") return setStep("plans");
    if (step === "review") {
      setPin("");
      return setStep("form");
    }
    return setStep("network");
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <button
          type="button"
          onClick={goBack}
          className="mb-4 inline-flex items-center gap-2 text-text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>
        <h1 className="text-xl font-semibold text-text-primary">Buy Data</h1>
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
            amount={result.transaction?.amount ?? plan?.price}
            reference={result.transaction?.reference ?? reference}
            simulated
            details={[
              { label: "Network", value: network?.name },
              { label: "Plan", value: plan?.name },
              { label: "Recipient", value: normalizePhone(phone) },
            ]}
            onReset={resetAll}
            resetLabel="Buy more data"
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
              <ErrorState message={loadError} onRetry={loadCatalog} />
            )}

            {!loadingNetworks && !loadError && step === "network" && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Select the network for the data bundle.
                </p>
                {networks.map((net) => (
                  <SelectableCard
                    key={net.id}
                    icon={Wifi}
                    title={net.name}
                    subtitle="View available data plans"
                    selected={network?.id === net.id}
                    onClick={() => selectNetwork(net)}
                  />
                ))}
              </div>
            )}

            {!loadingNetworks && step === "plans" && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  {network?.name} data plans
                </p>
                {loadingPlans && (
                  <div className="flex items-center justify-center gap-2 py-10 text-text-secondary">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading plans...
                  </div>
                )}
                {!loadingPlans && error && (
                  <ErrorState message={error} onRetry={() => selectNetwork(network)} />
                )}
                {!loadingPlans &&
                  !error &&
                  plans.map((p) => (
                    <SelectableCard
                      key={p.id}
                      icon={Wifi}
                      title={`${p.allowance} — ${p.name}`}
                      subtitle={`Valid for ${p.validity}`}
                      right={formatNaira(p.price)}
                      selected={plan?.id === p.id}
                      onClick={() => selectPlan(p)}
                    />
                  ))}
                {!loadingPlans && !error && plans.length === 0 && (
                  <p className="py-6 text-center text-sm text-text-secondary">
                    No plans available for this network.
                  </p>
                )}
              </div>
            )}

            {!loadingNetworks && step === "form" && (
              <form onSubmit={goToReview} className="space-y-4" noValidate>
                <div className="rounded-xl bg-pale-bg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Network</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {network?.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Plan</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {plan?.allowance} · {plan?.validity}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Price</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {formatNaira(plan?.price)}
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    Recipient Phone Number
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-deep"
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
            setPin("");
            setPinError(null);
            setStep("form");
          }
        }}
        onConfirm={submit}
        title="Confirm Data Purchase"
        amount={plan?.price}
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
          { label: "Plan", value: `${plan?.allowance} (${plan?.name})` },
          { label: "Recipient", value: normalizePhone(phone) },
        ]}
      />
    </div>
  );
}
