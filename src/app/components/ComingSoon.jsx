"use client";

import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

export default function ComingSoon({ title = "Feature Coming Soon", description = "This feature requires backend support and will be available soon." }) {
  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="px-4 pt-6 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      </div>
      <div className="px-4">
        <div className="bg-white rounded-2xl border border-border p-6 text-center">
          <TriangleAlert className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">Coming Soon</h2>
          <p className="text-sm text-text-secondary mb-4">{description}</p>
          <p className="text-xs text-text-secondary/70">This is a local simulated/demo flow placeholder - backend endpoints are not available.</p>
        </div>
      </div>
    </div>
  );
}
