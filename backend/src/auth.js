const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "travelfix-dev-secret-change-me";
const GUEST_HEADER = "x-guest-token";

function signToken(profile) {
  return jwt.sign(
    { sub: profile.id, email: profile.email, role: profile.role },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Attaches req.profile (from Bearer JWT) and req.guestToken (from header) when present.
// Never throws for missing/invalid auth: public guest routes must still work.
function authOptional(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.profile = token ? verifyToken(token) : null;
  req.guestToken = req.headers[GUEST_HEADER] || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.profile) {
    return res.status(401).json({ error: "Sign in required" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.profile || req.profile.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
}

module.exports = { signToken, verifyToken, authOptional, requireAuth, requireAdmin, GUEST_HEADER };
