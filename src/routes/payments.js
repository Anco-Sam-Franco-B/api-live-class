const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  mtnPaymentValidator,
  airtelPaymentValidator,
  paymentIdValidator,
  refundValidator,
  paginationValidator,
  retryValidator,
} = require("../validators/paymentValidator");

router.post("/mtn", authenticate, mtnPaymentValidator, paymentController.requestMtnPayment);
router.post("/airtel", authenticate, airtelPaymentValidator, paymentController.requestAirtelPayment);

router.get("/status/:id", authenticate, paymentIdValidator, paymentController.getPaymentStatus);
router.get("/history", authenticate, paginationValidator, paymentController.getPaymentHistory);

router.get("/", authenticate, requirePermission("view-payments"), paymentController.getAllPayments);

router.post("/:id/verify", authenticate, requirePermission("manage-payments"), paymentIdValidator, paymentController.verifyPayment);
router.post("/:id/manual-verify", authenticate, requirePermission("manage-payments"), paymentIdValidator, paymentController.manualVerifyPayment);
router.post("/:id/refund", authenticate, requirePermission("refund-payments"), paymentIdValidator, paymentController.refundPayment);
router.post("/:id/retry", authenticate, retryValidator, paymentController.retryPayment);
router.delete("/:id", authenticate, requirePermission("manage-payments"), paymentIdValidator, paymentController.deletePayment);

router.post("/webhook", paymentController.handleWebhook);

router.get("/mtn/balance", authenticate, requirePermission("view-payments"), paymentController.getMtnBalance);

router.get("/receipt/:id", authenticate, paymentIdValidator, paymentController.getReceipt);
router.get("/invoice/:id", authenticate, paymentIdValidator, paymentController.getInvoice);

router.post("/receipt/:id/send", authenticate, paymentIdValidator, paymentController.sendReceiptEmail);

router.get("/stats", authenticate, requirePermission("view-payments"), paymentController.getPaymentStats);

module.exports = router;
