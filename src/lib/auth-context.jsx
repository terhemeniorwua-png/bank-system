"use client";

import { createContext, useContext, useState, useEffect } from "react";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("bbt_token="))
      ?.split("=")[1];

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const userData = {
          id: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          accountNumber: payload.accountNum || payload.accountNumber,
          pin: payload.pin,
        };
        setUser(userData);
      } catch {
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    if (token) {
      document.cookie = `bbt_token=${token}; path=/; max-age=86400; SameSite=Strict`;
    }
    setUser(userData);
  };

  const logout = () => {
    document.cookie = "bbt_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
