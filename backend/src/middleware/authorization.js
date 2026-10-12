const jwt = require("jsonwebtoken");

const userAuthorization = (req, res, next) => {
  // 1. Safely extract authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 2. Decode and verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Extract incoming pin from request body
    const { pin, role } = req.body;

    if (!pin) {
      return res.status(400).json({ message: "PIN is required in request body." });
    }

    if(decoded.role !== 'user'){
      return res.status(400).json({ message: "Access denied, only user." });
    }

    // 4. Compare incoming PIN with the PIN encoded in the decoded token
    if (String(pin) !== String(decoded.pin)) {
      return res.status(400).json({ message: "Invalid PIN." });
    }

    // Attach decoded token data to request object for downstream handlers
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};




// admin auth


const adminAuthorization = (req, res, next) => {
  // 1. Safely extract authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 2. Decode and verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Extract incoming pin from request body
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ message: "PIN is required in request body." });
    }

    if(decoded.role !== 'admin'){
      return res.status(400).json({ message: "Access denied, only Admin." });
    }

    // 4. Compare incoming PIN with the PIN encoded in the decoded token
    if (String(pin) !== String(decoded.pin)) {
      return res.status(400).json({ message: "Invalid PIN." });
    }

    // Attach decoded token data to request object for downstream handlers
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = { 
  userAuthorization,
  adminAuthorization
 };