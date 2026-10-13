"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ListSkeleton } from "@/app/components/LoadingSkeleton";
import EmptyState from "@/app/components/EmptyState";
import ErrorState from "@/app/components/ErrorState";
import TransactionItem from "@/app/components/TransactionItem";

export default function TransactionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      const loadTx = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await api.transactions();
          setTransactions(res?.transactions || []);
        } catch (e) {
          setError(e.message || "Failed to load transactions");
        } finally {
          setLoading(false);
        }
      };
      loadTx();
    }
  }, [user, authLoading, router]);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">Transaction History</h1>
      </div>
      <div className="px-4">
        {loading && <ListSkeleton />}
        {error && <ErrorState message={error} onRetry={loadTx} />}
        {!loading && !error && transactions.length === 0 && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <EmptyState title="No transactions yet" />
          </div>
        )}
        {!loading && !error && transactions.length > 0 && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {transactions.map((tx, idx) => (
                <TransactionItem
                  key={tx.id || tx.reference || idx}
                  transaction={tx}
                  currentAccountNumber={user?.accountNumber}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
