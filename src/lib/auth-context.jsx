"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import api, { SESSION_EXPIRED_EVENT } from "./api";

const AuthContext = createContext(null);

const TOKEN_COOKIE = "bbt_token";

// setTimeout overflows beyond 2^31 - 1 ms (~24.8 days); clamp long expiries so
// the timer always fires and the session is re-evaluated afterwards.
const MAX_TIMEOUT = 2147483647;

function readToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_COOKIE}=`));
  if (!match) return null;
  return match.slice(TOKEN_COOKIE.length + 1);
}

function clearToken() {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// Decodes a JWT payload without verifying the signature (the backend is the
// source of truth for validity). Handles base64url and missing padding.
function decodeToken(token) {
  try {
    const base64 = token
      .split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isExpired(payload) {
  return typeof payload?.exp === "number" && payload.exp * 1000 <= Date.now();
}

function userFromPayload(payload) {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    accountNumber: payload.accountNum || payload.accountNumber,
    pin: payload.pin,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const expiryTimerRef = useRef(null);

  const logout = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    clearToken();
    setUser(null);
  }, []);

  // Ends the local session exactly when the token expires, so an idle tab is
  // logged out instead of silently holding an expired session.
  const scheduleExpiry = useCallback(
    (payload) => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }

      if (!payload || typeof payload.exp !== "number") return;

      const msLeft = payload.exp * 1000 - Date.now();

      if (msLeft <= 0) {
        logout();
        return;
      }

      expiryTimerRef.current = setTimeout(logout, Math.min(msLeft, MAX_TIMEOUT));
    },
    [logout]
  );

  useEffect(() => {
    const token = readToken();

    if (token) {
      const payload = decodeToken(token);

      if (payload && !isExpired(payload)) {
        setUser(userFromPayload(payload));
        scheduleExpiry(payload);
      } else {
        // Already expired or unreadable: require a fresh login.
        clearToken();
        setUser(null);
      }
    }

    setLoading(false);

    // A 401 from the API client also ends the session (for example the token
    // expired while the tab was idle, or was rejected by the backend).
    const onSessionExpired = () => logout();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [logout, scheduleExpiry]);

  const login = (userData, token) => {
    if (token) {
      const payload = decodeToken(token);
      // Keep the cookie lifetime in step with the token so the browser also
      // drops it once the token expires (falls back to a day if no exp).
      const maxAge =
        payload && typeof payload.exp === "number"
          ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
          : 86400;

      document.cookie = `${TOKEN_COOKIE}=${token}; path=/; max-age=${maxAge}; SameSite=Strict`;
      scheduleExpiry(payload);
    }
    setUser(userData);
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
