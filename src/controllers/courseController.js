const pool = require("../config/db");
const AppError = require("../utils/AppError");
const { generateSlug, paginate, buildPaginationMeta } = require("../utils/helpers");
const { sendEnrollmentEmail } = require("../services/emailService");

const createCourse = async (req, res, next) => {
  try {
    const { categoryId, title, shortDescription, description, price, level, language, requirements, learningObjectives, targetAudience, tags } = req.body;
    let slug = generateSlug(title);
    const slugCheck = await pool.query("SELECT id FROM courses WHERE slug = $1", [slug]);
    if (slugCheck.rows.length > 0) slug = `${slug}-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO courses (category_id, teacher_id, title, slug, short_description, description, price, level, language, requirements, learning_objectives, target_audience, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [categoryId || null, req.userId, title, slug, shortDescription, description, price || 0, level || "beginner", language || "English", requirements, learningObjectives, targetAudience, tags || []]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getCourses = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, category, level, search, teacherId, isPublished, sortBy = "newest" } = req.query;
    const { offset } = paginate(page, limit);
    let query = `SELECT c.*, cat.name as category_name, u.first_name || ' ' || u.last_name as teacher_name, u.avatar_url as teacher_avatar
                 FROM courses c LEFT JOIN course_categories cat ON c.category_id = cat.id
                 LEFT JOIN users u ON c.teacher_id = u.id WHERE 1=1`;
    const params = [];
    let p = 1;

    if (category) { query += ` AND c.category_id = $${p++}`; params.push(category); }
    if (level) { query += ` AND c.level = $${p++}`; params.push(level); }
    if (search) { query += ` AND (c.title ILIKE $${p} OR c.short_description ILIKE $${p})`; params.push(`%${search}%`); p++; }
    if (teacherId) { query += ` AND c.teacher_id = $${p++}`; params.push(teacherId); }
    if (isPublished !== undefined) { query += ` AND c.is_published = $${p++}`; params.push(isPublished === "true"); }
    else if (!req.query.all) query += ` AND c.is_published = true`;

    const countQuery = query.replace(/SELECT c\.\*.*?FROM/, "SELECT COUNT(*) as total FROM");
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    const sortMap = { newest: "c.created_at DESC", oldest: "c.created_at ASC", price_asc: "c.price ASC", price_desc: "c.price DESC", rating: "c.rating DESC", popular: "c.enrollment_count DESC" };
    query += ` ORDER BY ${sortMap[sortBy] || "c.created_at DESC"} LIMIT $${p++} OFFSET $${p++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, pagination: buildPaginationMeta(total, parseInt(page), parseInt(limit)) });
  } catch (error) {
    next(error);
  }
};

