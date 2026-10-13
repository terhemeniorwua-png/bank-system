"use client";

import {
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Building2,
  Phone,
  Wifi,
  Tv,
  ReceiptText,
  NotebookTabs,
  Banknote,
  Wallet,
  CircleCheck,
  Clock,
  CircleX,
  Zap,
  Droplets,
  Globe,
} from "lucide-react";

const typeIconMap = {
  deposit: ArrowDownLeft,
  transfer: ArrowLeftRight,
  admin_deposit: Banknote,
  pay: CreditCard,
  bill: ReceiptText,
  airtime: Phone,
  data: Wifi,
  tv: Tv,
  withdraw: ArrowUpRight,
};

function getIcon(type) {
  if (!type) return Wallet;
  const key = String(type).toLowerCase();
  return typeIconMap[key] || Wallet;
}

function getStatusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful" || s === "completed") return "text-success";
  if (s === "failed" || s === "error" || s === "declined") return "text-error";
  if (s === "pending" || s === "processing") return "text-text-secondary";
  return "text-text-secondary";
}

function formatAmount(amount, isOutgoing = false) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return "₦0.00";
  const abs = Math.abs(num);
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (isOutgoing) return `- ${formatted}`;
  return formatted;
}

function getStatusIcon(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful" || s === "completed") return CircleCheck;
  if (s === "failed" || s === "error" || s === "declined") return CircleX;
  if (s === "pending" || s === "processing") return Clock;
  return CircleCheck;
}

export default function TransactionItem({ transaction, currentAccountNumber }) {
  const Icon = getIcon(transaction?.type);
  const StatusIcon = getStatusIcon(transaction?.status);
  const isOutgoing =
    transaction?.senderAccountNumber === currentAccountNumber ||
    transaction?.type === "withdraw" ||
    (transaction?.type === "transfer" && transaction?.senderAccountNumber === currentAccountNumber);

  const isIncoming = !isOutgoing && (transaction?.receiverAccountNumber === currentAccountNumber || transaction?.type === "deposit" || transaction?.type === "admin_deposit");

  const description = transaction?.description || transaction?.type || "Transaction";

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-border hover:bg-pale-bg transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-light-blue rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary capitalize">{description}</span>
          <span className="text-xs text-text-secondary">
            {transaction?.createdAt ? new Date(transaction.createdAt).toLocaleString() : ""}
          </span>
          {transaction?.reference && (
            <span className="text-xs text-text-secondary/70">Ref: {transaction.reference}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`text-sm font-medium ${isIncoming ? "text-success" : "text-text-primary"}`}>
          {formatAmount(transaction?.amount, isOutgoing)}
        </span>
        <div className="flex items-center gap-1">
          <StatusIcon className={`w-3 h-3 ${getStatusColor(transaction?.status)}`} />
          <span className={`text-xs capitalize ${getStatusColor(transaction?.status)}`}>
            {transaction?.status || "success"}
          </span>
        </div>
      </div>
    </div>
  );
}
