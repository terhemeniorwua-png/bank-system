"use client";

import DashboardHeader from "../components/DashboardHeader";
import BalanceCard from "../components/BalanceCard";
import QuickActions from "../components/QuickActions";
import PromoCard from "../components/PromoCard";
import RecentTransactions from "../components/RecentTransactions";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import ErrorState from "../components/ErrorState";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      const loadDashboard = async () => {
        setLoading(true);
        setError(null);
        try {
          const [txRes, balanceRes] = await Promise.allSettled([
            api.transactions(),
            api.getBalance({ pin: user.pin, accountNumber: user.accountNumber }),
          ]);
          if (txRes.status === "fulfilled") {
            setTransactions(txRes.value?.transactions || []);
          }
          let balanceAmount = 0;
          if (balanceRes.status === "fulfilled" && balanceRes.value) {
            const balStr = balanceRes.value.balance || balanceRes.value;
            if (typeof balStr === "string") {
              const match = balStr.match(/(\d+(?:\.\d+)?)/);
              if (match) {
                balanceAmount = parseInt(match[1], 10);
              }
            } else if (typeof balStr === "number") {
              balanceAmount = balStr;
            } else if (balanceRes.value.amount !== undefined) {
              balanceAmount = balanceRes.value.amount;
            }
          }
          setAccount({
            name: user.name,
            accountNumber: user.accountNumber,
            amount: balanceAmount,
            role: user.role,
          });
        } catch (e) {
          setError(e.message || "Failed to load dashboard");
          setAccount({
            name: user.name,
            accountNumber: user.accountNumber,
            amount: 0,
            role: user.role,
          });
        } finally {
          setLoading(false);
        }
      };
      loadDashboard();
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-pale-bg">
        <DashboardHeader user={user} />
        <BalanceCard account={account} />
        <QuickActions />
        <PromoCard />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-pale-bg pb-20">
      <DashboardHeader user={user} />
      <BalanceCard account={account} />
      <QuickActions />
      <PromoCard />
      <RecentTransactions
        transactions={transactions}
        loading={loading}
        error={error}
        onRetry={loadDashboard}
      />
    </div>
  );
}
