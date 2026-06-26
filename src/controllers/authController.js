const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { generateToken, generateCode, sanitizeUser } = require("../utils/helpers");
const { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendTwoFactorEmail } = require("../services/emailService");

const generateAccessToken = (userId, roleId) => {
  return jwt.sign({ userId, roleId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

const generateRefreshToken = (userId, rememberMe = false) => {
  const expiresIn = rememberMe ? env.JWT_REMEMBER_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn });
};

const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, phone, role } = req.body;

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      throw new AppError("Email already registered", 409);
    }

    let roleId = 4;
    if (role) {
      const roleResult = await pool.query("SELECT id FROM roles WHERE slug = $1", [role]);
      if (roleResult.rows.length > 0) roleId = roleResult.rows[0].id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateCode();
    const verificationToken = generateToken();

    const result = await pool.query(
      `INSERT INTO users (role_id, first_name, last_name, email, phone, password)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [roleId, firstName, lastName, email, phone, hashedPassword]
    );

    const user = result.rows[0];

    await pool.query(
      `INSERT INTO email_verifications (user_id, token, code, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [user.id, verificationToken, verificationCode]
    );

    const accessToken = generateAccessToken(user.id, user.role_id);
    const refreshToken = generateRefreshToken(user.id);

    await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken, req.ip, req.headers["user-agent"]]
    );

    sendWelcomeEmail(user).catch(console.error);
    sendVerificationEmail(user, verificationCode).catch(console.error);

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email.",
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    const result = await pool.query(
      "SELECT u.*, r.slug as role_slug, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO login_logs (email, ip_address, user_agent, status, failure_reason)
         VALUES ($1, $2, $3, 'failed', 'User not found')`,
        [email, req.ip, req.headers["user-agent"]]
      );
      throw new AppError("Invalid email or password", 401);
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new AppError("Account is deactivated", 401);
    }

    if (user.is_locked && user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError(`Account is locked until ${user.locked_until}`, 423);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await pool.query(
        `INSERT INTO login_logs (email, ip_address, user_agent, status, failure_reason)
         VALUES ($1, $2, $3, 'failed', 'Invalid password')`,
        [email, req.ip, req.headers["user-agent"]]
      );

      await pool.query(
        "UPDATE users SET login_attempts = login_attempts + 1 WHERE id = $1",
        [user.id]
      );

      if (user.login_attempts + 1 >= 5) {
        await pool.query(
          "UPDATE users SET is_locked = true, locked_until = NOW() + INTERVAL '30 minutes' WHERE id = $1",
          [user.id]
        );
        throw new AppError("Account locked due to too many failed attempts. Try again in 30 minutes.", 423);
      }

      throw new AppError("Invalid email or password", 401);
    }

    if (user.two_factor_enabled) {
      const otpCode = generateCode();
      await pool.query(
        `INSERT INTO two_factor_codes (user_id, code, type, expires_at)
         VALUES ($1, $2, 'email', NOW() + INTERVAL '10 minutes')`,
        [user.id, otpCode]
      );

      sendTwoFactorEmail(user, otpCode).catch(console.error);

      res.json({
        success: true,
        message: "Two-factor authentication required",
        data: { requiresTwoFactor: true, userId: user.id },
      });
      return;
    }

    await pool.query(
      `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status)
       VALUES ($1, $2, $3, $4, 'success')`,
      [user.id, email, req.ip, req.headers["user-agent"]]
    );

    await pool.query(
      "UPDATE users SET login_attempts = 0, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2",
      [req.ip, user.id]
    );

    const accessToken = generateAccessToken(user.id, user.role_id);
    const refreshToken = generateRefreshToken(user.id, rememberMe);
    const refreshExpires = rememberMe ? "30 days" : "7 days";

    await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day' * $5)`,
      [user.id, refreshToken, req.ip, req.headers["user-agent"], rememberMe ? 30 : 7]
    );

    res.json({
      success: true,
      message: "Login successful",
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.decode(token);
      if (decoded?.userId) {
        await pool.query(
          "DELETE FROM user_sessions WHERE user_id = $1 AND refresh_token IN (SELECT refresh_token FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)",
          [decoded.userId]
        );
      }
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw new AppError("Refresh token required", 400);

    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    const session = await pool.query(
      "SELECT * FROM user_sessions WHERE user_id = $1 AND refresh_token = $2 AND is_active = true AND expires_at > NOW()",
      [decoded.userId, token]
    );

    if (session.rows.length === 0) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const userResult = await pool.query(
      "SELECT u.*, r.slug as role_slug FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
      [decoded.userId]
    );
    if (userResult.rows.length === 0) throw new AppError("User not found", 404);

    const user = userResult.rows[0];
    const newAccessToken = generateAccessToken(user.id, user.role_id);

    res.json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new AppError("Invalid or expired refresh token", 401));
    }
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) throw new AppError("Email and code are required", 400);

    const verification = await pool.query(
      `SELECT ev.* FROM email_verifications ev
       JOIN users u ON ev.user_id = u.id
       WHERE u.email = $1 AND ev.code = $2 AND ev.used_at IS NULL AND ev.expires_at > NOW()
       ORDER BY ev.created_at DESC LIMIT 1`,
      [email, code]
    );

    if (verification.rows.length === 0) {
      throw new AppError("Invalid or expired verification code", 400);
    }

    await pool.query(
      "UPDATE email_verifications SET used_at = NOW() WHERE id = $1",
      [verification.rows[0].id]
    );

    await pool.query(
      "UPDATE users SET is_verified = true WHERE id = $1",
      [verification.rows[0].user_id]
    );

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError("Email is required", 400);

    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) throw new AppError("User not found", 404);
    if (user.rows[0].is_verified) throw new AppError("Email already verified", 400);

    await pool.query(
      "UPDATE email_verifications SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [user.rows[0].id]
    );

    const code = generateCode();
    const token = generateToken();
    await pool.query(
      `INSERT INTO email_verifications (user_id, token, code, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [user.rows[0].id, token, code]
    );

    sendVerificationEmail(user.rows[0], code).catch(console.error);

    res.json({ success: true, message: "Verification code resent" });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      res.json({ success: true, message: "If the email exists, a reset link has been sent" });
      return;
    }

    const token = generateToken();
    const code = generateCode();

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.rows[0].id, token]
    );

    sendPasswordResetEmail(user.rows[0], token).catch(console.error);

    res.json({
      success: true,
      message: "Password reset code sent to email",
      data: { resetToken: token, resetCode: code },
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const resetRequest = await pool.query(
      "SELECT * FROM password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()",
      [token]
    );

    if (resetRequest.rows.length === 0) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      resetRequest.rows[0].user_id,
    ]);

    await pool.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [
      resetRequest.rows[0].id,
    ]);

    await pool.query(
      "DELETE FROM user_sessions WHERE user_id = $1",
      [resetRequest.rows[0].user_id]
    );

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (user.rows.length === 0) throw new AppError("User not found", 404);

    const isValid = await bcrypt.compare(currentPassword, user.rows[0].password);
    if (!isValid) throw new AppError("Current password is incorrect", 400);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, req.userId]);

    await pool.query(
      "DELETE FROM user_sessions WHERE user_id = $1",
      [req.userId]
    );

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

const verifyTwoFactor = async (req, res, next) => {
  try {
    const { userId, code } = req.body;

    const twoFactorCode = await pool.query(
      `SELECT * FROM two_factor_codes
       WHERE user_id = $1 AND code = $2 AND used_at IS NULL AND expires_at > NOW() AND type = 'email'`,
      [userId, code]
    );

    if (twoFactorCode.rows.length === 0) {
      throw new AppError("Invalid or expired 2FA code", 400);
    }

    await pool.query("UPDATE two_factor_codes SET used_at = NOW() WHERE id = $1", [
      twoFactorCode.rows[0].id,
    ]);

    const userResult = await pool.query(
      "SELECT u.*, r.slug as role_slug FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) throw new AppError("User not found", 404);

    const user = userResult.rows[0];

    await pool.query(
      `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, login_method)
       VALUES ($1, $2, $3, $4, 'success', '2fa')`,
      [user.id, user.email, req.ip, req.headers["user-agent"]]
    );

    await pool.query(
      "UPDATE users SET login_attempts = 0, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2",
      [req.ip, user.id]
    );

    const accessToken = generateAccessToken(user.id, user.role_id);
    const refreshToken = generateRefreshToken(user.id);

    await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken, req.ip, req.headers["user-agent"]]
    );

    res.json({
      success: true,
      message: "Two-factor authentication successful",
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

const enableTwoFactor = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE users SET two_factor_enabled = true WHERE id = $1",
      [req.userId]
    );

    res.json({ success: true, message: "Two-factor authentication enabled" });
  } catch (error) {
    next(error);
  }
};

const disableTwoFactor = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE users SET two_factor_enabled = false WHERE id = $1",
      [req.userId]
    );

    res.json({ success: true, message: "Two-factor authentication disabled" });
  } catch (error) {
    next(error);
  }
};

const sendTwoFactorCode = async (req, res, next) => {
  try {
    const code = generateCode();
    await pool.query(
      `INSERT INTO two_factor_codes (user_id, code, type, expires_at)
       VALUES ($1, $2, 'email', NOW() + INTERVAL '10 minutes')`,
      [req.userId, code]
    );

    const user = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (user.rows.length > 0) sendTwoFactorEmail(user.rows[0], code).catch(console.error);

    res.json({ success: true, message: "Verification code sent", data: { code } });
  } catch (error) {
    next(error);
  }
};

const getSessions = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, device_info, is_active, last_activity, expires_at, created_at
       FROM user_sessions WHERE user_id = $1 ORDER BY last_activity DESC`,
      [req.userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    await pool.query(
      "DELETE FROM user_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, req.userId]
    );

    res.json({ success: true, message: "Session revoked" });
  } catch (error) {
    next(error);
  }
};

const getLoginHistory = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, device_info, status, failure_reason, login_method, created_at
       FROM login_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const getMyPermissions = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.slug, p.name, p.module FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 ORDER BY p.module, p.name`,
      [req.user.role_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  sendTwoFactorCode,
  getSessions,
  revokeSession,
  getLoginHistory,
  getMyPermissions,
};
