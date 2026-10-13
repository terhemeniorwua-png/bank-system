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
      loadDashboard();
    }
  }, [user, authLoading]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes] = await Promise.allSettled([api.transactions()]);
      if (txRes.status === "fulfilled") {
        setTransactions(txRes.value?.transactions || []);
      }
      // Balance comes from backend; if needed we can fetch with PIN but the token holds account
      setAccount({
        name: user.name,
        accountNumber: user.accountNumber,
        amount: 0, // real balance will be shown after pin auth or fetch
        role: user.role,
      });
    } catch (e) {
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

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
