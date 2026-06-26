const pool = require("../config/db");
const mtnService = require("../services/mtnService");
const { sendPaymentConfirmationEmail, sendPaymentFailedEmail } = require("../services/emailService");
const { generateReceipt } = require("../services/receiptGenerator");
const { v4: uuidv4 } = require("uuid");

const emitPaymentEvent = (io, event, data) => {
  if (io) {
    io.to(`user:${data.user_id}`).emit(`payment:${event}`, data);
    if (data.enrollment_id) {
      pool.query("SELECT course_id FROM enrollments WHERE id = $1", [data.enrollment_id])
        .then((r) => {
          if (r.rows.length > 0) io.to(`course:${r.rows[0].course_id}`).emit(`payment:${event}`, data);
        })
        .catch(() => {});
    }
  }
};

const processSuccessfulPayment = async (payment, mtnStatus, io) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE payments SET
        status = 'completed',
        paid_at = NOW(),
        provider_reference = COALESCE($1, provider_reference),
        mtn_external_id = COALESCE($2, mtn_external_id),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{mtn_status}', $3::jsonb),
        webhook_verified_at = NOW()
      WHERE id = $4`,
      [
        mtnStatus?.financialTransactionId || null,
        mtnStatus?.externalId || null,
        JSON.stringify(mtnStatus || {}),
        payment.id,
      ]
    );

    if (payment.enrollment_id) {
      await client.query(
        "UPDATE enrollments SET status = 'active', updated_at = NOW() WHERE id = $1",
        [payment.enrollment_id]
      );
    }

    const invoiceNumber = `INV-${Date.now()}-${payment.id.slice(0, 8)}`;
    await client.query(
      `INSERT INTO invoices (user_id, payment_id, invoice_number, amount, tax_amount, total_amount, currency, description, status, paid_at)
       VALUES ($1, $2, $3, $4, 0, $4, $5, $6, 'paid', NOW())`,
      [payment.user_id, payment.id, invoiceNumber, payment.amount, payment.currency || "UGX", payment.description]
    );

    await client.query(
      `UPDATE transactions SET status = 'completed' WHERE payment_id = $1`,
      [payment.id]
    );

    const receipt = await generateReceipt(payment.id, client);

    await client.query("COMMIT");

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [payment.user_id]);
    if (userResult.rows.length > 0) {
      await sendPaymentConfirmationEmail(userResult.rows[0], {
        ...payment,
        receipt_url: receipt?.pdf_url || null,
        receipt_number: receipt?.receipt_number || null,
      }).catch(() => {});
    }

    emitPaymentEvent(io, "success", { ...payment, status: "completed" });
    if (io) io.to("dashboard:admin").emit("dashboard:update", { type: "payment:success", paymentId: payment.id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const processFailedPayment = async (payment, mtnStatus, io) => {
  await pool.query(
    `UPDATE payments SET
      status = 'failed',
      failure_reason = COALESCE($1, failure_reason),
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{mtn_status}', $2::jsonb)
    WHERE id = $3`,
    [mtnStatus?.reason || mtnStatus?.message || "Transaction failed", JSON.stringify(mtnStatus || {}), payment.id]
  );

  await pool.query("UPDATE transactions SET status = 'failed' WHERE payment_id = $1", [payment.id]);

  const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [payment.user_id]);
  if (userResult.rows.length > 0) {
    await sendPaymentFailedEmail(userResult.rows[0], payment).catch(() => {});
  }

  emitPaymentEvent(io, "failed", { ...payment, status: "failed" });
};

const processWebhook = async (payload, headers, io) => {
  const { referenceId, status, reason, financialTransactionId, externalId } = payload;

  const result = await pool.query(
    "SELECT * FROM payments WHERE provider_reference = $1 OR transaction_id = $1 OR mtn_external_id = $2",
    [referenceId, externalId]
  );

  if (result.rows.length === 0) {
    await pool.query(
      `INSERT INTO payment_webhooks (provider, event_type, payload, headers, verified, processed)
       VALUES ('MTN', 'unknown_payment', $1, $2, true, true)`,
      [JSON.stringify(payload), JSON.stringify(headers)]
    );
    return { status: 404, message: "Payment not found" };
  }

  const payment = result.rows[0];

  await pool.query(
    `INSERT INTO payment_webhooks (payment_id, provider, event_type, payload, headers, verified, processed)
     VALUES ($1, 'MTN', $2, $3, $4, true, true)`,
    [payment.id, status === "SUCCESSFUL" ? "payment.success" : "payment.failed", JSON.stringify(payload), JSON.stringify(headers)]
  );

  if (payment.status === "completed") {
    return { status: 200, message: "Already processed" };
  }

  if (status === "SUCCESSFUL") {
    await processSuccessfulPayment(payment, payload, io);
    return { status: 200, message: "Payment completed" };
  } else {
    await processFailedPayment(payment, payload, io);
    return { status: 200, message: "Payment failed" };
  }
};

module.exports = { processWebhook, processSuccessfulPayment, processFailedPayment };
