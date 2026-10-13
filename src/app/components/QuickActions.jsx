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
  Grid2x2,
} from "lucide-react";

const actions = [
  { href: "/transfer", label: "Transfer", icon: ArrowLeftRight },
  { href: "/pay", label: "Pay", icon: ReceiptText },
  { href: "/bills", label: "Pay Bills", icon: NotebookTabs },
  { href: "/airtime", label: "Buy Airtime", icon: Phone },
  { href: "/data", label: "Buy Data", icon: Wifi },
  { href: "/tv", label: "TV Channels", icon: Tv },
  { href: "/transactions", label: "Transaction History", icon: History },
  { href: "/more", label: "More Services", icon: Grid2x2 },
];

export default function QuickActions() {
  return (
    <div className="px-4 mt-6">
      <h2 className="text-base font-semibold text-text-primary mb-3">Quick Actions</h2>
      <div className="grid grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 p-2 rounded-xl bg-light-blue hover:bg-primary/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center">
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
  );
}
