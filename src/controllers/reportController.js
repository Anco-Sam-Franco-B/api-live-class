const pool = require("../config/db");

const getStudentReport = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.userId;
    const [enrollments, grades, attendance, assignments, payments] = await Promise.all([
      pool.query(
        `SELECT e.*, c.title, c.slug, c.thumbnail_url, cat.name as category_name FROM enrollments e JOIN courses c ON e.course_id = c.id LEFT JOIN course_categories cat ON c.category_id = cat.id WHERE e.user_id = $1`,
        [studentId]
      ),
      pool.query(
        `SELECT g.*, a.title as item_name, c.title as course_title FROM grades g JOIN enrollments e ON g.enrollment_id = e.id JOIN courses c ON e.course_id = c.id LEFT JOIN assignments a ON g.assignment_id = a.id WHERE e.user_id = $1 ORDER BY g.created_at DESC`,
        [studentId]
      ),
      pool.query(
        `SELECT a.*, m.title as meeting_title FROM attendance a JOIN meetings m ON a.meeting_id = m.id WHERE a.student_id = $1 ORDER BY a.created_at DESC`,
        [studentId]
      ),
      pool.query(
        `SELECT asub.*, a.title as assignment_title, a.total_points, a.due_date FROM assignment_submissions asub JOIN assignments a ON asub.assignment_id = a.id WHERE asub.student_id = $1 ORDER BY asub.submitted_at DESC`,
        [studentId]
      ),
      pool.query(
        `SELECT p.* FROM payments p WHERE p.user_id = $1 AND p.status = 'completed' ORDER BY p.paid_at DESC`,
        [studentId]
      ),
    ]);

    const now = new Date();
    const pendingAssignments = assignments.rows.filter(a => a.status !== 'graded' && new Date(a.due_date) > now);
    const overdueAssignments = assignments.rows.filter(a => a.status !== 'graded' && new Date(a.due_date) < now);

    res.json({
      success: true,
      data: {
        enrollments: enrollments.rows,
        grades: grades.rows,
        attendance: attendance.rows,
        assignments: assignments.rows,
        payments: payments.rows,
        totalCourses: enrollments.rows.length,
        completedCourses: enrollments.rows.filter(e => e.is_completed).length,
        activeCourses: enrollments.rows.filter(e => e.status === 'active').length,
        averageGrade: grades.rows.length > 0 ? grades.rows.reduce((s, g) => s + parseFloat(g.percentage), 0) / grades.rows.length : 0,
        totalSpent: payments.rows.reduce((s, p) => s + parseFloat(p.amount), 0),
        pendingAssignments: pendingAssignments.length,
        overdueAssignments: overdueAssignments.length,
        attendanceRate: attendance.rows.length > 0
          ? Math.round((attendance.rows.filter(a => a.status === 'present').length / attendance.rows.length) * 100)
          : 0,
      },
    });
  } catch (error) { next(error); }
};

