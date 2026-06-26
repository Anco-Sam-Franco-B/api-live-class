const crypto = require("crypto");

const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

const generateCode = (length = 6) => {
  return Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1)).toString();
};

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

const sanitizeUser = (user) => {
  const { password, two_factor_secret, passkey_public_key, remember_token, ...safeUser } = user;
  return safeUser;
};

const calculatePercentage = (earned, total) => {
  if (total === 0) return 0;
  return Math.round((earned / total) * 100);
};

const calculateLetterGrade = (percentage) => {
  if (percentage >= 80) return "A";
  if (percentage >= 75) return "B+";
  if (percentage >= 70) return "B";
  if (percentage >= 65) return "C+";
  if (percentage >= 60) return "C";
  if (percentage >= 55) return "D+";
  if (percentage >= 50) return "D";
  return "F";
};

const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return { offset, limit, page };
};

const buildPaginationMeta = (total, page, limit) => {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
};

module.exports = {
  generateToken,
  generateCode,
  generateSlug,
  sanitizeUser,
  calculatePercentage,
  calculateLetterGrade,
  paginate,
  buildPaginationMeta,
};
