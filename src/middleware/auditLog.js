const pool = require("../config/db");

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode < 400) {
        const entityId = req.params.id || body?.id || body?.data?.id || null;
        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.userId,
            action,
            entityType,
            entityId,
            req.oldData ? JSON.stringify(req.oldData) : null,
            body ? JSON.stringify(body) : null,
            req.ip,
            req.headers["user-agent"],
          ]
        ).catch((err) => console.error("Audit log error:", err));
      }
      return originalJson(body);
    };
    next();
  };
};

module.exports = auditLog;
