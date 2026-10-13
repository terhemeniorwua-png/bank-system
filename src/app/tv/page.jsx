"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// TV subscriptions are handled by the bill-payment flow, preselecting the
// cable-tv category.
export default function TvPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/bills?category=cable-tv");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-pale-bg">
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Opening TV subscriptions...
      </div>
    </div>
  );
}
