"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  History,
  Ellipsis,
  Plus,
  ReceiptText,
  FileText,
} from "lucide-react";
import { useState } from "react";
import ActionSheet from "./ActionSheet";

const navItems = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/transactions", label: "Transactions", icon: History },
  { href: "#", label: "Actions", icon: Plus, isCenter: true },
  { href: "/bills", label: "Bills", icon: ReceiptText },
  { href: "/more", label: "More", icon: Ellipsis },
];

// Full-screen auth pages render their own chrome and must not show the
// fixed bottom application navigation.
const AUTH_PAGES = ["/register", "/login", "/verify-email"];

export default function Navbar() {
  const pathname = usePathname();
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  if (AUTH_PAGES.includes(pathname)) {
    return null;
  }

  const handleCenterClick = (e) => {
    e.preventDefault();
    setIsActionSheetOpen(true);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border px-4 pb-safe pt-2 sm:max-w-md sm:mx-auto">
        <div className="flex items-center justify-between">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            if (item.isCenter) {
              return (
                <button
                  key={item.label}
                  onClick={handleCenterClick}
                  className="flex flex-col items-center gap-1 text-text-secondary hover:text-primary transition-colors -mt-4"
                  aria-label={item.label}
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary-deep rounded-full flex items-center justify-center shadow-lg">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs mt-1">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <ActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
      />
    </>
  );
}
