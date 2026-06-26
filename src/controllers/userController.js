const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { sanitizeUser, paginate, buildPaginationMeta } = require("../utils/helpers");

const getProfile = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.*, r.name as role_name, r.slug as role_slug
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) throw new AppError("User not found", 404);
    res.json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, bio, timezone, locale, headline, address, city, country, skills, socialLinks, education, experience } = req.body;
    const result = await pool.query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       phone = COALESCE($3, phone), bio = COALESCE($4, bio), timezone = COALESCE($5, timezone),
       locale = COALESCE($6, locale), headline = COALESCE($7, headline), address = COALESCE($8, address),
       city = COALESCE($9, city), country = COALESCE($10, country), skills = COALESCE($11, skills),
       social_links = COALESCE($12, social_links), education = COALESCE($13, education),
       experience = COALESCE($14, experience), updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [firstName, lastName, phone, bio, timezone, locale, headline, address, city, country, skills ? skills : null, socialLinks ? JSON.stringify(socialLinks) : null, education ? JSON.stringify(education) : null, experience ? JSON.stringify(experience) : null, req.userId]
    );
    res.json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const avatarUrl = `/uploads/images/${req.file.filename}`;
    const result = await pool.query(
      "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING *",
      [avatarUrl, req.userId]
    );
    res.json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search, isActive } = req.query;
    const { offset } = paginate(page, limit);
    let query = `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_verified,
                 u.is_active, u.is_locked, u.last_login_at, u.created_at, r.name as role_name, r.slug as role_slug
                 FROM users u JOIN roles r ON u.role_id = r.id WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (role) {
      query += ` AND r.slug = $${paramIndex++}`;
      params.push(role);
    }
    if (search) {
      query += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (isActive !== undefined) {
      query += ` AND u.is_active = $${paramIndex++}`;
      params.push(isActive === "true");
    }

    const countQuery = query.replace(
      /SELECT u\.id, u\.first_name, u\.last_name, u\.email, u\.phone, u\.avatar_url, u\.is_verified,\s*u\.is_active, u\.is_locked, u\.last_login_at, u\.created_at, r\.name as role_name, r\.slug as role_slug/g,
      "SELECT COUNT(*) as total"
    );

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({
      success: true,
      data: result.rows,
      pagination: buildPaginationMeta(total, parseInt(page), parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.*, r.name as role_name, r.slug as role_slug
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("User not found", 404);
    res.json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, roleId, phone, isActive } = req.body;
    if (!firstName || !lastName || !email || !password || !roleId) throw new AppError("firstName, lastName, email, password, roleId required", 400);
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) throw new AppError("Email already in use", 409);
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, role_id, phone, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
      [firstName, lastName, email, hashed, roleId, phone || null, isActive !== false]
    );
    res.status(201).json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, bio, password, isActive, isVerified, roleId } = req.body;
    if (email) {
      const dup = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2", [email, req.params.id]);
      if (dup.rows.length > 0) throw new AppError("Email already in use", 409);
    }
    let passwordCol = '';
    const params = [firstName || null, lastName || null, email || null, phone || null, bio || null, isActive !== undefined ? isActive : null, isVerified !== undefined ? isVerified : null, roleId || null, req.params.id];
    let idx = 10;
    if (password) {
      const hashed = await bcrypt.hash(password, 12);
      passwordCol = ', password = $10';
      params.push(hashed);
      idx = 11;
    }
    const result = await pool.query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       email = COALESCE($3, email), phone = COALESCE($4, phone), bio = COALESCE($5, bio),
       is_active = COALESCE($6, is_active), is_verified = COALESCE($7, is_verified),
       role_id = COALESCE($8, role_id)${passwordCol}, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new AppError("User not found", 404);
    res.json({ success: true, data: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.userId) throw new AppError("Cannot delete yourself", 400);
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("User not found", 404);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};

const lockUser = async (req, res, next) => {
  try {
    const { durationMinutes = 30 } = req.body;
    await pool.query(
      "UPDATE users SET is_locked = true, locked_until = NOW() + ($1 || '' minutes)::INTERVAL WHERE id = $2",
      [durationMinutes.toString(), req.params.id]
    );
    res.json({ success: true, message: "User locked" });
  } catch (error) {
    next(error);
  }
};

const unlockUser = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE users SET is_locked = false, locked_until = NULL, login_attempts = 0 WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true, message: "User unlocked" });
  } catch (error) {
    next(error);
  }
};

const getTeacherProfiles = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.bio,
              COUNT(DISTINCT c.id) as course_count, COALESCE(AVG(c.rating), 0) as avg_rating
       FROM users u
       LEFT JOIN courses c ON c.teacher_id = u.id AND c.is_published = true
       WHERE u.role_id = 3 AND u.is_active = true
       GROUP BY u.id
       ORDER BY avg_rating DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  lockUser,
  unlockUser,
  getTeacherProfiles,
};
