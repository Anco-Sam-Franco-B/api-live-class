const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { v4: uuidv4 } = require("uuid");
const mtnService = require("../services/mtnService");
const { processSuccessfulPayment, processFailedPayment } = require("../webhooks/mtnWebhook");
const { generateReceipt, generateInvoice } = require("../services/receiptGenerator");
const {
  sendPaymentConfirmationEmail,
  sendPaymentFailedEmail,
  sendPaymentReceiptEmail,
} = require("../services/emailService");

const getIO = (req) => req.app.get("io");

const requestMtnPayment = async (req, res, next) => {
  try {
    const { amount, phoneNumber, enrollmentId, description } = req.body;
    const transactionId = uuidv4();
    const reference = `MTN-${Date.now()}`;

    const enrollmentCheck = await pool.query(
      "SELECT e.*, c.title, c.price FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.id = $1 AND e.user_id = $2",
      [enrollmentId, req.userId]
    );
    if (enrollmentCheck.rows.length === 0) throw new AppError("Enrollment not found", 404);
    if (enrollmentCheck.rows[0].status === "active") throw new AppError("Already enrolled", 400);

    const payment = await pool.query(
      `INSERT INTO payments (user_id, enrollment_id, amount, currency, payment_method, provider, transaction_id, provider_reference, phone_number, status, description, mtn_environment)
       VALUES ($1, $2, $3, 'UGX', 'mtn_momo', 'MTN', $4, $5, $6, 'processing', $7, $8) RETURNING *`,
      [req.userId, enrollmentId, amount, transactionId, reference, phoneNumber, description, mtnService.env || "sandbox"]
    );

    await pool.query(
      "INSERT INTO transactions (payment_id, user_id, type, amount, reference, description, status) VALUES ($1, $2, 'payment', $3, $4, $5, 'pending')",
      [payment.rows[0].id, req.userId, amount, reference, description]
    );

    let mtnResponse;
    try {
      mtnResponse = await mtnService.requestToPay({
        amount,
        phoneNumber,
        payerMessage: description || "Course enrollment payment",
        payeeNote: `Payment for ${enrollmentCheck.rows[0].title}`,
        externalId: transactionId,
      });
    } catch (mtnError) {
      await pool.query(
        "UPDATE payments SET status = 'failed', failure_reason = $1 WHERE id = $2",
        [mtnError.message, payment.rows[0].id]
      );
      throw mtnError;
    }

    await pool.query(
      `UPDATE payments SET
        provider_reference = $1,
        mtn_external_id = $2,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{mtn_reference_id}', $3::jsonb)
      WHERE id = $4`,
      [reference, mtnResponse.referenceId, JSON.stringify(mtnResponse.referenceId), payment.rows[0].id]
    );

    const io = getIO(req);
    if (io) {
      io.to(`user:${req.userId}`).emit("payment:created", {
        ...payment.rows[0],
        mtnReferenceId: mtnResponse.referenceId,
      });
    }

    res.status(201).json({
      success: true,
      message: "MTN MoMo payment initiated. Complete the transaction on your phone.",
      data: { ...payment.rows[0], mtnReferenceId: mtnResponse.referenceId },
    });
  } catch (error) {
    next(error);
  }
};

