"use strict";

/**
 * Payment provider abstraction.
 *
 * IMPORTANT: No external payment/bill provider has been configured for this
 * project. This module therefore provides a clearly identified SIMULATED
 * provider backed by a local catalog. It is NOT a live provider integration
 * and must never be presented to users as a real purchase.
 *
 * The shapes here (catalog lookups + an async `executePayment`) mirror what a
 * real aggregator integration would expose, so a real provider can be dropped
 * in later without changing the controller or the routes. All prices and
 * identifiers come from this server-side catalog; a client-supplied price is
 * never trusted.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Networks (Nigerian mobile networks supported by the simulation).
// ---------------------------------------------------------------------------
const NETWORKS = [
  { id: "mtn", name: "MTN", airtimeMin: 50, airtimeMax: 50000 },
  { id: "airtel", name: "Airtel", min: 50, max: 50000 },
  { id: "glo", name: "Glo", min: 50, max: 50000 },
  { id: "9mobile", name: "9mobile", min: 50, max: 50000 },
];

// Normalise the two shapes above into a consistent { min, max } pair.
const NETWORKS_NORMALISED = NETWORKS.map((n) => ({
  id: n.id,
  name: n.name,
  min: n.id === "mtn" ? n.airtimeMin : n.min,
  max: n.id === "mtn" ? n.airtimeMax : n.max,
}));

const getNetworks = () => NETWORKS_NORMALISED.map((n) => ({ ...n }));

const getNetwork = (id) =>
  NETWORKS_NORMALISED.find((n) => n.id === String(id || "").toLowerCase()) ||
  null;

// ---------------------------------------------------------------------------
// Data plans. Prices are integer NGN. Identifiers are stable plan ids so the
// client sends a plan id and the server resolves the price from here.
// ---------------------------------------------------------------------------
const DATA_PLANS = {
  mtn: [
    { id: "mtn-1gb-1d", name: "1GB Daily", allowance: "1GB", validity: "1 day", price: 350 },
    { id: "mtn-2gb-3d", name: "2GB 3-Day", allowance: "2GB", validity: "3 days", price: 750 },
    { id: "mtn-5gb-7d", name: "5GB Weekly", allowance: "5GB", validity: "7 days", price: 1500 },
    { id: "mtn-10gb-30d", name: "10GB Monthly", allowance: "10GB", validity: "30 days", price: 3000 },
  ],
  airtel: [
    { id: "airtel-1gb-1d", name: "1GB Daily", allowance: "1GB", validity: "1 day", price: 350 },
    { id: "airtel-2gb-2d", name: "2GB 2-Day", allowance: "2GB", validity: "2 days", price: 600 },
    { id: "airtel-5gb-7d", name: "5GB Weekly", allowance: "5GB", validity: "7 days", price: 1500 },
    { id: "airtel-20gb-30d", name: "20GB Monthly", allowance: "20GB", validity: "30 days", price: 5000 },
  ],
  glo: [
    { id: "glo-1gb-1d", name: "1GB Daily", allowance: "1GB", validity: "1 day", price: 300 },
    { id: "glo-3gb-7d", name: "3GB Weekly", allowance: "3GB", validity: "7 days", price: 1000 },
    { id: "glo-10gb-30d", name: "10GB Monthly", allowance: "10GB", validity: "30 days", price: 2500 },
  ],
  "9mobile": [
    { id: "9mobile-1gb-1d", name: "1GB Daily", allowance: "1GB", validity: "1 day", price: 300 },
    { id: "9mobile-5gb-7d", name: "5GB Weekly", allowance: "5GB", validity: "7 days", price: 1400 },
    { id: "9mobile-15gb-30d", name: "15GB Monthly", allowance: "15GB", validity: "30 days", price: 4000 },
  ],
};

const getDataPlans = (networkId) => {
  const network = String(networkId || "").toLowerCase();
  const plans = DATA_PLANS[network];
  if (!plans) return null;
  return plans.map((p) => ({ ...p, network }));
};

const getDataPlan = (networkId, planId) => {
  const plans = DATA_PLANS[String(networkId || "").toLowerCase()];
  if (!plans) return null;
  return plans.find((p) => p.id === planId) || null;
};

// ---------------------------------------------------------------------------
// Bill catalog. A provider is either plan based (fixed price, e.g. cable TV)
// or variable-amount (the customer supplies the amount, e.g. electricity).
// ---------------------------------------------------------------------------
const BILL_CATEGORIES = [
  {
    id: "electricity",
    name: "Electricity",
    description: "Pay prepaid and postpaid electricity bills.",
    providers: [
      { id: "ikedc", name: "Ikeja Electric (IKEDC)", customerLabel: "Meter Number", amountMode: "variable", min: 500, max: 200000 },
      { id: "ekedc", name: "Eko Electricity (EKEDC)", customerLabel: "Meter Number", amountMode: "variable", min: 500, max: 200000 },
      { id: "aedc", name: "Abuja Electricity (AEDC)", customerLabel: "Meter Number", amountMode: "variable", min: 500, max: 200000 },
      { id: "kedco", name: "Kano Electricity (KEDCO)", customerLabel: "Meter Number", amountMode: "variable", min: 500, max: 200000 },
    ],
  },
  {
    id: "cable-tv",
    name: "Television",
    description: "Subscribe or renew your TV subscription.",
    providers: [
      {
        id: "dstv",
        name: "DStv",
        customerLabel: "Smartcard / IUC Number",
        amountMode: "fixed",
        plans: [
          { id: "dstv-padi", name: "Padi", price: 4400, validity: "1 month" },
          { id: "dstv-yanga", name: "Yanga", price: 6000, validity: "1 month" },
          { id: "dstv-confam", name: "Confam", price: 11000, validity: "1 month" },
          { id: "dstv-compact", name: "Compact", price: 19000, validity: "1 month" },
        ],
      },
      {
        id: "gotv",
        name: "GOtv",
        customerLabel: "IUC Number",
        amountMode: "fixed",
        plans: [
          { id: "gotv-smallie", name: "Smallie", price: 1900, validity: "1 month" },
          { id: "gotv-jinja", name: "Jinja", price: 3300, validity: "1 month" },
          { id: "gotv-jolli", name: "Jolli", price: 4800, validity: "1 month" },
        ],
      },
      {
        id: "startimes",
        name: "StarTimes",
        customerLabel: "Smartcard Number",
        amountMode: "fixed",
        plans: [
          { id: "startimes-nova", name: "Nova", price: 1900, validity: "1 month" },
          { id: "startimes-basic", name: "Basic", price: 3700, validity: "1 month" },
          { id: "startimes-smart", name: "Smart", price: 4900, validity: "1 month" },
        ],
      },
    ],
  },
  {
    id: "internet",
    name: "Internet",
    description: "Renew or top up your internet subscription.",
    providers: [
      {
        id: "smile",
        name: "Smile",
        customerLabel: "Customer ID / Phone",
        amountMode: "fixed",
        plans: [
          { id: "smile-7gb-30d", name: "7GB Monthly", price: 5000, validity: "30 days" },
          { id: "smile-15gb-30d", name: "15GB Monthly", price: 9000, validity: "30 days" },
        ],
      },
      {
        id: "spectranet",
        name: "Spectranet",
        customerLabel: "Customer ID / Phone",
        amountMode: "fixed",
        plans: [
          { id: "spectranet-12gb-30d", name: "12GB Monthly", price: 8000, validity: "30 days" },
          { id: "spectranet-25gb-30d", name: "25GB Monthly", price: 12000, validity: "30 days" },
        ],
      },
    ],
  },
  {
    id: "water",
    name: "Water",
    description: "Pay water utility bills.",
    providers: [
      { id: "lagos-water", name: "Lagos Water Corporation", customerLabel: "Account Number", amountMode: "variable", min: 500, max: 100000 },
      { id: "fct-water", name: "FCT Water Board", customerLabel: "Account Number", amountMode: "variable", min: 500, max: 100000 },
    ],
  },
];

const getBillCategories = () =>
  BILL_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));

const getBillCategory = (id) =>
  BILL_CATEGORIES.find((c) => c.id === String(id || "").toLowerCase()) || null;

const getBillProviders = (categoryId) => {
  const category = getBillCategory(categoryId);
  if (!category) return null;
  return category.providers.map((p) => ({
    id: p.id,
    name: p.name,
    customerLabel: p.customerLabel,
    amountMode: p.amountMode,
    ...(p.amountMode === "variable" ? { min: p.min, max: p.max } : {}),
    ...(p.plans ? { plans: p.plans.map((plan) => ({ ...plan })) } : {}),
  }));
};

const getBillProvider = (categoryId, providerId) => {
  const category = getBillCategory(categoryId);
  if (!category) return null;
  return category.providers.find((p) => p.id === providerId) || null;
};

// The catalog is a local simulation, never a live provider feed.
const mode = "simulation";

module.exports = {
  mode,
  // Networks / data
  getNetworks,
  getNetwork,
  getDataPlans,
  getDataPlan,
  // Bills
  getBillCategories,
  getBillCategory,
  getBillProviders,
  getBillProvider,
  // Provider execution (SIMULATED)
  executePayment,
  validateBillCustomer,
};

// ---------------------------------------------------------------------------
// SIMULATED provider calls.
//
// These functions do not contact any external service. They exist so the rest
// of the application can be written against a real provider interface and can
// be replaced by a genuine integration without changing callers.
//
// Documented simulation behaviour for tests/demos:
//   * recipient ending in "0000" -> provider declines the payment (failed)
//   * recipient ending in "9999" -> provider returns a pending result
//   * anything else              -> immediate simulated success
// ---------------------------------------------------------------------------

function simulatedProviderReference(kind) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SIM-${String(kind).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

async function executePayment({ kind, recipient }) {
  const value = String(recipient || "");

  if (/0000$/.test(value)) {
    return {
      status: "failed",
      reason: "provider_declined",
      providerReference: null,
      simulated: true,
    };
  }

  if (/9999$/.test(value)) {
    return {
      status: "pending",
      reason: "awaiting_provider_confirmation",
      providerReference: simulatedProviderReference(kind),
      simulated: true,
    };
  }

  return {
    status: "success",
    providerReference: simulatedProviderReference(kind),
    simulated: true,
  };
}

// Simulated customer/meter validation. Real providers verify the identifier
// against their systems; here any sufficiently long numeric/identifier is
// accepted except the documented invalid pattern.
async function validateBillCustomer({ customerRef }) {
  const value = String(customerRef || "").trim();

  if (!/^[A-Za-z0-9-]{4,30}$/.test(value)) {
    return { valid: false, reason: "invalid_identifier" };
  }

  if (/^0{4,}/.test(value)) {
    return { valid: false, reason: "customer_not_found" };
  }

  return {
    valid: true,
    customerName: "SIMULATED CUSTOMER",
    customerRef: value,
    simulated: true,
  };
}
