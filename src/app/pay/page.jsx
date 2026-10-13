"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  NotebookTabs,
  Phone,
  Wifi,
  Tv,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const SERVICES = [
  {
    href: "/bills",
    title: "Pay Bills",
    description: "Electricity, water and other utilities",
    icon: NotebookTabs,
  },
  {
    href: "/airtime",
    title: "Buy Airtime",
    description: "Top up any supported network",
    icon: Phone,
  },
  {
    href: "/data",
    title: "Buy Data",
    description: "Data bundles for all networks",
    icon: Wifi,
  },
  {
    href: "/tv",
    title: "TV Subscription",
    description: "DStv, GOtv and StarTimes",
    icon: Tv,
  },
];

export default function PayPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">Pay</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pay bills and buy airtime or data instantly.
        </p>
      </div>

      <div className="space-y-3 px-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <Link
              key={service.href}
              href={service.href}
              className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 transition-colors hover:bg-pale-bg"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-light-blue text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-primary">
                  {service.title}
                </span>
                <span className="mt-0.5 block text-xs text-text-secondary">
                  {service.description}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-text-secondary" />
            </Link>
          );
        })}
      </div>

      <div className="mt-6 px-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-xs text-text-secondary">
            Payments are secured with your 4-digit transaction PIN. Purchases
            currently run against a clearly-labelled simulation catalog until a
            live biller/telecom provider is configured.
          </p>
        </div>
      </div>
    </div>
  );
}
