import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { CardSkeleton, ListSkeleton } from "./LoadingSkeleton";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import TransactionItem from "./TransactionItem";
import { TrendingUp } from "lucide-react";

export default function RecentTransactions({ transactions, loading, error, onRetry }) {
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">Recent Transactions</h2>
        </div>
        <ListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 mt-6">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">Recent Transactions</h2>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <EmptyState
            title="No transactions yet"
            description="Your transaction history will appear here"
          />
        </div>
      </div>
    );
  }

  const recentTx = transactions.slice(0, 5);

  return (
    <div className="px-4 mt-6 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Recent Transactions</h2>
        <Link href="/transactions" className="text-sm text-primary hover:text-primary-deep transition-colors">
          View All
        </Link>
      </div>
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {recentTx.map((tx) => (
            <TransactionItem
              key={tx.id || tx.reference || Math.random()}
              transaction={tx}
              currentAccountNumber={user?.accountNumber}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
