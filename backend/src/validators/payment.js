const { z } = require("zod");

const reference = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,64}$/, "Invalid transaction reference")
  .optional();

const pin = z.string().optional();

const billValidateValidation = z.object({
  category: z.string().trim().min(1, "Bill category is required"),
  provider: z.string().trim().min(1, "Bill provider is required"),
  customerRef: z
    .string()
    .trim()
    .min(4, "Customer reference is too short")
    .max(30, "Customer reference is too long"),
});

const billPayValidation = z.object({
  category: z.string().trim().min(1, "Bill category is required"),
  provider: z.string().trim().min(1, "Bill provider is required"),
  customerRef: z
    .string()
    .trim()
    .min(4, "Customer reference is too short")
    .max(30, "Customer reference is too long"),
  planId: z.string().trim().min(1).optional(),
  amount: z.union([z.string().trim(), z.number()]).optional(),
  pin,
  reference,
});

const dataPurchaseValidation = z.object({
  network: z.string().trim().min(1, "Network is required"),
  planId: z.string().trim().min(1, "Data plan is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  pin,
  reference,
});

const airtimePurchaseValidation = z.object({
  network: z.string().trim().min(1, "Network is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  amount: z.union([z.string().trim(), z.number()]),
  pin,
  reference,
});

module.exports = {
  billValidateValidation,
  billPayValidation,
  dataPurchaseValidation,
  airtimePurchaseValidation,
};
