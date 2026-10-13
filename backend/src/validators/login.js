const { z } = require('zod');

const loginValidation = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

module.exports = loginValidation;