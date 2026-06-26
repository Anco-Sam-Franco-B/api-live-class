const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authLimiter, emailLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  twoFactorValidator,
} = require("../validators/authValidator");

router.post("/register", authLimiter, registerValidator, validate, authController.register);
router.post("/login", authLimiter, loginValidator, validate, authController.login);
router.post("/logout", authController.logout);
router.post("/refresh", authController.refreshToken);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", emailLimiter, authController.resendVerification);
router.post("/forgot-password", emailLimiter, forgotPasswordValidator, validate, authController.forgotPassword);
router.post("/reset-password", resetPasswordValidator, validate, authController.resetPassword);
router.post("/change-password", authenticate, changePasswordValidator, validate, authController.changePassword);
router.post("/verify-2fa", authLimiter, twoFactorValidator, validate, authController.verifyTwoFactor);
router.post("/enable-2fa", authenticate, authController.enableTwoFactor);
router.post("/disable-2fa", authenticate, authController.disableTwoFactor);
router.post("/send-2fa-code", authenticate, authController.sendTwoFactorCode);
router.get("/sessions", authenticate, authController.getSessions);
router.delete("/sessions/:sessionId", authenticate, authController.revokeSession);
router.get("/login-history", authenticate, authController.getLoginHistory);
router.get("/permissions", authenticate, authController.getMyPermissions);

module.exports = router;
