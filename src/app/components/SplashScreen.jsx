"use client";

import { Wallet } from "lucide-react";

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-light-blue">
      <div className="bbt-splash-logo flex flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep shadow-lg shadow-primary/30">
          <Wallet className="h-10 w-10 text-white" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-primary-deep">
          BBT Cash
        </h1>
      </div>

      <p className="bbt-splash-tagline mt-2 text-sm font-medium text-text-secondary">
        Mobile Banking
      </p>

      <div className="bbt-splash-tagline absolute bottom-12 flex items-center gap-1.5">
        <span className="sr-only">Loading</span>
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </div>
    </div>
  );
}
