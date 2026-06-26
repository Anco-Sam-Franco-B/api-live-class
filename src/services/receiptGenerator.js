const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const env = require("../config/env");

const RECEIPTS_DIR = path.join(__dirname, "..", "uploads", "receipts");

const ensureDir = () => {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
};

const generateReceiptNumber = () => {
  const prefix = "RCP";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
};

const generateReceipt = async (paymentId, client) => {
  ensureDir();
  const db = client || pool;
  const paymentResult = await db.query(
    `SELECT p.*, u.first_name, u.last_name, u.email, c.title as course_title,
            e.course_id, inv.invoice_number
     FROM payments p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN enrollments e ON p.enrollment_id = e.id
     LEFT JOIN courses c ON e.course_id = c.id
     LEFT JOIN invoices inv ON inv.payment_id = p.id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (paymentResult.rows.length === 0) return null;
  const payment = paymentResult.rows[0];
  const receiptNumber = generateReceiptNumber();
  const filename = `receipt-${receiptNumber}.pdf`;
  const filepath = path.join(RECEIPTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(24).font("Helvetica-Bold").text("RECEIPT", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#666")
      .text("Live Class Code", { align: "center" })
      .text("Payment Receipt", { align: "center" });
    doc.moveDown(0.5);

    const hr = (y) => { doc.moveTo(50, y).lineTo(545, y).strokeColor("#ddd").stroke(); };
    hr(doc.y + 5);

    doc.moveDown();
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#333");
    doc.text(`Receipt Number: `, { continued: true }).font("Helvetica").text(receiptNumber);
    doc.font("Helvetica-Bold").text(`Date: `, { continued: true }).font("Helvetica").text(new Date().toLocaleDateString("en-UG", { year: "numeric", month: "long", day: "numeric" }));
    doc.font("Helvetica-Bold").text(`Payment Method: `, { continued: true }).font("Helvetica").text(payment.payment_method === "mtn_momo" ? "MTN MoMo" : "Airtel Money");
    doc.font("Helvetica-Bold").text(`Transaction ID: `, { continued: true }).font("Helvetica").text(payment.transaction_id || "N/A");
    doc.font("Helvetica-Bold").text(`Phone: `, { continued: true }).font("Helvetica").text(payment.phone_number || "N/A");
    if (payment.invoice_number) {
      doc.font("Helvetica-Bold").text(`Invoice: `, { continued: true }).font("Helvetica").text(payment.invoice_number);
    }

    doc.moveDown();
    hr(doc.y);

    doc.moveDown().fontSize(14).font("Helvetica-Bold").fillColor("#333").text("Bill To:");
    doc.moveDown(0.3).fontSize(10).font("Helvetica").fillColor("#555");
    doc.text(`${payment.first_name} ${payment.last_name}`);
    doc.text(payment.email);

    doc.moveDown();
    hr(doc.y);

    doc.moveDown().fontSize(12).font("Helvetica-Bold").fillColor("#333").text("Description", 50, doc.y, { continued: true }).text("Amount", { align: "right" });
    hr(doc.y);
    doc.moveDown(0.3).fontSize(10).font("Helvetica").fillColor("#333");
    doc.text(payment.course_title || payment.description || "Course Enrollment", 50, doc.y, { continued: true });
    doc.text(`${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}`, { align: "right" });

    doc.moveDown();
    hr(doc.y);
    doc.moveDown(0.3).fontSize(12).font("Helvetica-Bold").fillColor("#333");
    doc.text("Total:", 50, doc.y, { continued: true });
    doc.text(`${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(9).font("Helvetica").fillColor("#999").text("This is a computer-generated receipt. No signature required.", { align: "center" });
    doc.text(`Generated on ${new Date().toISOString()}`, { align: "center" });

    doc.end();

    stream.on("finish", async () => {
      try {
        const receiptUrl = `/uploads/receipts/${filename}`;
        const receiptResult = await db.query(
          `INSERT INTO payment_receipts (payment_id, receipt_number, pdf_url, generated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [paymentId, receiptNumber, receiptUrl]
        );
        if (receiptResult.rows.length > 0) {
          await db.query("UPDATE payments SET receipt_generated_at = NOW() WHERE id = $1", [paymentId]);
        }
        resolve({ receipt_number: receiptNumber, pdf_url: receiptUrl, ...receiptResult.rows[0] });
      } catch (err) {
        reject(err);
      }
    });
    stream.on("error", reject);
  });
};

const generateInvoice = async (paymentId) => {
  ensureDir();
  const paymentResult = await pool.query(
    `SELECT p.*, u.first_name, u.last_name, u.email, u.address, u.city,
            c.title as course_title, e.course_id
     FROM payments p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN enrollments e ON p.enrollment_id = e.id
     LEFT JOIN courses c ON e.course_id = c.id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (paymentResult.rows.length === 0) return null;
  const payment = paymentResult.rows[0];

  const invResult = await pool.query(
    "SELECT invoice_number FROM invoices WHERE payment_id = $1",
    [paymentId]
  );
  const invoiceNumber = invResult.rows.length > 0
    ? invResult.rows[0].invoice_number
    : `INV-${Date.now()}-${paymentId.slice(0, 8)}`;
  const filename = `invoice-${invoiceNumber}.pdf`;
  const filepath = path.join(RECEIPTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(24).font("Helvetica-Bold").text("INVOICE", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#666")
      .text("Live Class Code - Official Invoice", { align: "center" });
    doc.moveDown(0.5);

    const hr = (y) => { doc.moveTo(50, y).lineTo(545, y).strokeColor("#ddd").stroke(); };
    hr(doc.y + 5);

    doc.moveDown();
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#333");
    doc.text(`Invoice Number: `, { continued: true }).font("Helvetica").text(invoiceNumber);
    doc.font("Helvetica-Bold").text(`Issue Date: `, { continued: true }).font("Helvetica").text(new Date().toLocaleDateString("en-UG"));
    doc.font("Helvetica-Bold").text(`Payment Method: `, { continued: true }).font("Helvetica").text(payment.payment_method === "mtn_momo" ? "MTN MoMo" : "Airtel Money");
    doc.font("Helvetica-Bold").text(`Status: `, { continued: true }).font("Helvetica").text(payment.status === "completed" ? "PAID" : payment.status.toUpperCase());

    doc.moveDown();
    hr(doc.y);

    doc.moveDown().fontSize(14).font("Helvetica-Bold").fillColor("#333").text("Bill To:");
    doc.moveDown(0.3).fontSize(10).font("Helvetica").fillColor("#555");
    doc.text(`${payment.first_name} ${payment.last_name}`);
    doc.text(payment.email);
    if (payment.address) doc.text(payment.address);
    if (payment.city) doc.text(payment.city);

    doc.moveDown();
    hr(doc.y);

    doc.moveDown().fontSize(12).font("Helvetica-Bold").fillColor("#333").text("Description", 50, doc.y, { continued: true }).text("Amount", { align: "right" });
    hr(doc.y);
    doc.moveDown(0.3).fontSize(10).font("Helvetica").fillColor("#333");
    doc.text(payment.course_title || payment.description || "Course Enrollment", 50, doc.y, { continued: true });
    doc.text(`${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}`, { align: "right" });

    doc.moveDown();
    hr(doc.y);
    doc.moveDown(0.3).fontSize(12).font("Helvetica-Bold").fillColor("#333");
    doc.text("Total:", 50, doc.y, { continued: true });
    doc.text(`${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(9).font("Helvetica").fillColor("#999").text("Thank you for your business!", { align: "center" });
    doc.text(`Invoice generated on ${new Date().toISOString()}`, { align: "center" });

    doc.end();

    stream.on("finish", async () => {
      const invoiceUrl = `/uploads/receipts/${filename}`;
      await pool.query(
        "UPDATE payments SET invoice_generated_at = NOW() WHERE id = $1",
        [paymentId]
      );
      if (invResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO invoices (user_id, payment_id, invoice_number, amount, total_amount, currency, description, status, paid_at)
           VALUES ($1, $2, $3, $4, $4, $5, $6, 'paid', NOW())
           ON CONFLICT DO NOTHING`,
          [payment.user_id, paymentId, invoiceNumber, payment.amount, payment.currency || "UGX", payment.description]
        );
      }
      resolve({ invoice_number: invoiceNumber, pdf_url: invoiceUrl });
    });
    stream.on("error", reject);
  });
};

module.exports = { generateReceipt, generateInvoice };