const getTeacherReport = async (req, res, next) => {
  try {
    const teacherId = req.params.teacherId || req.userId;
    const [courses, enrollments, meetings, grades, payments] = await Promise.all([
      pool.query("SELECT c.*, (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count, (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as active_students FROM courses c WHERE c.teacher_id = $1 ORDER BY c.created_at DESC", [teacherId]),
      pool.query(
        `SELECT e.enrolled_at::date as date, COUNT(*) as count FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE c.teacher_id = $1 GROUP BY e.enrolled_at::date ORDER BY date`,
        [teacherId]
      ),
      pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled FROM meetings WHERE teacher_id = $1", [teacherId]),
      pool.query(
        `SELECT g.letter_grade, COUNT(*) as count FROM grades g JOIN enrollments e ON g.enrollment_id = e.id JOIN courses c ON e.course_id = c.id WHERE c.teacher_id = $1 GROUP BY g.letter_grade`,
        [teacherId]
      ),
      pool.query(
        "SELECT COALESCE(SUM(p.amount), 0) as revenue, COALESCE(SUM(CASE WHEN p.paid_at::date = CURRENT_DATE THEN p.amount ELSE 0 END), 0) as today_revenue, COUNT(*) as total_transactions FROM payments p JOIN enrollments e ON p.enrollment_id = e.id JOIN courses c ON e.course_id = c.id WHERE c.teacher_id = $1 AND p.status = 'completed'",
        [teacherId]
      ),
    ]);

    const totalStudents = courses.rows.reduce((sum, c) => sum + parseInt(c.student_count), 0);
    const gradeMap = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    grades.rows.forEach(g => { if (gradeMap[g.letter_grade] !== undefined) gradeMap[g.letter_grade] = parseInt(g.count); });

    const enrollmentTrend = enrollments.rows;
    if (enrollmentTrend.length === 0) {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        enrollmentTrend.push({ date: d.toISOString().slice(0, 10), count: 0 });
      }
    }

    const recentEnrollments = await pool.query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as student_name, c.title as course_title FROM enrollments e JOIN users u ON e.user_id = u.id JOIN courses c ON e.course_id = c.id WHERE c.teacher_id = $1 ORDER BY e.enrolled_at DESC LIMIT 5`,
      [teacherId]
    );

    res.json({
      success: true,
      data: {
        courses: courses.rows,
        enrollmentTrend,
        meetings: meetings.rows[0],
        recentEnrollments: recentEnrollments.rows,
        totalStudents,
        activeStudents: courses.rows.reduce((sum, c) => sum + parseInt(c.active_students), 0),
        totalCourses: courses.rows.length,
        publishedCourses: courses.rows.filter(c => c.is_published).length,
        revenue: parseFloat(payments.rows[0].revenue),
        todayRevenue: parseFloat(payments.rows[0].today_revenue),
        totalTransactions: parseInt(payments.rows[0].total_transactions),
        ...gradeMap,
      },
    });
  } catch (error) { next(error); }
};

const getRevenueReport = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = "month" } = req.query;
    let dateTrunc = "month";
    if (groupBy === "day") dateTrunc = "day";
    if (groupBy === "week") dateTrunc = "week";
    if (groupBy === "year") dateTrunc = "year";

    let query = `SELECT DATE_TRUNC($1, paid_at) as date, COUNT(*) as transactions, SUM(amount) as revenue, currency FROM payments WHERE status = 'completed'`;
    const params = [dateTrunc];
    let p = 2;
    if (startDate) { query += ` AND paid_at >= $${p++}`; params.push(startDate); }
    if (endDate) { query += ` AND paid_at <= $${p++}`; params.push(endDate); }
    query += ` GROUP BY date, currency ORDER BY date`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getAttendanceReport = async (req, res, next) => {
  try {
    const { courseId, startDate, endDate } = req.query;
    let query = `SELECT a.status, COUNT(*) as count FROM attendance a JOIN meetings m ON a.meeting_id = m.id WHERE 1=1`;
    const params = [];
    let p = 1;
    if (courseId) { query += ` AND m.course_id = $${p++}`; params.push(courseId); }
    if (startDate) { query += ` AND a.created_at >= $${p++}`; params.push(startDate); }
    if (endDate) { query += ` AND a.created_at <= $${p++}`; params.push(endDate); }
    query += ` GROUP BY a.status`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getEnrollmentReport = async (req, res, next) => {
  try {
    const { groupBy = "month", startDate, endDate } = req.query;
    let dateTrunc = groupBy === "day" ? "day" : groupBy === "week" ? "week" : "month";
    let query = `SELECT DATE_TRUNC($1, enrolled_at) as date, COUNT(*) as enrollments FROM enrollments WHERE 1=1`;
    const params = [dateTrunc];
    let p = 2;
    if (startDate) { query += ` AND enrolled_at >= $${p++}`; params.push(startDate); }
    if (endDate) { query += ` AND enrolled_at <= $${p++}`; params.push(endDate); }
    query += ` GROUP BY date ORDER BY date`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      totalUsers, totalCourses, totalEnrollments, totalRevenue,
      recentEnrollments, courseStats, userByRole,
      todayStats, monthStats, topCourses,
      enrollmentTrend, revenueTrend,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM users WHERE is_active = true"),
      pool.query("SELECT COUNT(*) as count FROM courses WHERE is_published = true"),
      pool.query("SELECT COUNT(*) as count FROM enrollments WHERE status = 'active'"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'"),
      pool.query(`SELECT e.*, u.first_name || ' ' || u.last_name as student_name, c.title as course_title FROM enrollments e JOIN users u ON e.user_id = u.id JOIN courses c ON e.course_id = c.id ORDER BY e.enrolled_at DESC LIMIT 10`),
      pool.query(`SELECT c.title, COUNT(e.id) as enrollments FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.status = 'active' WHERE c.is_published = true GROUP BY c.id, c.title ORDER BY enrollments DESC LIMIT 10`),
      pool.query(`SELECT r.slug, COUNT(u.id) as count FROM users u JOIN roles r ON u.role_id = r.id WHERE u.is_active = true GROUP BY r.slug`),
      pool.query(`SELECT COUNT(*)::int as new_users, (SELECT COALESCE(SUM(amount), 0) as revenue FROM payments WHERE status = 'completed' AND paid_at >= $1) as today_revenue, (SELECT COUNT(*)::int as enrollments FROM enrollments WHERE enrolled_at >= $1) as today_enrollments, (SELECT COUNT(*)::int as payments FROM payments WHERE status = 'completed' AND paid_at >= $1) as today_payments`, [startOfToday]),
      pool.query(`SELECT COUNT(*)::int as month_users, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed' AND paid_at >= $1) as month_revenue, (SELECT COUNT(*)::int FROM enrollments WHERE enrolled_at >= $1) as month_enrollments`, [startOfMonth]),
      pool.query(`SELECT c.id, c.title, c.slug, c.thumbnail_url, COUNT(e.id)::int as enrolled, COALESCE(AVG(cr.rating), 0)::float as avg_rating FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.status = 'active' LEFT JOIN course_reviews cr ON cr.course_id = c.id WHERE c.is_published = true GROUP BY c.id ORDER BY enrolled DESC LIMIT 5`),
      pool.query(`SELECT DATE_TRUNC('month', enrolled_at) as month, COUNT(*) as count FROM enrollments WHERE enrolled_at > NOW() - INTERVAL '12 months' GROUP BY month ORDER BY month`),
      pool.query(`SELECT DATE_TRUNC('month', paid_at) as month, SUM(amount) as revenue, COUNT(*) as transactions FROM payments WHERE status = 'completed' AND paid_at > NOW() - INTERVAL '12 months' GROUP BY month ORDER BY month`),
    ]);

    const roleCounts = { studentCount: 0, teacherCount: 0, adminCount: 0 };
    userByRole.rows.forEach(r => {
      if (r.slug === 'student') roleCounts.studentCount = parseInt(r.count);
      if (r.slug === 'teacher') roleCounts.teacherCount = parseInt(r.count);
      if (r.slug === 'admin' || r.slug === 'super-admin') roleCounts.adminCount = (roleCounts.adminCount || 0) + parseInt(r.count);
    });

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        totalCourses: parseInt(totalCourses.rows[0].count),
        totalEnrollments: parseInt(totalEnrollments.rows[0].count),
        totalRevenue: parseFloat(totalRevenue.rows[0].total),
        recentEnrollments: recentEnrollments.rows,
        courseStats: courseStats.rows,
        topCourses: topCourses.rows,
        today: {
          newUsers: parseInt(todayStats.rows[0].new_users),
          revenue: parseFloat(todayStats.rows[0].today_revenue),
          enrollments: parseInt(todayStats.rows[0].today_enrollments),
          payments: parseInt(todayStats.rows[0].today_payments),
        },
        month: {
          newUsers: parseInt(monthStats.rows[0].month_users),
          revenue: parseFloat(monthStats.rows[0].month_revenue),
          enrollments: parseInt(monthStats.rows[0].month_enrollments),
        },
        enrollmentTrend: enrollmentTrend.rows.map(r => ({ date: r.month, count: parseInt(r.count) })),
        revenueTrend: revenueTrend.rows,
        ...roleCounts,
        lastUpdated: now.toISOString(),
      },
    });
  } catch (error) { next(error); }
};

module.exports = {
  getStudentReport, getTeacherReport, getRevenueReport, getAttendanceReport, getEnrollmentReport, getDashboardStats,
};
