const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5100";

function extractCookie(name) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const defaultHeaders = {};

  // Attach token from cookie if present
  if (typeof document !== "undefined") {
    const token = extractCookie("bbt_token");
    if (token) {
      defaultHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const opts = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...defaultHeaders,
      ...options.headers,
    },
    ...options,
  };

  if (opts.body && typeof opts.body === "object") {
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = new Error(data?.message || data?.error || "Request failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  signup: (body) => request("/user/signup", { method: "POST", body }),
  verifyEmail: (body) => request("/user/verify-email", { method: "POST", body }),
  resendVerification: (body) =>
    request("/user/resend-verification", { method: "POST", body }),
  login: (body) => request("/user/login", { method: "POST", body }),
  me: () => request("/user/me", { method: "GET" }),
  // Session-authenticated balance (no PIN required once logged in).
  getBalance: () => request("/user/account/balance", { method: "GET" }),
  deposit: (body) => request("/user/deposit", { method: "PUT", body }),
  getBanks: () => request("/user/banks", { method: "GET" }),
  validateTransferAccount: (body) =>
    request("/user/transfer/validate-account", { method: "POST", body }),
  transfer: (body) => request("/user/transfer", { method: "POST", body }),
  transactions: () => request("/user/transactions", { method: "GET" }),
  createPin: (body) => request("/user/createPin", { method: "POST", body }),
  changePin: (body) => request("/user/change-pin", { method: "PATCH", body }),

  // Payments — catalogs and histories.
  getNetworks: () => request("/user/data/networks", { method: "GET" }),
  getDataPlans: (network) =>
    request(`/user/data/plans?network=${encodeURIComponent(network)}`, {
      method: "GET",
    }),
  getBillCategories: () =>
    request("/user/bills/categories", { method: "GET" }),
  getBillProviders: (category) =>
    request(`/user/bills/providers?category=${encodeURIComponent(category)}`, {
      method: "GET",
    }),
  validateBillCustomer: (body) =>
    request("/user/bills/validate", { method: "POST", body }),

  // Payments — purchases and histories.
  purchaseAirtime: (body) =>
    request("/user/airtime/purchase", { method: "POST", body }),
  getAirtimeHistory: () => request("/user/airtime/history", { method: "GET" }),
  purchaseData: (body) =>
    request("/user/data/purchase", { method: "POST", body }),
  getDataHistory: () => request("/user/data/history", { method: "GET" }),
  payBill: (body) => request("/user/bills/pay", { method: "POST", body }),
  getBillHistory: () => request("/user/bills/history", { method: "GET" }),

  getNotifications: ({ page = 1, limit = 20, filter = "all" } = {}) =>
    request(
      `/user/notifications?page=${page}&limit=${limit}&filter=${encodeURIComponent(
        filter
      )}`,
      { method: "GET" }
    ),
  getUnreadCount: () =>
    request("/user/notifications/unread-count", { method: "GET" }),
  markNotificationRead: (id) =>
    request(`/user/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request("/user/notifications/read-all", { method: "PATCH" }),

  adminDeposit: (accountNumber, body) =>
    request(`/user/adminDeposit/${accountNumber}`, { method: "POST", body }),
};

export default api;
