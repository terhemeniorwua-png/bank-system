"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import SplashScreen from "./components/SplashScreen";

const SPLASH_DURATION_MS = 2200;

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [router]);

  return <SplashScreen />;
}