const getCourseBySlug = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, cat.name as category_name, cat.slug as category_slug,
              u.first_name || ' ' || u.last_name as teacher_name, u.avatar_url as teacher_avatar, u.bio as teacher_bio,
              (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as enrolled_students
       FROM courses c LEFT JOIN course_categories cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.teacher_id = u.id WHERE c.slug = $1`,
      [req.params.slug]
    );
    if (result.rows.length === 0) throw new AppError("Course not found", 404);

    const modules = await pool.query(
      "SELECT * FROM course_modules WHERE course_id = $1 ORDER BY sort_order",
      [result.rows[0].id]
    );
    result.rows[0].modules = modules.rows;

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getCourseById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, cat.name as category_name, u.first_name || ' ' || u.last_name as teacher_name, u.avatar_url as teacher_avatar
       FROM courses c LEFT JOIN course_categories cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.teacher_id = u.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Course not found", 404);

    const modules = await pool.query(
      "SELECT * FROM course_modules WHERE course_id = $1 ORDER BY sort_order",
      [result.rows[0].id]
    );
    for (let mod of modules.rows) {
      const lessons = await pool.query(
        "SELECT * FROM lessons WHERE module_id = $1 ORDER BY sort_order",
        [mod.id]
      );
      mod.lessons = lessons.rows;
    }
    result.rows[0].modules = modules.rows;

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateCourse = async (req, res, next) => {
  try {
    const allowedFields = ["title", "shortDescription", "description", "categoryId", "price", "discountPrice", "level", "language", "requirements", "learningObjectives", "targetAudience", "tags", "thumbnailUrl", "previewVideoUrl", "isFeatured", "isFree", "hasCertificate", "maxStudents", "status"];
    const updates = [];
    const params = [];
    let p = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
        updates.push(`${dbField} = $${p++}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) throw new AppError("No fields to update", 400);
    params.push(req.params.id);
    updates.push("updated_at = NOW()");

    const result = await pool.query(
      `UPDATE courses SET ${updates.join(", ")} WHERE id = $${p} RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new AppError("Course not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteCourse = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM courses WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Course not found", 404);
    res.json({ success: true, message: "Course deleted" });
  } catch (error) {
    next(error);
  }
};

const publishCourse = async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE courses SET is_published = NOT is_published, status = CASE WHEN is_published THEN 'draft' ELSE 'published' END, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Course not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const enrollCourse = async (req, res, next) => {
  try {
    const { courseId } = req.body;
    const course = await pool.query(
      "SELECT id, price, is_free, max_students, enrollment_count FROM courses WHERE id = $1 AND is_published = true",
      [courseId]
    );
    if (course.rows.length === 0) throw new AppError("Course not found or not published", 404);

    const existingEnrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
      [req.userId, courseId]
    );
    if (existingEnrollment.rows.length > 0) throw new AppError("Already enrolled in this course", 409);

    const lessonCount = await pool.query(
      "SELECT COUNT(*) as total FROM lessons l JOIN course_modules cm ON l.module_id = cm.id WHERE cm.course_id = $1 AND l.is_published = true",
      [courseId]
    );

    const result = await pool.query(
      `INSERT INTO enrollments (user_id, course_id, total_lessons) VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, courseId, parseInt(lessonCount.rows[0].total)]
    );

    await pool.query("UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE id = $1", [courseId]);

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const courseDetail = await pool.query("SELECT * FROM courses WHERE id = $1", [courseId]);
    if (userResult.rows.length > 0 && courseDetail.rows.length > 0) {
      sendEnrollmentEmail(userResult.rows[0], courseDetail.rows[0]).catch(console.error);
    }

    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`user:${req.userId}`).emit("enrollment:new", result.rows[0]);
        io.to("dashboard:admin").emit("dashboard:update", { type: "enrollment:new", enrollmentId: result.rows[0].id });
        const teacherResult = await pool.query("SELECT teacher_id FROM courses WHERE id = $1", [courseId]);
        if (teacherResult.rows.length > 0) {
          io.to(`user:${teacherResult.rows[0].teacher_id}`).emit("enrollment:new", result.rows[0]);
          io.to("dashboard:teacher").emit("dashboard:update", { type: "enrollment:new", enrollmentId: result.rows[0].id });
        }
      }
    } catch (e) {}

    if (!course.rows[0].is_free && course.rows[0].price > 0) {
      res.status(201).json({
        success: true,
        message: "Enrolled successfully. Please complete payment to access the course.",
        data: result.rows[0],
      });
    } else {
      res.status(201).json({
        success: true,
        message: "Enrolled successfully",
        data: result.rows[0],
      });
    }
  } catch (error) {
    next(error);
  }
};

