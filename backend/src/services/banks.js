"use strict";

/**
 * Bank catalog.
 *
 * BBT Cash Bank is the only bank whose accounts live in this application's
 * database, so it is the only bank that can be validated and transferred to
 * internally. Every other entry is an external bank: it is listed so the
 * transfer form can offer a realistic, maintainable catalog, but no live
 * payment/bank-transfer provider has been configured. External entries are
 * therefore flagged with `providerConfigured: false` and the application must
 * never report an external transfer as successful until a real provider is
 * integrated.
 */

// BBT Cash account numbers are generated and stored by this application. The
// length here must match the persisted account-number format (controllers/auth
// generates exactly this many digits); changing one without the other would
// make internal transfers unusable.
const BBT_ACCOUNT_NUMBER_LENGTH = 10;

// The catalog. `internal: true` means the account can be resolved in this
// database. External banks use an 11-digit account-number format and require a
// provider integration before transfers can be executed.
const BANKS = [
  {
    id: "bbt-cash",
    name: "BBT Cash Bank",
    internal: true,
    providerConfigured: true,
    accountNumberLength: BBT_ACCOUNT_NUMBER_LENGTH,
  },
  {
    id: "gtbank",
    name: "Guaranty Trust Bank",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
  {
    id: "zenith",
    name: "Zenith Bank",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
  {
    id: "access",
    name: "Access Bank",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
  {
    id: "firstbank",
    name: "First Bank of Nigeria",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
  {
    id: "uba",
    name: "United Bank for Africa",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
  {
    id: "opay",
    name: "OPay",
    internal: false,
    providerConfigured: false,
    accountNumberLength: 11,
  },
];

const DEFAULT_BANK_ID = "bbt-cash";

function getBank(id) {
  const value = String(id || "").toLowerCase();
  return BANKS.find((bank) => bank.id === value) || null;
}

function getDefaultBank() {
  return getBank(DEFAULT_BANK_ID);
}

// Public projection safe to return to the client. Deliberately excludes any
// internal-only detail beyond what the form needs to render.
function listBanks() {
  return BANKS.map((bank) => ({
    id: bank.id,
    name: bank.name,
    internal: bank.internal,
    providerConfigured: bank.providerConfigured,
    accountNumberLength: bank.accountNumberLength,
  }));
}

function isInternalBank(bank) {
  return Boolean(bank && bank.internal);
}

function normalizeAccountNumber(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s|-/g, "");
}

function invalidAccountMessage(bank) {
  if (isInternalBank(bank)) {
    return `Invalid account number. Please enter a valid ${bank.accountNumberLength}-digit BBT Cash Bank account number.`;
  }
  return `Invalid account number. Please enter an ${bank.accountNumberLength}-digit account number.`;
}

// Format-only validation. A valid result means the value matches the bank's
// account-number shape; it never proves the account exists.
function validateAccountFormat(bank, accountNumber) {
  if (!bank) {
    return {
      valid: false,
      code: "unknown_bank",
      message: "Please select a valid bank.",
    };
  }

  const normalized = normalizeAccountNumber(accountNumber);

  if (
    !/^\d+$/.test(normalized) ||
    normalized.length !== bank.accountNumberLength
  ) {
    return {
      valid: false,
      code: "invalid_account_number",
      message: invalidAccountMessage(bank),
    };
  }

  return { valid: true, accountNumber: normalized };
}

module.exports = {
  DEFAULT_BANK_ID,
  getBank,
  getDefaultBank,
  listBanks,
  isInternalBank,
  normalizeAccountNumber,
  validateAccountFormat,
  invalidAccountMessage,
};
