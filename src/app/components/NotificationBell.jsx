"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Banknote,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import api from "@/lib/api";
import { formatNaira } from "@/lib/utils";

const ICONS = {
  credit: { Icon: ArrowDownLeft, className: "text-success bg-success/10" },
  debit: { Icon: ArrowUpRight, className: "text-primary bg-light-blue" },
  deposit: { Icon: Wallet, className: "text-success bg-success/10" },
  withdrawal: { Icon: Banknote, className: "text-primary bg-light-blue" },
  failed: { Icon: AlertTriangle, className: "text-error bg-error/10" },
  reversal: { Icon: RotateCcw, className: "text-primary bg-light-blue" },
  pin_created: { Icon: KeyRound, className: "text-primary bg-light-blue" },
  pin_changed: { Icon: KeyRound, className: "text-primary bg-light-blue" },
  security_alert: { Icon: ShieldCheck, className: "text-error bg-error/10" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationRow({ notification, onRead }) {
  const { Icon, className } = ICONS[notification.type] || ICONS.debit;
  const hasAmount =
    notification.amount !== null && notification.amount !== undefined;

  return (
    <button
      type="button"
      onClick={() => onRead?.(notification)}
      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-pale-bg transition-colors"
    >
      <span
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${className}`}
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-text-primary">
            {notification.title}
          </span>
          <span className="shrink-0 text-[11px] text-text-secondary">
            {timeAgo(notification.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-secondary">
          {notification.message}
        </span>
        {notification.amount !== null && notification.amount !== undefined && (
          <span className="mt-1 block text-xs font-medium text-text-primary">
            {formatNaira(notification.amount)}
          </span>
        )}
      </span>
      {!notification.isRead && (
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Poll the unread count so the badge stays fresh without a page refresh.
  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await api.getUnreadCount();
        if (active) setCount(res?.unreadCount || 0);
      } catch {
        /* unauthenticated or transient: keep the previous value */
      }
    };

    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const res = await api.getNotifications({ page: 1, limit: 8 });
      setItems(res?.notifications || []);
    } catch {
      setItems([]);
    }
  }, []);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) return undefined;

    const onClick = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  };

  const markRead = async (notification) => {
    if (notification.isRead) return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item
      )
    );
    setCount((prev) => Math.max(0, prev - 1));

    try {
      await api.markNotificationRead(notification.id);
    } catch {
      // Re-synced by the next poll if the update failed.
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        className="relative p-2 hover:bg-white rounded-full transition-colors"
        aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5 text-text-secondary" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-text-primary">
              Notifications
            </span>
            {count > 0 && (
              <span className="rounded-full bg-light-blue px-2 py-0.5 text-[11px] font-medium text-primary">
                {count} unread
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="w-6 h-6 text-text-secondary" />
                <span className="text-sm text-text-secondary">
                  No notifications yet
                </span>
              </div>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <NotificationRow notification={item} onRead={markRead} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-3 text-center text-sm font-medium text-primary hover:bg-light-blue"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
