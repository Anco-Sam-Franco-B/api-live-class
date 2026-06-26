const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    try {
      await transporter.verify();
      console.log("SMTP connection verified:", env.SMTP_HOST);
    } catch (err) {
      console.warn("SMTP verification failed, falling back to Ethereal:", err.message);
      transporter = null;
    }
  }

  if (!transporter) {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log("Using Ethereal test email:", testAccount.user);
  }

  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: `"Live Class Code" <${env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    if (info.messageId) {
      console.log("Email sent:", info.messageId, info.envelope);
      if (info.messageId.includes("ethereal")) {
        console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
      }
    }
    return info;
  } catch (error) {
    console.error("Email send error:", error);
  }
};

const sendWelcomeEmail = async (user) => {
  return sendEmail({
    to: user.email,
    subject: "Welcome to Live Class Code!",
    html: `<h1>Welcome ${user.first_name}!</h1><p>Thank you for joining Live Class Code. Start learning today!</p><p><a href="${env.CLIENT_URL}/login">Login to your account</a></p>`,
  });
};

const sendVerificationEmail = async (user, code) => {
  return sendEmail({
    to: user.email,
    subject: "Verify Your Email - Live Class Code",
    html: `<h1>Email Verification</h1><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 24 hours.</p>`,
  });
};

const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Reset Your Password - Live Class Code",
    html: `<h1>Password Reset</h1><p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
  });
};

const sendTwoFactorEmail = async (user, code) => {
  return sendEmail({
    to: user.email,
    subject: "Your 2FA Code - Live Class Code",
    html: `<h1>Two-Factor Authentication</h1><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
  });
};

const sendEnrollmentEmail = async (user, course) => {
  return sendEmail({
    to: user.email,
    subject: `Enrolled in ${course.title} - Live Class Code`,
    html: `<h1>Enrollment Confirmed</h1><p>You have been enrolled in <strong>${course.title}</strong>.</p><p><a href="${env.CLIENT_URL}/courses/${course.slug}">Go to Course</a></p>`,
  });
};

const sendPaymentConfirmationEmail = async (user, payment) => {
  const receiptLink = payment.receipt_url
    ? `${env.CLIENT_URL}${payment.receipt_url}`
    : `${env.CLIENT_URL}/student/payments`;
  return sendEmail({
    to: user.email,
    subject: "Payment Confirmed - Live Class Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4f46e5; margin: 0;">Payment Received</h1>
          <p style="color: #666; font-size: 14px;">Thank you for your payment</p>
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Amount</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Reference</td><td style="padding: 8px 0; text-align: right;">${payment.transaction_id}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Method</td><td style="padding: 8px 0; text-align: right;">${payment.payment_method === "mtn_momo" ? "MTN MoMo" : payment.payment_method}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Status</td><td style="padding: 8px 0; text-align: right;"><span style="color: #059669; font-weight: bold;">Completed</span></td></tr>
          </table>
        </div>
        ${payment.receipt_number ? `<p style="font-size: 12px; color: #999;">Receipt: ${payment.receipt_number}</p>` : ""}
        <div style="text-align: center; margin-top: 20px;">
          <a href="${receiptLink}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Receipt</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">Live Class Code - Empowering Education</p>
      </div>`,
  });
};

const sendPaymentFailedEmail = async (user, payment) => {
  return sendEmail({
    to: user.email,
    subject: "Payment Failed - Live Class Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">Payment Failed</h1>
          <p style="color: #666; font-size: 14px;">Your payment was not successful</p>
        </div>
        <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Amount</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Reference</td><td style="padding: 8px 0; text-align: right;">${payment.transaction_id}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Reason</td><td style="padding: 8px 0; text-align: right; color: #dc2626;">${payment.failure_reason || "Transaction declined"}</td></tr>
          </table>
        </div>
        <div style="text-align: center; margin-top: 20px;">
          <a href="${env.CLIENT_URL}/student/payment" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Try Again</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">If you need help, contact our support team.</p>
      </div>`,
  });
};

const sendPaymentReceiptEmail = async (user, payment) => {
  return sendEmail({
    to: user.email,
    subject: `Receipt ${payment.receipt_number || ""} - Live Class Code`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4f46e5; margin: 0;">Your Receipt</h1>
          ${payment.receipt_number ? `<p style="color: #666;">Receipt #${payment.receipt_number}</p>` : ""}
        </div>
        <p>Dear ${user.first_name},</p>
        <p>Your payment receipt is now available.</p>
        ${payment.receipt_url
          ? `<div style="text-align: center; margin: 20px 0;">
              <a href="${env.CLIENT_URL}${payment.receipt_url}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Download Receipt</a>
             </div>`
          : ""}
        <p style="font-size: 12px; color: #999;">Amount: ${payment.currency || "UGX"} ${parseFloat(payment.amount).toLocaleString()}</p>
      </div>`,
  });
};

const sendCertificateEmail = async (user, certificate, course) => {
  return sendEmail({
    to: user.email,
    subject: "Certificate Issued - Live Class Code",
    html: `<h1>Congratulations!</h1><p>You have earned a certificate for completing <strong>${course.title}</strong>.</p><p>Certificate Number: ${certificate.certificate_number}</p><p><a href="${env.CLIENT_URL}/certificates/verify/${certificate.certificate_number}">Verify Certificate</a></p>`,
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorEmail,
  sendEnrollmentEmail,
  sendPaymentConfirmationEmail,
  sendPaymentFailedEmail,
  sendPaymentReceiptEmail,
  sendCertificateEmail,
};