const requestAirtelPayment = async (req, res, next) => {
  try {
    const { amount, phoneNumber, enrollmentId, description } = req.body;
    const transactionId = uuidv4();
    const reference = `AIRTEL-${Date.now()}`;

    const enrollmentCheck = await pool.query(
      "SELECT e.*, c.title FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.id = $1 AND e.user_id = $2",
      [enrollmentId, req.userId]
    );
    if (enrollmentCheck.rows.length === 0) throw new AppError("Enrollment not found", 404);

    const payment = await pool.query(
      `INSERT INTO payments (user_id, enrollment_id, amount, currency, payment_method, provider, transaction_id, provider_reference, phone_number, status, description)
       VALUES ($1, $2, $3, 'UGX', 'airtel_money', 'Airtel', $4, $5, $6, 'processing', $7) RETURNING *`,
      [req.userId, enrollmentId, amount, transactionId, reference, phoneNumber, description]
    );

    await pool.query(
      "INSERT INTO transactions (payment_id, user_id, type, amount, reference, description, status) VALUES ($1, $2, 'payment', $3, $4, $5, 'pending')",
      [payment.rows[0].id, req.userId, amount, reference, description]
    );

    const io = getIO(req);
    if (io) io.to(`user:${req.userId}`).emit("payment:created", payment.rows[0]);

    res.status(201).json({
      success: true,
      message: "Airtel Money payment initiated",
      data: payment.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
    if (result.rows.length === 0) throw new AppError("Payment not found", 404);
    const payment = result.rows[0];

    if (payment.status === "completed") {
      return res.json({ success: true, data: payment, message: "Already verified" });
    }

    let mtnStatus = null;
    if (payment.provider === "MTN" && payment.mtn_external_id) {
      try {
        mtnStatus = await mtnService.getTransactionStatus(payment.mtn_external_id);
      } catch (mtnError) {
        if (mtnError.statusCode !== 404) throw mtnError;
      }
    }

    if (mtnStatus && mtnStatus.status === "SUCCESSFUL") {
      const io = getIO(req);
      await processSuccessfulPayment(payment, mtnStatus, io);
      const updated = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
      return res.json({ success: true, data: updated.rows[0] });
    }

    const now = new Date();
    const retryCount = (payment.retry_count || 0) + 1;
    if (retryCount <= 5) {
      await pool.query(
        "UPDATE payments SET retry_count = $1, last_retry_at = NOW() WHERE id = $2",
        [retryCount, id]
      );
      return res.json({
        success: true,
        data: { ...payment, status: payment.status },
        message: `Payment still processing. Check again later (attempt ${retryCount}/5).`,
      });
    }

    await pool.query(
      "UPDATE payments SET status = 'failed', failure_reason = 'Max retry attempts reached' WHERE id = $1",
      [id]
    );
    await pool.query("UPDATE transactions SET status = 'failed' WHERE payment_id = $1", [id]);

    const io = getIO(req);
    if (io) io.to(`user:${payment.user_id}`).emit("payment:failed", { ...payment, status: "failed" });

    res.json({
      success: true,
      data: { ...payment, status: "failed" },
      message: "Payment verification timed out after maximum retries.",
    });
  } catch (error) {
    next(error);
  }
};

const manualVerifyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
    if (result.rows.length === 0) throw new AppError("Payment not found", 404);
    const payment = result.rows[0];

    if (payment.status === "completed") {
      return res.json({ success: true, data: payment, message: "Already verified" });
    }

    const io = getIO(req);
    const mtnStatus = { status: "SUCCESSFUL", financialTransactionId: `MANUAL-${Date.now()}` };
    await processSuccessfulPayment(payment, mtnStatus, io);

    const updated = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getPaymentStatus = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.title as course_title FROM payments p
       LEFT JOIN enrollments e ON p.enrollment_id = e.id
       LEFT JOIN courses c ON e.course_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Payment not found", 404);

    const payment = result.rows[0];
    if (payment.provider === "MTN" && payment.mtn_external_id && payment.status === "processing") {
      try {
        const mtnStatus = await mtnService.getTransactionStatus(payment.mtn_external_id);
        if (mtnStatus.status === "SUCCESSFUL") {
          const io = getIO(req);
          await processSuccessfulPayment(payment, mtnStatus, io);
          const updated = await pool.query("SELECT * FROM payments WHERE id = $1", [req.params.id]);
          return res.json({ success: true, data: updated.rows[0] });
        } else if (mtnStatus.status === "FAILED") {
          const io = getIO(req);
          await processFailedPayment(payment, mtnStatus, io);
          const updated = await pool.query("SELECT * FROM payments WHERE id = $1", [req.params.id]);
          return res.json({ success: true, data: updated.rows[0] });
        }
      } catch {
        /* MTN status check failed - return DB status */
      }
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

const getPaymentHistory = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = `SELECT p.*, c.title as course_title FROM payments p LEFT JOIN enrollments e ON p.enrollment_id = e.id LEFT JOIN courses c ON e.course_id = c.id WHERE p.user_id = $1`;
    const params = [req.userId];

    if (status && ["pending", "processing", "completed", "failed", "refunded"].includes(status)) {
      params.push(status);
      queryStr += ` AND p.status = $${params.length}`;
    }

    queryStr += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(queryStr, params);
    const countResult = await pool.query(
      "SELECT COUNT(*) as total FROM payments WHERE user_id = $1",
      [req.userId]
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
};

const getAllPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, provider, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = `SELECT p.*, u.first_name || ' ' || u.last_name as user_name, u.email as user_email FROM payments p JOIN users u ON p.user_id = u.id WHERE 1=1`;
    const params = [];
    let paramIndex = 0;

    if (status) { paramIndex++; params.push(status); queryStr += ` AND p.status = $${paramIndex}`; }
    if (provider) { paramIndex++; params.push(provider); queryStr += ` AND p.provider = $${paramIndex}`; }
    if (startDate) { paramIndex++; params.push(startDate); queryStr += ` AND p.created_at >= $${paramIndex}`; }
    if (endDate) { paramIndex++; params.push(endDate); queryStr += ` AND p.created_at <= $${paramIndex}`; }

    queryStr += ` ORDER BY p.created_at DESC LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`;
    params.push(limit, offset);

    const result = await pool.query(queryStr, params);
    const countResult = await pool.query("SELECT COUNT(*) as total FROM payments");

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
};

const refundPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await pool.query(
      "SELECT * FROM payments WHERE id = $1 AND status = 'completed'",
      [id]
    );
    if (result.rows.length === 0) throw new AppError("Payment not found or not refundable", 400);
    const payment = result.rows[0];

    let mtnRefundId = null;
    if (payment.provider === "MTN" && payment.mtn_external_id) {
      try {
        const refundResponse = await mtnService.requestRefund({
          referenceId: payment.mtn_external_id,
          amount: payment.amount,
          externalId: payment.transaction_id,
          payerMessage: reason || "Refund requested by admin",
        });
        mtnRefundId = refundResponse.refundReferenceId;
      } catch (mtnError) {
        throw new AppError(`MTN refund failed: ${mtnError.message}`, 500);
      }
    }

    await pool.query(
      "UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await pool.query(
      `INSERT INTO payment_refunds (payment_id, refund_id, amount, currency, reason, status, mtn_refund_id, processed_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, NOW())`,
      [id, `REF-${Date.now()}`, payment.amount, payment.currency || "UGX", reason || "Admin refund", mtnRefundId]
    );

    await pool.query(
      "INSERT INTO transactions (payment_id, user_id, type, amount, reference, description, status) VALUES ($1, $2, 'refund', $3, $4, $5, 'completed')",
      [id, payment.user_id, payment.amount, `REF-${Date.now()}`, `Refund for ${payment.transaction_id}`]
    );

    const io = getIO(req);
    if (io) io.to(`user:${payment.user_id}`).emit("payment:refunded", { ...payment, status: "refunded" });

    res.json({ success: true, data: { ...payment, status: "refunded" } });
  } catch (error) {
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const { processWebhook } = require("../webhooks/mtnWebhook");
    const io = req.app.get("io");
    const result = await processWebhook(req.body, req.headers, io);
    res.status(result.status).json({ success: result.status < 400, message: result.message });
  } catch (error) {
    next(error);
  }
};

