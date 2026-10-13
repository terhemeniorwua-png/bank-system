"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Banknote,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  KeyRound,
  BellOff,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { formatNaira, formatDateTime } from "@/lib/utils";
import { ListSkeleton } from "@/app/components/LoadingSkeleton";
import EmptyState from "@/app/components/EmptyState";
import ErrorState from "@/app/components/ErrorState";

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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "credit", label: "Credit" },
  { key: "debit", label: "Debit" },
  { key: "deposit", label: "Deposit" },
  { key: "failed", label: "Failed" },
  { key: "security", label: "Security" },
];

function NotificationItem({ notification, onRead }) {
  const { Icon, className } = ICONS[notification.type] || ICONS.debit;

  return (
    <button
      type="button"
      onClick={() => onRead(notification)}
      className={`w-full text-left flex items-start gap-3 p-4 transition-colors ${
        notification.isRead ? "bg-white" : "bg-light-blue/30"
      } hover:bg-pale-bg`}
    >
      <span
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${className}`}
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {notification.title}
          </span>
          {!notification.isRead && (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          )}
        </span>
        <span className="mt-0.5 block text-sm text-text-secondary">
          {notification.message}
        </span>
        <span className="mt-1 flex items-center gap-2">
          {notification.amount !== null &&
            notification.amount !== undefined && (
              <span className="text-sm font-medium text-text-primary">
                {formatNaira(notification.amount)}
              </span>
            )}
          <span className="text-xs text-text-secondary">
            {formatDateTime(notification.createdAt)}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(
    async (targetPage, activeFilter, replace) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const res = await api.getNotifications({
          page: targetPage,
          filter: activeFilter,
        });
        setPagination(res?.pagination || null);
        setNotifications((prev) =>
          replace ? res?.notifications || [] : [...prev, ...(res?.notifications || [])]
        );
        setPage(targetPage);
      } catch (err) {
        setError(err.message || "Could not load notifications");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) load(1, filter, true);
  }, [user, authLoading, filter, router, load]);

  const handleMarkRead = async (notification) => {
    if (notification.isRead) return;

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item
      )
    );

    try {
      await api.markNotificationRead(notification.id);
    } catch {
      // Best effort; the next load re-syncs the state.
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, isRead: true }))
      );
    } catch (err) {
      setError(err.message || "Could not mark notifications as read");
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-full hover:bg-pale-bg transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-text-primary" />
            </Link>
            <h1 className="text-lg font-semibold text-text-primary">
              Notifications
            </h1>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary disabled:opacity-60"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === item.key
                  ? "bg-primary text-white"
                  : "bg-pale-bg text-text-secondary hover:bg-light-blue"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading && <ListSkeleton />}
        {!loading && error && (
          <ErrorState message={error} onRetry={() => load(1, filter, true)} />
        )}
        {!loading && !error && notifications.length === 0 && (
          <div className="bg-white rounded-2xl border border-border p-6">
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pale-bg">
                <BellOff className="w-6 h-6 text-text-secondary" />
              </span>
              <EmptyState
                title="No notifications"
                description="Activity on your account will appear here."
              />
            </div>
          </div>
        )}
        {!loading && !error && notifications.length > 0 && (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={handleMarkRead}
                  />
                ))}
              </div>
            </div>

            {pagination?.hasMore && (
              <button
                type="button"
                onClick={() => load(page + 1, filter, false)}
                disabled={loadingMore}
                className="mt-4 w-full rounded-xl border border-border bg-white py-3 text-sm font-medium text-primary hover:bg-pale-bg disabled:opacity-60"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
