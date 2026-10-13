"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ReceiptText,
  Phone,
  Wifi,
  Tv,
  History,
  Wallet,
  NotebookTabs,
} from "lucide-react";

const actions = [
  { href: "/transfer", label: "Transfer", icon: ArrowLeftRight, color: "bg-light-blue" },
  { href: "/deposit", label: "Add Money", icon: Wallet, color: "bg-light-blue" },
  { href: "/pay", label: "Pay", icon: ReceiptText, color: "bg-light-blue" },
  { href: "/bills", label: "Pay Bills", icon: NotebookTabs, color: "bg-light-blue" },
  { href: "/airtime", label: "Buy Airtime", icon: Phone, color: "bg-light-blue" },
  { href: "/data", label: "Buy Data", icon: Wifi, color: "bg-light-blue" },
  { href: "/tv", label: "TV Channels", icon: Tv, color: "bg-light-blue" },
  { href: "/transactions", label: "Transaction History", icon: History, color: "bg-light-blue" },
];

export default function ActionSheet({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 sm:max-w-md sm:mx-auto shadow-2xl animate-in slide-in-from-bottom duration-300 pb-safe">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Quick Actions</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4 p-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={onClose}
                className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-pale-bg transition-colors"
              >
                <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs text-text-primary text-center leading-tight">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