const getMyCourses = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `SELECT e.*, c.title, c.slug, c.thumbnail_url, c.level, c.has_certificate,
                        cat.name as category_name, u.first_name || ' ' || u.last_name as teacher_name, u.avatar_url as teacher_avatar
                 FROM enrollments e JOIN courses c ON e.course_id = c.id
                 LEFT JOIN course_categories cat ON c.category_id = cat.id
                 LEFT JOIN users u ON c.teacher_id = u.id
                 WHERE e.user_id = $1`;
    const params = [req.userId];
    if (status) { query += ` AND e.status = $2`; params.push(status); }
    query += " ORDER BY e.enrolled_at DESC";
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const getTeacherCourses = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, cat.name as category_name,
              (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as student_count
       FROM courses c LEFT JOIN course_categories cat ON c.category_id = cat.id
       WHERE c.teacher_id = $1 ORDER BY c.created_at DESC`,
      [req.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const getCourseStudents = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, e.enrolled_at, e.progress, e.completed_lessons, e.total_lessons, e.is_completed, e.status
       FROM enrollments e JOIN users u ON e.user_id = u.id
       WHERE e.course_id = $1 ORDER BY e.enrolled_at DESC`,
      [req.params.courseId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Categories
const getCategoryById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cat.*, (SELECT COUNT(*) FROM courses WHERE category_id = cat.id AND is_published = true) as course_count
       FROM course_categories cat WHERE cat.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Category not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT cat.*, (SELECT COUNT(*) FROM courses WHERE category_id = cat.id AND is_published = true) as course_count FROM course_categories cat ORDER BY cat.sort_order"
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, parentId, sortOrder } = req.body;
    const slug = generateSlug(name);
    const result = await pool.query(
      "INSERT INTO course_categories (name, slug, description, icon, color, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [name, slug, description, icon, color, parentId, sortOrder || 0]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, parentId, sortOrder, isActive } = req.body;
    const result = await pool.query(
      "UPDATE course_categories SET name = COALESCE($1, name), description = COALESCE($2, description), icon = COALESCE($3, icon), color = COALESCE($4, color), parent_id = $5, sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $8 RETURNING *",
      [name, description, icon, color, parentId, sortOrder, isActive, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Category not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM course_categories WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Category not found", 404);
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    next(error);
  }
};

// Modules
const getModules = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    let query = `SELECT cm.*, (SELECT COUNT(*) FROM lessons WHERE module_id = cm.id) as lesson_count
                 FROM course_modules cm WHERE 1=1`;
    const params = [];
    if (courseId) { query += ` AND cm.course_id = $1`; params.push(courseId); }
    query += ` ORDER BY cm.sort_order`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const getModuleById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cm.*, (SELECT COUNT(*) FROM lessons WHERE module_id = cm.id) as lesson_count
       FROM course_modules cm WHERE cm.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Module not found", 404);
    const lessons = await pool.query(
      "SELECT * FROM lessons WHERE module_id = $1 ORDER BY sort_order",
      [result.rows[0].id]
    );
    result.rows[0].lessons = lessons.rows;
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const createModule = async (req, res, next) => {
  try {
    const { courseId, title, description } = req.body;
    const maxSort = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM course_modules WHERE course_id = $1", [courseId]);
    const result = await pool.query(
      "INSERT INTO course_modules (course_id, title, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING *",
      [courseId, title, description, maxSort.rows[0].next]
    );
    await pool.query("UPDATE courses SET total_modules = (SELECT COUNT(*) FROM course_modules WHERE course_id = $1) WHERE id = $1", [courseId]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateModule = async (req, res, next) => {
  try {
    const { title, description, sortOrder, isPublished } = req.body;
    const result = await pool.query(
      "UPDATE course_modules SET title = COALESCE($1, title), description = COALESCE($2, description), sort_order = COALESCE($3, sort_order), is_published = COALESCE($4, is_published) WHERE id = $5 RETURNING *",
      [title, description, sortOrder, isPublished, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Module not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteModule = async (req, res, next) => {
  try {
    const mod = await pool.query("SELECT course_id FROM course_modules WHERE id = $1", [req.params.id]);
    if (mod.rows.length === 0) throw new AppError("Module not found", 404);
    await pool.query("DELETE FROM course_modules WHERE id = $1", [req.params.id]);
    await pool.query("UPDATE courses SET total_modules = (SELECT COUNT(*) FROM course_modules WHERE course_id = $1) WHERE id = $1", [mod.rows[0].course_id]);
    res.json({ success: true, message: "Module deleted" });
  } catch (error) {
    next(error);
  }
};

const reorderModules = async (req, res, next) => {
  try {
    const { moduleIds } = req.body;
    for (let i = 0; i < moduleIds.length; i++) {
      await pool.query("UPDATE course_modules SET sort_order = $1 WHERE id = $2", [i, moduleIds[i]]);
    }
    res.json({ success: true, message: "Modules reordered" });
  } catch (error) {
    next(error);
  }
};

// Lessons
const createLesson = async (req, res, next) => {
  try {
    const { moduleId, title, description, contentType, videoUrl, pdfUrl, articleContent, isFree, durationMinutes } = req.body;
    const maxSort = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM lessons WHERE module_id = $1", [moduleId]);
    const result = await pool.query(
      `INSERT INTO lessons (module_id, title, description, content_type, video_url, pdf_url, article_content, is_free, duration_minutes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [moduleId, title, description, contentType || "video", videoUrl, pdfUrl, articleContent, isFree || false, durationMinutes || 0, maxSort.rows[0].next]
    );
    const mod = await pool.query("SELECT course_id FROM course_modules WHERE id = $1", [moduleId]);
    await pool.query("UPDATE courses SET total_lessons = (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id WHERE cm.course_id = $1) WHERE id = $1", [mod.rows[0].course_id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateLesson = async (req, res, next) => {
  try {
    const { title, description, contentType, videoUrl, videoDuration, pdfUrl, articleContent, isFree, isPublished, durationMinutes, sortOrder } = req.body;
    const result = await pool.query(
      `UPDATE lessons SET title = COALESCE($1, title), description = COALESCE($2, description), content_type = COALESCE($3, content_type),
       video_url = COALESCE($4, video_url), video_duration = COALESCE($5, video_duration), pdf_url = COALESCE($6, pdf_url),
       article_content = COALESCE($7, article_content), is_free = COALESCE($8, is_free), is_published = COALESCE($9, is_published),
       duration_minutes = COALESCE($10, duration_minutes), sort_order = COALESCE($11, sort_order)
       WHERE id = $12 RETURNING *`,
      [title, description, contentType, videoUrl, videoDuration, pdfUrl, articleContent, isFree, isPublished, durationMinutes, sortOrder, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Lesson not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteLesson = async (req, res, next) => {
  try {
    const lesson = await pool.query("SELECT m.course_id FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE l.id = $1", [req.params.id]);
    if (lesson.rows.length === 0) throw new AppError("Lesson not found", 404);
    await pool.query("DELETE FROM lessons WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Lesson deleted" });
  } catch (error) {
    next(error);
  }
};

const reorderLessons = async (req, res, next) => {
  try {
    const { lessonIds } = req.body;
    for (let i = 0; i < lessonIds.length; i++) {
      await pool.query("UPDATE lessons SET sort_order = $1 WHERE id = $2", [i, lessonIds[i]]);
    }
    res.json({ success: true, message: "Lessons reordered" });
  } catch (error) {
    next(error);
  }
};

const updateLessonVideo = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No video file uploaded", 400);
    const videoUrl = `/uploads/videos/${req.file.filename}`;
    const result = await pool.query(
      "UPDATE lessons SET video_url = $1 WHERE id = $2 RETURNING *",
      [videoUrl, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Lesson not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateLessonPdf = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No PDF file uploaded", 400);
    const pdfUrl = `/uploads/pdfs/${req.file.filename}`;
    const result = await pool.query(
      "UPDATE lessons SET pdf_url = $1 WHERE id = $2 RETURNING *",
      [pdfUrl, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Lesson not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getLessonById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT l.*, cm.title as module_title, cm.course_id
       FROM lessons l JOIN course_modules cm ON l.module_id = cm.id WHERE l.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Lesson not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getCourseLessons = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT l.*, cm.title as module_title, cm.course_id
       FROM lessons l JOIN course_modules cm ON l.module_id = cm.id
       WHERE cm.course_id = $1 AND l.is_published = true
       ORDER BY cm.sort_order, l.sort_order`,
      [req.params.courseId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Progress
const updateLessonProgress = async (req, res, next) => {
  try {
    const { lessonId, watchedDuration, isCompleted } = req.body;
    const enrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = (SELECT cm.course_id FROM lessons l JOIN course_modules cm ON l.module_id = cm.id WHERE l.id = $2)",
      [req.userId, lessonId]
    );
    if (enrollment.rows.length === 0) throw new AppError("Not enrolled in this course", 403);

    await pool.query(
      `INSERT INTO course_progress (enrollment_id, lesson_id, watched_duration, is_completed, completed_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END)
       ON CONFLICT (enrollment_id, lesson_id)
       DO UPDATE SET watched_duration = $3, is_completed = $4, completed_at = CASE WHEN $4 THEN NOW() ELSE course_progress.completed_at END, updated_at = NOW()`,
      [enrollment.rows[0].id, lessonId, watchedDuration || 0, isCompleted || false]
    );

    res.json({ success: true, message: "Progress updated" });
  } catch (error) {
    next(error);
  }
};

const getCourseProgress = async (req, res, next) => {
  try {
    const enrollment = await pool.query(
      "SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2",
      [req.userId, req.params.courseId]
    );
    if (enrollment.rows.length === 0) throw new AppError("Not enrolled", 404);

    const progress = await pool.query(
      `SELECT cp.*, l.title as lesson_title, l.content_type, l.duration_minutes
       FROM course_progress cp JOIN lessons l ON cp.lesson_id = l.id
       WHERE cp.enrollment_id = $1 ORDER BY l.sort_order`,
      [enrollment.rows[0].id]
    );

    res.json({
      success: true,
      data: {
        enrollment: enrollment.rows[0],
        lessons: progress.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Reviews
const getReviewById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cr.*, u.first_name || ' ' || u.last_name as user_name, u.avatar_url
       FROM course_reviews cr JOIN users u ON cr.user_id = u.id WHERE cr.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Review not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateReview = async (req, res, next) => {
  try {
    const { rating, title, comment, isApproved } = req.body;
    const result = await pool.query(
      `UPDATE course_reviews SET rating = COALESCE($1, rating), title = COALESCE($2, title),
       comment = COALESCE($3, comment), is_approved = COALESCE($4, is_approved) WHERE id = $5 RETURNING *`,
      [rating, title, comment, isApproved, req.params.id]
    );
    if (result.rows.length === 0) throw new AppError("Review not found", 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteReview = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM course_reviews WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new AppError("Review not found", 404);
    res.json({ success: true, message: "Review deleted" });
  } catch (error) { next(error); }
};

const createReview = async (req, res, next) => {
  try {
    const { courseId, rating, title, comment } = req.body;
    const enrollment = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'",
      [req.userId, courseId]
    );
    if (enrollment.rows.length === 0) throw new AppError("Must be enrolled to review", 403);

    const result = await pool.query(
      "INSERT INTO course_reviews (course_id, user_id, rating, title, comment) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (course_id, user_id) DO UPDATE SET rating = $3, title = $4, comment = $5, updated_at = NOW() RETURNING *",
      [courseId, req.userId, rating, title, comment]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const getCourseReviews = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cr.*, u.first_name || ' ' || u.last_name as user_name, u.avatar_url
       FROM course_reviews cr JOIN users u ON cr.user_id = u.id
       WHERE cr.course_id = $1 AND cr.is_approved = true
       ORDER BY cr.created_at DESC`,
      [req.params.courseId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCourse, getCourses, getCourseBySlug, getCourseById, updateCourse, deleteCourse, publishCourse,
  enrollCourse, getMyCourses, getTeacherCourses, getCourseStudents,
  getCategories, getCategoryById, createCategory, updateCategory, deleteCategory,
  getModules, getModuleById, createModule, updateModule, deleteModule, reorderModules,
  getLessonById, createLesson, updateLesson, deleteLesson, reorderLessons, updateLessonVideo, updateLessonPdf, getCourseLessons,
  updateLessonProgress, getCourseProgress,
  getReviewById, updateReview, deleteReview, createReview, getCourseReviews,
};
