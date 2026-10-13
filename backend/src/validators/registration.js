const { z } = require("zod");

const registrationValidation = z.object({
    name: z.string().trim().min(2, "Name must be atleast 2 characters!"),
    email: z.string().trim().min(8, "Email must be atleast 8 characters!"),
    phone: z.string().trim().regex(/^(\+234|0)(70|80|81|90|91)\d{8}$/ , "Invalid phone number!"),
    password: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/, "Password must be atleast 6 characters, include a special character, a number, uppercase and lowercase letters"),
    // pin: z.string().regex(/^\d{4}$/, "Pin must be four digits"),
    // role: z.string().trim()
});

module.exports = { registrationValidation };