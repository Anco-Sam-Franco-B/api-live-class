const pool = require("../config/db");
const AppError = require("../utils/AppError");
const QRCode = require("qrcode");
const { sendCertificateEmail } = require("../services/emailService");

const getMyCertificates = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cert.*, c.title as course_title, c.slug as course_slug, u.first_name || ' ' || u.last_name as teacher_name
       FROM certificates cert JOIN courses c ON cert.course_id = c.id
       JOIN users u ON c.teacher_id = u.id
       WHERE cert.user_id = $1 ORDER BY cert.issued_at DESC`,
      [req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getCertificateByNumber = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cert.*, c.title as course_title, c.slug as course_slug, c.duration_hours,
              u.first_name || ' ' || u.last_name as student_name, u.email as student_email,
              t.first_name || ' ' || t.last_name as teacher_name, t.avatar_url as teacher_avatar
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN users u ON cert.user_id = u.id
       JOIN users t ON c.teacher_id = t.id
       WHERE cert.certificate_number = $1`,
      [req.params.number]
    );
    if (result.rows.length === 0) throw new AppError("Certificate not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const issueCertificate = async (req, res, next) => {
  try {
    const { enrollmentId, grade, templateId } = req.body;
    const enrollment = await pool.query(
      `SELECT e.*, c.title as course_title, c.slug as course_slug, c.duration_hours FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.id = $1 AND e.is_completed = true`,
      [enrollmentId]
    );
    if (enrollment.rows.length === 0) throw new AppError("Course not completed or enrollment not found", 400);

    const existing = await pool.query("SELECT id FROM certificates WHERE enrollment_id = $1", [enrollmentId]);
    if (existing.rows.length > 0) throw new AppError("Certificate already issued for this enrollment", 409);

    const user = await pool.query("SELECT * FROM users WHERE id = $1", [enrollment.rows[0].user_id]);
    if (user.rows.length === 0) throw new AppError("User not found", 404);

    const certResult = await pool.query(
      `INSERT INTO certificates (user_id, course_id, enrollment_id, grade, certificate_url, template_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [enrollment.rows[0].user_id, enrollment.rows[0].course_id, enrollmentId, grade || "A", `/certificates/${enrollment.rows[0].course_slug}-${Date.now()}.pdf`, templateId || null]
    );

    const cert = certResult.rows[0];
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const verifyUrl = `${baseUrl}/certificates/verify/${cert.certificate_number}`;
    const qrData = JSON.stringify({
      cert: cert.certificate_number,
      student: user.rows[0].first_name + " " + user.rows[0].last_name,
      course: enrollment.rows[0].course_title,
      issued: cert.issued_at,
      grade: cert.grade,
      verify: verifyUrl,
    });

    try {
      const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } });
      await pool.query("UPDATE certificates SET certificate_qr = $1 WHERE id = $2", [qrImage, cert.id]);
      cert.certificate_qr = qrImage;
    } catch (qrErr) {
      console.error("QR generation failed:", qrErr.message);
    }

    sendCertificateEmail(user.rows[0], cert, enrollment.rows[0]).catch(console.error);

    res.status(201).json({ success: true, data: cert });
  } catch (error) { next(error); }
};

const verifyCertificate = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cert.*, c.title as course_title, c.duration_hours, c.slug as course_slug,
              u.first_name || ' ' || u.last_name as student_name, u.email as student_email,
              t.first_name || ' ' || t.last_name as teacher_name
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN users u ON cert.user_id = u.id
       JOIN users t ON c.teacher_id = t.id
       WHERE cert.certificate_number = $1`,
      [req.params.number]
    );
    if (result.rows.length === 0) throw new AppError("Certificate not found", 404);
    res.json({ success: true, data: { valid: true, ...result.rows[0] } });
  } catch (error) { next(error); }
};

const getCertificateQR = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT certificate_qr FROM certificates WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].certificate_qr) throw new AppError("QR not found", 404);
    const base64 = result.rows[0].certificate_qr.replace(/^data:image\/png;base64,/, "");
    const img = Buffer.from(base64, "base64");
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": img.length });
    res.end(img);
  } catch (error) { next(error); }
};

const getAllCertificates = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = ` WHERE 1=1`;
    const params = [];
    let p = 1;
    if (search) { whereClause += ` AND (u.first_name ILIKE $${p} OR u.last_name ILIKE $${p} OR c.title ILIKE $${p} OR cert.certificate_number ILIKE $${p})`; params.push(`%${search}%`); p++; }
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM certificates cert JOIN courses c ON cert.course_id = c.id JOIN users u ON cert.user_id = u.id${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].total);
    const result = await pool.query(
      `SELECT cert.*, c.title as course_title, u.first_name || ' ' || u.last_name as student_name, u.email as student_email
       FROM certificates cert JOIN courses c ON cert.course_id = c.id JOIN users u ON cert.user_id = u.id${whereClause}
       ORDER BY cert.issued_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );
    res.json({ success: true, data: result.rows, total });
  } catch (error) { next(error); }
};

const revokeCertificate = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM certificates WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Certificate not found", 404);
    res.json({ success: true, message: "Certificate revoked" });
  } catch (error) { next(error); }
};

module.exports = { getAllCertificates, getMyCertificates, getCertificateByNumber, issueCertificate, verifyCertificate, revokeCertificate, getCertificateQR };
