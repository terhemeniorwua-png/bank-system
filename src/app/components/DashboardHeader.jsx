"use client";

import Link from "next/link";
import { Bell, User, ChevronDown } from "lucide-react";

export default function DashboardHeader({ user }) {
  return (
    <header className="px-4 pt-6 pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-deep rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {user?.name ? user.name.charAt(0).toUpperCase() : "B"}
            </span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary">BBT Cash</h1>
            <p className="text-xs text-text-secondary">Welcome back</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-white rounded-full transition-colors relative" aria-label="Notifications">
            <Bell className="w-5 h-5 text-text-secondary" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
          </button>
          <Link href="/profile" className="p-2 hover:bg-white rounded-full transition-colors">
            <User className="w-5 h-5 text-text-secondary" />
          </Link>
        </div>
      </div>
    </header>
  );
}
