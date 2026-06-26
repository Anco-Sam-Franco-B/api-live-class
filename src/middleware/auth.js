const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const AppError = require("../utils/AppError");
const env = require("../config/env");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Access denied. No token provided.", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const result = await pool.query(
      "SELECT u.*, r.name as role_name, r.slug as role_slug FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1 AND u.is_active = true",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new AppError("User not found or deactivated", 401);
    }

    const user = result.rows[0];
    if (user.is_locked && user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError("Account is locked. Try again later.", 423);
    }

    req.user = user;
    req.userId = user.id;
    req.userRole = user.role_slug;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new AppError("Invalid or expired token", 401));
    }
    next(error);
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }
    if (!allowedRoles.includes(req.user.role_slug)) {
      return next(new AppError("Insufficient permissions", 403));
    }
    next();
  };
};

const requirePermission = (...permissionSlugs) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError("Authentication required", 401));
      }

      const result = await pool.query(
        `SELECT p.slug FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = $1 AND p.slug = ANY($2)`,
        [req.user.role_id, permissionSlugs]
      );

      const hasPermission = result.rows.length > 0;
      if (!hasPermission) {
        return next(new AppError("Insufficient permissions", 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authenticate, authorize, requirePermission };
