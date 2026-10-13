"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import LoadingSkeleton from "./LoadingSkeleton";

export default function BalanceCard({ account }) {
  const [isVisible, setIsVisible] = useState(true);

  if (!account) {
    return <LoadingSkeleton className="px-4" />;
  }

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const maskAccount = (accountNum) => {
    if (!accountNum) return "**** ****";
    const str = String(accountNum);
    if (str.length <= 4) return str;
    return `**** ${str.slice(-4)}`;
  };

  const formatBalance = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="px-4 mt-4">
      <div className="bg-gradient-to-br from-primary to-primary-deep rounded-2xl p-5 shadow-xl text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm opacity-90">Total Balance</p>
            <h1 className="text-2xl font-bold mt-1">
              {isVisible ? formatBalance(account.amount) : "₦ ****.**"}
            </h1>
          </div>
          <button
            onClick={toggleVisibility}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label={isVisible ? "Hide balance" : "Show balance"}
          >
            {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-white/20">
          <div>
            <p className="text-xs opacity-75">Account Number</p>
            <p className="text-sm font-medium mt-1">{maskAccount(account.accountNumber)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-75">Account Type</p>
            <p className="text-sm font-medium mt-1 capitalize">{account.role || "User"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
