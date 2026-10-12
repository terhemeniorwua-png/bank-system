require("dotenv").config();
const bcypt = require("bcrypt")


const hashedPassword = (pass) => {
    const salt = Number(process.env.SALT_ROUNDS);
    const hashed =  bcypt.hash(pass, salt)
    return hashed
}

module.exports = hashedPassword;