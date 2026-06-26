const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { v4: uuidv4 } = require("uuid");

const createMeeting = async (req, res, next) => {
  try {
    const { courseId, title, description, scheduledAt, durationMinutes, maxParticipants, isRecurring, recurringPattern } = req.body;
    const meetingId = uuidv4().slice(0, 8);
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();
    const meetingUrl = `https://8x8.vc/jaas/${meetingId}`;

    const result = await pool.query(
      `INSERT INTO meetings (course_id, teacher_id, title, description, meeting_url, meeting_id, passcode, scheduled_at, duration_minutes, max_participants, is_recurring, recurring_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [courseId, req.userId, title, description, meetingUrl, meetingId, passcode, scheduledAt, durationMinutes || 60, maxParticipants || 100, isRecurring || false, recurringPattern || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getMeetings = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    let query = `SELECT m.*, c.title as course_title, u.first_name || ' ' || u.last_name as teacher_name
                 FROM meetings m JOIN courses c ON m.course_id = c.id
                 JOIN users u ON m.teacher_id = u.id WHERE 1=1`;
    const params = [];
    let p = 1;
    if (courseId) { query += ` AND m.course_id = $${p++}`; params.push(courseId); }
    query += ` ORDER BY m.scheduled_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getMeetingById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT m.*, c.title as course_title, u.first_name || ' ' || u.last_name as teacher_name
       FROM meetings m JOIN courses c ON m.course_id = c.id
       JOIN users u ON m.teacher_id = u.id WHERE m.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Meeting not found", 404);

    const attendees = await pool.query(
      `SELECT ma.*, u.first_name || ' ' || u.last_name as user_name, u.avatar_url
       FROM meeting_attendees ma JOIN users u ON ma.user_id = u.id WHERE ma.meeting_id = $1`,
      [req.params.id]
    );
    result.rows[0].attendees = attendees.rows;

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateMeeting = async (req, res, next) => {
  try {
    const { title, description, scheduledAt, durationMinutes, maxParticipants, status, recordingUrl } = req.body;
    const result = await pool.query(
      `UPDATE meetings SET title = COALESCE($1, title), description = COALESCE($2, description), scheduled_at = COALESCE($3, scheduled_at),
       duration_minutes = COALESCE($4, duration_minutes), max_participants = COALESCE($5, max_participants),
       status = COALESCE($6, status), recording_url = COALESCE($7, recording_url) WHERE id = $8 RETURNING *`,
      [title, description, scheduledAt, durationMinutes, maxParticipants, status, recordingUrl, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Meeting not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteMeeting = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM meetings WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Meeting not found", 404);
    res.json({ success: true, message: "Meeting deleted" });
  } catch (error) { next(error); }
};

const joinMeeting = async (req, res, next) => {
  try {
    const { meetingId } = req.params;
    const meeting = await pool.query("SELECT * FROM meetings WHERE id = $1 AND status IN ('scheduled', 'live')", [meetingId]);
    if (meeting.rows.length === 0) throw new AppError("Meeting not found or not available", 404);

    await pool.query(
      "INSERT INTO meeting_attendees (meeting_id, user_id, joined_at, is_host) VALUES ($1, $2, NOW(), $3) ON CONFLICT DO NOTHING",
      [meetingId, req.userId, req.userRole === "teacher"]
    );

    res.json({ success: true, data: meeting.rows[0] });
  } catch (error) { next(error); }
};

const leaveMeeting = async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE meeting_attendees SET left_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - joined_at)) WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [req.params.meetingId, req.userId]
    );
    res.json({ success: true, message: "Left meeting" });
  } catch (error) { next(error); }
};

const getJaaSToken = async (req, res, next) => {
  try {
    const meeting = await pool.query("SELECT * FROM meetings WHERE id = $1", [req.params.id]);
    if (meeting.rows.length === 0) throw new AppError("Meeting not found", 404);
    const jwt = require("jsonwebtoken");
    const env = require("../config/env");
    if (!env.JAAS_APP_ID) throw new AppError("JAAS_APP_ID is not configured. Contact the administrator.", 503);

    const now = Math.floor(Date.now() / 1000);
    const isModerator = req.userRole === "teacher" || req.userRole === "admin" || req.userRole === "super-admin";
    const roomFull = `${env.JAAS_APP_ID}/${meeting.rows[0].meeting_id}`;

    const payload = {
      aud: "jitsi",
      iss: "chat",
      sub: env.JAAS_APP_ID,
      room: roomFull,
      exp: now + 7200,
      nbf: now,
      context: {
        user: {
          id: req.userId,
          name: `${req.user.first_name} ${req.user.last_name}`,
          email: req.user.email,
          avatar: req.user.avatar_url || "",
          moderator: isModerator
        },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false,
          "outbound-call": false
        }
      }
    };

    let signingKey, alg;
    if (env.JAAS_PRIVATE_KEY) {
      signingKey = env.JAAS_PRIVATE_KEY;
      alg = "RS256";
    } else if (env.JAAS_APP_KEY) {
      signingKey = env.JAAS_APP_KEY;
      alg = "HS256";
    } else {
      throw new AppError("JaaS signing key not configured. Set JAAS_PRIVATE_KEY (RS256) in .env.", 503);
    }

    const header = { alg };
    if (alg === "RS256") {
      header.kid = env.JAAS_APP_ID;
    } else if (alg === "HS256") {
      const parts = env.JAAS_APP_KEY?.split("/");
      if (parts?.length > 1) header.kid = parts[1];
    }
    const signOptions = { algorithm: alg, header };
    const token = jwt.sign(payload, signingKey, signOptions);

    res.json({
      success: true,
      data: {
        token,
        meetingId: meeting.rows[0].meeting_id,
        room: roomFull,
        appId: env.JAAS_APP_ID,
        domain: env.JAAS_DOMAIN || "8x8.vc"
      }
    });
  } catch (error) { next(error); }
};

module.exports = {
  createMeeting, getMeetings, getMeetingById, updateMeeting, deleteMeeting, joinMeeting, leaveMeeting, getJaaSToken,
};