const deletePayment = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM payments WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Payment not found", 404);
    res.json({ success: true, message: "Payment deleted" });
  } catch (error) {
    next(error);
  }
};

const getMtnBalance = async (req, res, next) => {
  try {
    const balance = await mtnService.getAccountBalance();
    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
};

const getReceipt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const receiptResult = await pool.query(
      "SELECT * FROM payment_receipts WHERE payment_id = $1",
      [id]
    );

    if (receiptResult.rows.length > 0) {
      return res.json({ success: true, data: receiptResult.rows[0] });
    }

    const paymentCheck = await pool.query(
      "SELECT * FROM payments WHERE id = $1 AND status = 'completed'",
      [id]
    );
    if (paymentCheck.rows.length === 0) throw new AppError("Payment not found or not completed", 404);

    const receipt = await generateReceipt(id);
    if (!receipt) throw new AppError("Failed to generate receipt", 500);

    res.json({ success: true, data: receipt });
  } catch (error) {
    next(error);
  }
};

const getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paymentCheck = await pool.query(
      "SELECT * FROM payments WHERE id = $1 AND status = 'completed'",
      [id]
    );
    if (paymentCheck.rows.length === 0) throw new AppError("Payment not found or not completed", 404);

    const invoice = await generateInvoice(id);
    if (!invoice) throw new AppError("Failed to generate invoice", 500);

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

const retryPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM payments WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (result.rows.length === 0) throw new AppError("Payment not found", 404);
    const payment = result.rows[0];

    if (payment.status === "completed") throw new AppError("Payment already completed", 400);
    if (payment.status === "refunded") throw new AppError("Payment already refunded", 400);

    const retryCount = (payment.retry_count || 0) + 1;
    if (retryCount > 10) throw new AppError("Maximum retry attempts reached", 400);

    if (payment.provider === "MTN") {
      try {
        await mtnService.getAccessToken();
        const mtnResponse = await mtnService.requestToPay({
          amount: payment.amount,
          phoneNumber: payment.phone_number,
          payerMessage: payment.description || "Course enrollment payment",
          payeeNote: "Retry payment for course enrollment",
          externalId: payment.transaction_id,
        });

        await pool.query(
          `UPDATE payments SET status = 'processing', retry_count = $1, last_retry_at = NOW(), failure_reason = NULL, updated_at = NOW() WHERE id = $2`,
          [retryCount, id]
        );

        return res.json({
          success: true,
          message: "Payment retry initiated",
          data: { ...payment, status: "processing", retry_count: retryCount },
        });
      } catch (mtnError) {
        await pool.query(
          "UPDATE payments SET retry_count = $1, last_retry_at = NOW(), failure_reason = $2 WHERE id = $3",
          [retryCount, mtnError.message, id]
        );
        throw new AppError(`Retry failed: ${mtnError.message}`, 500);
      }
    }

    await pool.query(
      "UPDATE payments SET status = 'processing', retry_count = $1, last_retry_at = NOW(), failure_reason = NULL WHERE id = $2",
      [retryCount, id]
    );

    res.json({ success: true, message: "Payment retry initiated", data: { ...payment, status: "processing" } });
  } catch (error) {
    next(error);
  }
};

const getPaymentStats = async (req, res, next) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int as total_payments,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed_payments,
        COUNT(*) FILTER (WHERE status = 'processing')::int as pending_payments,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed_payments,
        COUNT(*) FILTER (WHERE status = 'refunded')::int as refunded_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::float as total_revenue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float as total_refunded,
        COALESCE(AVG(amount) FILTER (WHERE status = 'completed'), 0)::float as average_payment
      FROM payments
    `);

    const todayStats = await pool.query(`
      SELECT COUNT(*)::int as today_count, COALESCE(SUM(amount), 0)::float as today_revenue
      FROM payments WHERE status = 'completed' AND paid_at::date = CURRENT_DATE
    `);

    const methodBreakdown = await pool.query(`
      SELECT payment_method, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::float as total
      FROM payments WHERE status = 'completed'
      GROUP BY payment_method
    `);

    res.json({
      success: true,
      data: {
        ...stats.rows[0],
        today: todayStats.rows[0],
        methodBreakdown: methodBreakdown.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

const sendReceiptEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await pool.query("SELECT * FROM payments WHERE id = $1", [id]);
    if (payment.rows.length === 0) throw new AppError("Payment not found", 404);

    const receipt = await pool.query(
      "SELECT * FROM payment_receipts WHERE payment_id = $1 ORDER BY generated_at DESC LIMIT 1",
      [id]
    );

    const user = await pool.query("SELECT * FROM users WHERE id = $1", [payment.rows[0].user_id]);
    if (user.rows.length === 0) throw new AppError("User not found", 404);

    await sendPaymentReceiptEmail(user.rows[0], {
      ...payment.rows[0],
      receipt_url: receipt.rows[0]?.pdf_url || null,
      receipt_number: receipt.rows[0]?.receipt_number || null,
    });

    if (receipt.rows.length > 0) {
      await pool.query("UPDATE payment_receipts SET sent_via_email = true, sent_at = NOW() WHERE id = $1", [receipt.rows[0].id]);
    }

    res.json({ success: true, message: "Receipt email sent" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestMtnPayment,
  requestAirtelPayment,
  verifyPayment,
  manualVerifyPayment,
  getPaymentStatus,
  getPaymentHistory,
  getAllPayments,
  refundPayment,
  deletePayment,
  handleWebhook,
  getMtnBalance,
  getReceipt,
  getInvoice,
  retryPayment,
  getPaymentStats,
  sendReceiptEmail,
};
