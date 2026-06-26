const express = require("express");
const router = express.Router();
const certificateController = require("../controllers/certificateController");
const { authenticate, requirePermission } = require("../middleware/auth");

router.get("/", authenticate, requirePermission("view-certificates"), certificateController.getAllCertificates);
router.get("/my", authenticate, certificateController.getMyCertificates);
router.get("/verify/:number", certificateController.verifyCertificate);
router.get("/:id/qr", certificateController.getCertificateQR);
router.get("/:number", certificateController.getCertificateByNumber);
router.post("/issue", authenticate, requirePermission("issue-certificates"), certificateController.issueCertificate);
router.delete("/:id", authenticate, requirePermission("revoke-certificates"), certificateController.revokeCertificate);

module.exports = router;
