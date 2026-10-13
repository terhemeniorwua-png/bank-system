"use client";

import Link from "next/link";
import { User } from "lucide-react";
import NotificationBell from "./NotificationBell";

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
          <NotificationBell />
          <Link href="/profile" className="p-2 hover:bg-white rounded-full transition-colors">
            <User className="w-5 h-5 text-text-secondary" />
          </Link>
        </div>
      </div>
    </header>
  );
}
