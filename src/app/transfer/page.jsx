"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira, maskAccount } from "@/lib/utils";
import { newReference } from "@/lib/payments";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import PaymentConfirmModal from "@/app/components/PaymentConfirmModal";
import PaymentResult from "@/app/components/PaymentResult";
import ErrorState from "@/app/components/ErrorState";

const DEFAULT_BANK_ID = "bbt-cash";

export default function TransferPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [catalogError, setCatalogError] = useState(null);

  const [bankId, setBankId] = useState(DEFAULT_BANK_ID);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountTouched, setAccountTouched] = useState(false);
  const [recipientName, setRecipientName] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [balance, setBalance] = useState(null);

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attemptReference, setAttemptReference] = useState(null);
  const [result, setResult] = useState(null);

  const validationIdRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    setCatalogError(null);
    try {
      const [banksRes, balanceRes] = await Promise.all([
        api.getBanks(),
        api.getBalance().catch(() => null),
      ]);
      setBanks(banksRes?.banks || []);
      setBankId(banksRes?.defaultBank || DEFAULT_BANK_ID);
      setBalance(balanceRes?.balance ?? null);
    } catch (e) {
      setCatalogError(e.message || "Unable to load the bank list");
    } finally {
      setLoadingBanks(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadBanks();
  }, [user, loadBanks]);

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === bankId) || null,
    [banks, bankId]
  );

  const accountNumberLength = selectedBank?.accountNumberLength || 0;
  const isInternal = Boolean(selectedBank?.internal);

  // Live format validation as the user types (the input caps the length at the
  // bank's expected digit count, so values can only be short, not long).
  const formatError = useMemo(() => {
    if (!accountNumber || !accountNumberLength) return null;
    if (accountNumber.length === accountNumberLength) return null;
    return isInternal
      ? `Invalid account number. Please enter a valid ${accountNumberLength}-digit BBT Cash Bank account number.`
      : `Invalid account number. Please enter an ${accountNumberLength}-digit account number.`;
  }, [accountNumber, accountNumberLength, isInternal]);

  // Reset recipient state when the bank changes so details from the previous
  // bank are never reused.
  useEffect(() => {
    setRecipientName(null);
    setAccountError(null);
    setAccountTouched(false);
    validationIdRef.current += 1;
  }, [bankId]);

  // Verify the recipient with the backend once the format is complete.
  useEffect(() => {
    if (!selectedBank || !accountNumberLength) return undefined;
    if (accountNumber.length !== accountNumberLength) {
      setRecipientName(null);
      return undefined;
    }

    const requestId = ++validationIdRef.current;
    const timer = setTimeout(async () => {
      setCheckingAccount(true);
      setAccountError(null);
      try {
        const res = await api.validateTransferAccount({
          bank: bankId,
          accountNumber,
        });
        if (requestId !== validationIdRef.current) return;
        setRecipientName(res?.account?.name || null);
      } catch (e) {
        if (requestId !== validationIdRef.current) return;
        setRecipientName(null);
        setAccountError(e.message || "Could not verify the account");
      } finally {
        if (requestId === validationIdRef.current) setCheckingAccount(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [accountNumber, accountNumberLength, bankId, selectedBank]);

  const handleBankChange = (event) => {
    setBankId(event.target.value);
    setAccountNumber("");
  };

  const handleAccountChange = (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    const limited = accountNumberLength
      ? digits.slice(0, accountNumberLength)
      : digits;
    setAccountNumber(limited);
    setRecipientName(null);
    setAccountError(null);
    validationIdRef.current += 1;
  };

  const amountValue = Number(amount);
  const amountValid = Number.isInteger(amountValue) && amountValue > 0;
  const accountVerified =
    Boolean(recipientName) &&
    accountNumberLength > 0 &&
    accountNumber.length === accountNumberLength &&
    !formatError &&
    !accountError;

  // Only surface a format error after the field has been touched, so the user
  // is not scolded mid-typing. Backend validation errors always show.
  const displayAccountError =
    accountError || (accountTouched ? formatError : null);

  const canContinue = Boolean(selectedBank) && accountVerified && amountValid;

  const handleSubmit = (event) => {
    event.preventDefault();
    setError(null);
    setAccountTouched(true);

    if (!selectedBank) {
      setError("Please select a bank");
      return;
    }
    if (!accountVerified) {
      setError(
        accountError ||
          formatError ||
          "Please verify the recipient account number"
      );
      return;
    }
    if (!amountValid) {
      setError("Enter a valid amount greater than zero");
      return;
    }

    setPin("");
    setPinError(null);
    setAttemptReference(newReference("TRF"));
    setShowConfirm(true);
  };

  const confirmTransfer = async () => {
    if (pin.length !== 4) {
      setPinError("Enter your 4-digit transaction PIN");
      return;
    }
    setSubmitting(true);
    setPinError(null);
    setError(null);
    try {
      const res = await api.transfer({
        to: accountNumber,
        amount: amountValue,
        from: user?.accountNumber,
        bank: selectedBank.id,
        pin,
        reference: attemptReference || undefined,
        narration: reference || undefined,
      });
      setResult({
        status: "success",
        message: res?.message,
        reference: attemptReference,
        amount: amountValue,
      });
      setShowConfirm(false);
    } catch (e) {
      setError(e.message || "Transfer failed");
      setPinError(e.message || "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setAccountNumber("");
    setRecipientName(null);
    setAmount("");
    setReference("");
    setPin("");
    setPinError(null);
    setError(null);
    setAttemptReference(null);
  };

  if (authLoading) return null;

  if (result) {
    return (
      <div className="min-h-screen bg-pale-bg pb-24 pt-6">
        <PaymentResult
          status={result.status}
          title="Transfer Successful"
          message={result.message}
          amount={result.amount}
          reference={result.reference}
          details={[
            { label: "Bank", value: selectedBank?.name },
            { label: "Recipient", value: recipientName || "N/A" },
            { label: "Account", value: accountNumber },
          ]}
          onReset={resetForm}
          resetLabel="Make another transfer"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-primary mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">Transfer Money</h1>
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
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
          {loadingBanks && (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading banks...
            </div>
          )}

          {!loadingBanks && catalogError && (
            <ErrorState message={catalogError} onRetry={loadBanks} />
          )}

          {!loadingBanks && !catalogError && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="bg-error/10 border border-error/20 text-error rounded-lg p-3 text-sm"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="bank"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Recipient Bank
                </label>
                <select
                  id="bank"
                  name="bank"
                  value={bankId}
                  onChange={handleBankChange}
                  className="w-full px-3 py-3 border border-border rounded-xl bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                      {!bank.internal ? " (external)" : ""}
                    </option>
                  ))}
                </select>
                {selectedBank && !selectedBank.internal && (
                  <p className="mt-1 text-xs text-text-secondary">
                    External bank transfers require a provider integration and
                    are not available yet.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="to"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Recipient Account Number
                </label>
                <input
                  id="to"
                  name="to"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={
                    accountNumberLength
                      ? `${accountNumberLength}-digit account number`
                      : "Account number"
                  }
                  value={accountNumber}
                  onChange={handleAccountChange}
                  onBlur={() => setAccountTouched(true)}
                  aria-invalid={Boolean(displayAccountError)}
                  className={`w-full px-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                    displayAccountError ? "border-error" : "border-border"
                  }`}
                />
                <div className="mt-1 min-h-[1rem] text-xs">
                  {checkingAccount && (
                    <span className="inline-flex items-center gap-1 text-text-secondary">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verifying account...
                    </span>
                  )}
                  {!checkingAccount && displayAccountError && (
                    <span className="inline-flex items-center gap-1 text-error">
                      <XCircle className="h-3 w-3" />
                      {displayAccountError}
                    </span>
                  )}
                  {!checkingAccount && !displayAccountError && recipientName && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      {recipientName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="amount"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Amount (NGN)
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                {amount !== "" && !amountValid && (
                  <p className="mt-1 text-xs text-error">
                    Enter a whole amount greater than zero
                  </p>
                )}
                {amountValid && balance !== null && amountValue > balance && (
                  <p className="mt-1 text-xs text-error">
                    Amount exceeds your available balance
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reference"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Narration (Optional)
                </label>
                <input
                  id="reference"
                  name="reference"
                  type="text"
                  maxLength="64"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="What is this for?"
                  className="w-full px-3 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={!canContinue || submitting}
                className="w-full py-3 bg-primary text-white rounded-xl hover:bg-primary-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </form>
          )}
        </div>
      </div>

      <PaymentConfirmModal
        isOpen={showConfirm}
        onClose={() => {
          if (!submitting) {
            setPin("");
            setPinError(null);
            setShowConfirm(false);
          }
        }}
        onConfirm={confirmTransfer}
        title="Confirm Transfer"
        amount={amountValue}
        pin={pin}
        onPinChange={(value) => {
          setPin(value);
          setPinError(null);
        }}
        pinError={pinError}
        loading={submitting}
        error={error}
        details={[
          { label: "From", value: maskAccount(user?.accountNumber) },
          { label: "Bank", value: selectedBank?.name },
          { label: "Recipient", value: recipientName || "-" },
          { label: "Account", value: accountNumber },
          { label: "Narration", value: reference || "N/A" },
        ]}
      />
    </div>
  );
}
