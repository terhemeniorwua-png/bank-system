const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const hashedPwd = require("../hash");
const db = require("../../models");

require("dotenv").config();

// Account number generator (preserves the original 10-digit style value).
const accountNum = () => {
  const num = Math.floor(1000000000 + Math.random() * 9999999999);
  return String(num);
};

// User Registration
const userFinalReg = async (req, res) => {
  if (req.body.role !== "admin" && req.body.role !== "user") {
    return res.status(409).json({
      status: "error",
      message: "Invalid role",
    });
  }

  const existing = await db.User.findOne({
    where: { email: req.body.email },
  });

  if (existing) {
    return res.status(409).json({
      status: "error",
      message: "Email already exist",
    });
  }

  const hashedPassword = await hashedPwd(req.body.password);

  const newUser = await db.User.create({
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    pin: req.body.pin,
    role: req.body.role,
    password: hashedPassword,
    accountNumber: accountNum(),
    amount: 0,
  });

  console.log(
    `User ${newUser.name}, your account has been successfully create`
  );

  return res.status(200).json({
    status: "Success",
    message: "Account created successfully",
  });
};

// User Login
const login = async (req, res) => {
  const { email, password } = req.body;

  const getUser = await db.User.findOne({
    where: { email: String(email).trim() },
  });

  if (!getUser) {
    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  // Password comparison
  const isPasswordCorrect = await bcrypt.compare(password, getUser.password);

  // Password is wrong
  if (!isPasswordCorrect) {
    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Token is not configured",
    });
  }

  // Token generator
  const token = jwt.sign(
    {
      id: getUser.id,
      name: getUser.name,
      email: getUser.email,
      role: getUser.role,
      pin: getUser.pin,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRING_TIME,
    }
  );

  return res.status(200).json({
    status: "success",
    message: "Login successful",
    details: {
      id: getUser.id,
      name: getUser.name,
      accountNum: getUser.accountNumber,
      role: getUser.role,
      token,
    },
  });
};

module.exports = {
  userFinalReg,
  login,
};
