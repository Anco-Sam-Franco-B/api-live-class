const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");

const mtnPaymentValidator = [
  body("amount")
    .isFloat({ min: 100 })
    .withMessage("Amount must be at least 100 UGX"),
  body("phoneNumber")
    .matches(/^(\+256|0)[0-9]{9}$/)
    .withMessage("Valid Ugandan phone number required (07XXXXXXXXX or +256XXXXXXXXX)"),
  body("enrollmentId")
    .isUUID()
    .withMessage("Valid enrollment ID required"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description too long (max 500 chars)"),
  body("currency")
    .optional()
    .isIn(["UGX", "EUR", "USD"])
    .withMessage("Currency must be UGX, EUR, or USD"),
  validate,
];

const airtelPaymentValidator = [
  body("amount")
    .isFloat({ min: 100 })
    .withMessage("Amount must be at least 100 UGX"),
  body("phoneNumber")
    .matches(/^(\+256|0)[0-9]{9}$/)
    .withMessage("Valid Ugandan phone number required"),
  body("enrollmentId")
    .isUUID()
    .withMessage("Valid enrollment ID required"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 }),
  validate,
];

const paymentIdValidator = [
  param("id")
    .isUUID()
    .withMessage("Valid payment ID required"),
  validate,
];

const refundValidator = [
  body("paymentId")
    .isUUID()
    .withMessage("Valid payment ID required"),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason too long (max 500 chars)"),
  validate,
];

const paginationValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  validate,
];

const retryValidator = [
  param("id")
    .isUUID()
    .withMessage("Valid payment ID required"),
  validate,
];

module.exports = {
  mtnPaymentValidator,
  airtelPaymentValidator,
  paymentIdValidator,
  refundValidator,
  paginationValidator,
  retryValidator,
};
