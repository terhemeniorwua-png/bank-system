const { z, email } = require('zod');

const loginValidation = z.object({
    email: z.string().trim().email(),
    password: z.string().min(6, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/, "Invalid password")
});

module.exports = loginValidation;




