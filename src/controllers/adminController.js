const pool = require("../config/db");
const AppError = require("../utils/AppError");

const getPlatformSettings = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM system_settings ORDER BY key");
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
};

const updatePlatformSettings = async (req, res, next) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        "INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()",
        [key, JSON.stringify(value), req.userId]
      );
    }
    res.json({ success: true, message: "Settings updated" });
  } catch (error) { next(error); }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, entityType } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT al.*, u.first_name || ' ' || u.last_name as user_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
    const params = [];
    let p = 1;
    if (action) { query += ` AND al.action = $${p++}`; params.push(action); }
    if (entityType) { query += ` AND al.entity_type = $${p++}`; params.push(entityType); }
    query += ` ORDER BY al.created_at DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    const count = await pool.query("SELECT COUNT(*) as total FROM audit_logs");
    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].total) });
  } catch (error) { next(error); }
};

const getRoles = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM roles ORDER BY id");
    for (let role of result.rows) {
      const perms = await pool.query(
        `SELECT p.* FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
        [role.id]
      );
      role.permissions = perms.rows;
    }
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const createRole = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    const result = await pool.query(
      "INSERT INTO roles (name, slug, description) VALUES ($1, $2, $3) RETURNING *",
      [name, slug, description]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      "UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *",
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Role not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteRole = async (req, res, next) => {
  try {
    const role = await pool.query("SELECT is_system FROM roles WHERE id = $1", [req.params.id]);
    if (role.rows.length === 0) throw new AppError("Role not found", 404);
    if (role.rows[0].is_system) throw new AppError("Cannot delete system roles", 400);
    await pool.query("DELETE FROM roles WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Role deleted" });
  } catch (error) { next(error); }
};

const updateRolePermissions = async (req, res, next) => {
  try {
    const { permissionIds } = req.body;
    await pool.query("DELETE FROM role_permissions WHERE role_id = $1", [req.params.id]);
    for (const permId of permissionIds) {
      await pool.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [req.params.id, permId]
      );
    }
    res.json({ success: true, message: "Permissions updated" });
  } catch (error) { next(error); }
};

const getPermissions = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM permissions ORDER BY module, name");
    const grouped = {};
    result.rows.forEach(p => {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    });
    res.json({ success: true, data: grouped });
  } catch (error) { next(error); }
};

const getRoleById = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM roles WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Role not found", 404);
    const perms = await pool.query(
      `SELECT p.* FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
      [req.params.id]
    );
    result.rows[0].permissions = perms.rows;
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const createPermission = async (req, res, next) => {
  try {
    const { name, slug, description, module } = req.body;
    const result = await pool.query(
      "INSERT INTO permissions (name, slug, description, module) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, slug, description, module]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updatePermission = async (req, res, next) => {
  try {
    const { name, description, module } = req.body;
    const result = await pool.query(
      "UPDATE permissions SET name = COALESCE($1, name), description = COALESCE($2, description), module = COALESCE($3, module) WHERE id = $4 RETURNING *",
      [name, description, module, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Permission not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deletePermission = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM permissions WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Permission not found", 404);
    res.json({ success: true, message: "Permission deleted" });
  } catch (error) { next(error); }
};

const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const fileUrl = `/uploads/images/${req.file.filename}`;
    res.json({ success: true, data: { url: fileUrl, filename: req.file.filename } });
  } catch (error) { next(error); }
};

module.exports = {
  getPlatformSettings, updatePlatformSettings, getAuditLogs,
  getRoles, getRoleById, createRole, updateRole, deleteRole, updateRolePermissions,
  getPermissions, createPermission, updatePermission, deletePermission,
  uploadFile,
};
