"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import NotificationBell from "./NotificationBell";
import api from "@/lib/api";

export default function DashboardHeader({ user }) {
  // The authenticated user's first name, derived from their profile. Falls back
  // to a generic greeting when the name is unavailable.
  const firstName = user?.name ? String(user.name).trim().split(/\s+/)[0] : "";
  const greeting = firstName ? `Welcome Back, ${firstName}!` : "Welcome Back!";

  // Profile picture lives on the backend profile, not in the JWT, so it is
  // fetched once here. Falls back to the letter avatar when absent.
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    (async () => {
      try {
        const res = await api.me();
        if (active) setAvatar(res?.user?.avatar || null);
      } catch {
        // Non-critical: the letter avatar is shown instead.
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <header className="px-4 pt-6 pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            aria-label="Open your profile"
            className="block h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-deep"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={user?.name ? `${user.name}'s profile picture` : "Profile picture"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-white font-semibold text-sm">
                {user?.name ? user.name.charAt(0).toUpperCase() : "B"}
              </span>
            )}
          </Link>
          <div>
            <h1 className="text-base font-semibold text-text-primary">BBT Cash</h1>
            <p className="text-xs text-text-secondary">{greeting}</p>
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
