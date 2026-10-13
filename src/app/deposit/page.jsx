"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira, maskAccount } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ConfirmationModal from "@/app/components/ConfirmationModal";

export default function DepositPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    accountNumber: "",
    amount: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user && !form.accountNumber) {
      setForm((prev) => ({ ...prev, accountNumber: user.accountNumber }));
    }
  }, [user, authLoading, router]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.accountNumber || !form.amount) {
      setError("Account and amount required");
      return;
    }
    setShowConfirm(true);
  };

  const confirmDeposit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.deposit({
        accountNumber: form.accountNumber,
        amount: form.amount,
      });
      setSuccess("Deposit successful!");
      setShowConfirm(false);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setError(e.message || "Deposit failed");
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">Add Money</h1>
      </div>
      <div className="px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
          {error && (
            <div className="bg-error/10 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-success/10 border border-success/20 text-success rounded-lg p-3 mb-4 text-sm">
              {success}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Account Number</label>
              <input
                type="text"
                name="accountNumber"
                required
                value={form.accountNumber}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Amount (NGN)</label>
              <input
                type="number"
                name="amount"
                required
                min="1"
                value={form.amount}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white rounded-xl hover:bg-primary-deep transition-colors disabled:opacity-50"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmDeposit}
        loading={loading}
        title="Confirm Deposit"
        details={[
          { label: "Account", value: maskAccount(form.accountNumber) },
          { label: "Amount", value: formatNaira(form.amount) },
        ]}
      />
    </div>
  );
}
