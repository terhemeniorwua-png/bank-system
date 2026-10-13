const { z } = require("zod");

const verifyEmailValidation = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Verification code must be exactly six digits"),
});

const resendVerificationValidation = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});

module.exports = {
  verifyEmailValidation,
  resendVerificationValidation,
};