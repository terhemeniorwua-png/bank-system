"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Zap,
  Tv,
  Globe,
  Droplets,
  ReceiptText,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira } from "@/lib/utils";
import { newReference } from "@/lib/payments";
import SelectableCard from "@/app/components/SelectableCard";
import PaymentConfirmModal from "@/app/components/PaymentConfirmModal";
import PaymentResult from "@/app/components/PaymentResult";
import ErrorState from "@/app/components/ErrorState";

const CATEGORY_ICONS = {
  electricity: Zap,
  "cable-tv": Tv,
  internet: Globe,
  water: Droplets,
};

export default function BillsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState("category");
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [balance, setBalance] = useState(null);

  const [category, setCategory] = useState(null);
  const [provider, setProvider] = useState(null);
  const [customerRef, setCustomerRef] = useState("");
  const [planId, setPlanId] = useState("");
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

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    setLoadError(null);
    try {
      const [catRes, balanceRes] = await Promise.all([
        api.getBillCategories(),
        api.getBalance().catch(() => null),
      ]);
      setCategories(catRes?.categories || []);
      setBalance(balanceRes?.balance ?? null);
    } catch (e) {
      setLoadError(e.message || "Unable to load bill categories");
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadCatalog();
  }, [user]);

  const loadProviders = async (selectedCategory) => {
    setLoadingCatalog(true);
    setLoadError(null);
    try {
      const res = await api.getBillProviders(selectedCategory.id);
      setProviders(res?.providers || []);
      setCategory(selectedCategory);
      setStep("provider");
    } catch (e) {
      setLoadError(e.message || "Unable to load providers");
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Deep link support: /bills?category=cable-tv preselects a category.
  useEffect(() => {
    if (!user || categories.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const preselected = params.get("category");
    if (!preselected) return;
    const match = categories.find((c) => c.id === preselected);
    if (match) {
      setCategory(match);
      api
        .getBillProviders(match.id)
        .then((res) => {
          setProviders(res?.providers || []);
          setStep("provider");
        })
        .catch(() => {});
    }
  }, [user, categories]);

  const selectProvider = (selected) => {
    setProvider(selected);
    setCustomerRef("");
    setAmount("");
    setPlanId(selected.plans?.length ? selected.plans[0].id : "");
    setError(null);
    setStep("details");
  };

  const plan = provider?.plans?.find((p) => p.id === planId) || null;

  const computedAmount =
    provider?.amountMode === "fixed" ? plan?.price : Number(amount);

  const goToReview = async (e) => {
    e.preventDefault();
    setError(null);

    if (customerRef.trim().length < 4) {
      setError(`Enter a valid ${provider?.customerLabel || "customer reference"}`);
      return;
    }

    if (provider?.amountMode === "fixed") {
      if (!plan) {
        setError("Select a plan");
        return;
      }
    } else {
      const value = Number(amount);
      if (!Number.isInteger(value) || value <= 0) {
        setError("Enter a valid amount");
        return;
      }
      if (value < provider.min || value > provider.max) {
        setError(
          `Amount must be between ${formatNaira(provider.min)} and ${formatNaira(
            provider.max
          )}`
        );
        return;
      }
    }

    if (balance !== null && computedAmount > balance) {
      setError("Insufficient balance for this payment");
      return;
    }

    // Simulated customer validation before payment.
    try {
      await api.validateBillCustomer({
        category: category.id,
        provider: provider.id,
        customerRef: customerRef.trim(),
      });
    } catch (validationError) {
      setError(validationError.message || "Customer details could not be validated");
      return;
    }

    setReference(newReference("BIL"));
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
      const res = await api.payBill({
        category: category.id,
        provider: provider.id,
        customerRef: customerRef.trim(),
        ...(provider.amountMode === "fixed"
          ? { planId: plan.id }
          : { amount: Number(amount) }),
        pin,
        reference,
      });
      setResult({
        status: res?.status === "pending" ? "pending" : "success",
        transaction: res?.transaction,
      });
      setStep("result");
    } catch (e) {
      setError(e.message || "Payment failed");
      setPinError(e.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep("category");
    setCategory(null);
    setProviders([]);
    setProvider(null);
    setCustomerRef("");
    setPlanId("");
    setAmount("");
    setPin("");
    setReference(null);
    setResult(null);
    setError(null);
  };

  const goBack = () => {
    setError(null);
    if (step === "category") return router.push("/pay");
    if (step === "provider") return setStep("category");
    if (step === "details") return setStep("provider");
    if (step === "review") {
      setPin("");
      return setStep("details");
    }
    return setStep("category");
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
        <h1 className="text-xl font-semibold text-text-primary">Pay Bills</h1>
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
            amount={result.transaction?.amount ?? computedAmount}
            reference={result.transaction?.reference ?? reference}
            simulated
            details={[
              { label: "Category", value: category?.name },
              { label: "Provider", value: provider?.name },
              { label: provider?.customerLabel || "Reference", value: customerRef },
              ...(plan ? [{ label: "Plan", value: plan.name }] : []),
            ]}
            onReset={() => {
              setStep("category");
              setResult(null);
              setReference(null);
              setPin("");
              setCustomerRef("");
              setAmount("");
            }}
            resetLabel="Pay another bill"
          />
        ) : (
          <div className="rounded-2xl border border-border bg-white p-5">
            {loadingCatalog && (
              <div className="flex items-center justify-center gap-2 py-10 text-text-secondary">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            )}

            {!loadingCatalog && loadError && (
              <ErrorState message={loadError} onRetry={loadCatalog} />
            )}

            {!loadingCatalog && !loadError && step === "category" && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Choose a bill category.
                </p>
                {categories.map((cat) => (
                  <SelectableCard
                    key={cat.id}
                    icon={CATEGORY_ICONS[cat.id] || ReceiptText}
                    title={cat.name}
                    subtitle={cat.description}
                    selected={category?.id === cat.id}
                    onClick={() => loadProviders(cat)}
                  />
                ))}
              </div>
            )}

            {!loadingCatalog && !loadError && step === "provider" && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Select a {category?.name.toLowerCase()} provider.
                </p>
                {providers.map((p) => (
                  <SelectableCard
                    key={p.id}
                    icon={CATEGORY_ICONS[category?.id] || ReceiptText}
                    title={p.name}
                    subtitle={
                      p.amountMode === "fixed"
                        ? `${p.plans?.length || 0} plan(s)`
                        : `Amount ${formatNaira(p.min)} - ${formatNaira(p.max)}`
                    }
                    selected={provider?.id === p.id}
                    onClick={() => selectProvider(p)}
                  />
                ))}
              </div>
            )}

            {!loadingCatalog && !loadError && step === "details" && (
              <form onSubmit={goToReview} className="space-y-4" noValidate>
                <div className="flex items-center justify-between rounded-xl bg-pale-bg px-4 py-3">
                  <span className="text-sm text-text-secondary">Provider</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {provider?.name}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="customerRef"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    {provider?.customerLabel}
                  </label>
                  <input
                    id="customerRef"
                    type="text"
                    inputMode="numeric"
                    placeholder={provider?.customerLabel}
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {provider?.amountMode === "fixed" ? (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-text-primary">
                      Select a plan
                    </span>
                    {provider.plans.map((p) => (
                      <SelectableCard
                        key={p.id}
                        title={p.name}
                        subtitle={p.validity}
                        right={formatNaira(p.price)}
                        selected={planId === p.id}
                        onClick={() => setPlanId(p.id)}
                      />
                    ))}
                  </div>
                ) : (
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
                    <p className="mt-1 text-xs text-text-secondary">
                      Between {formatNaira(provider?.min)} and{" "}
                      {formatNaira(provider?.max)}
                    </p>
                  </div>
                )}

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
            setPin("");
            setPinError(null);
            setStep("details");
          }
        }}
        onConfirm={submit}
        title="Confirm Bill Payment"
        amount={computedAmount}
        pin={pin}
        onPinChange={(value) => {
          setPin(value);
          setPinError(null);
        }}
        pinError={pinError}
        loading={submitting}
        error={error}
        details={[
          { label: "Provider", value: provider?.name },
          { label: provider?.customerLabel || "Reference", value: customerRef },
          ...(plan ? [{ label: "Plan", value: plan.name }] : []),
          { label: "Amount", value: formatNaira(computedAmount) },
        ]}
      />
    </div>
  );
}
