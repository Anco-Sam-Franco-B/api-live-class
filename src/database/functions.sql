-- ============================================
-- Live Class Code - Database Functions
-- ============================================

-- Update course rating based on reviews
CREATE OR REPLACE FUNCTION update_course_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE courses SET
    rating = (SELECT COALESCE(AVG(rating::numeric), 0) FROM course_reviews WHERE course_id = NEW.course_id AND is_approved = true),
    rating_count = (SELECT COUNT(*) FROM course_reviews WHERE course_id = NEW.course_id AND is_approved = true)
  WHERE id = NEW.course_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update enrollment progress
CREATE OR REPLACE FUNCTION update_enrollment_progress()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE enrollments SET
    completed_lessons = (SELECT COUNT(*) FROM course_progress WHERE enrollment_id = NEW.enrollment_id AND is_completed = true),
    total_lessons = (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id JOIN courses c ON cm.course_id = c.id JOIN enrollments e ON e.course_id = c.id WHERE e.id = NEW.enrollment_id AND l.is_published = true),
    progress = CASE 
      WHEN (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id JOIN courses c ON cm.course_id = c.id JOIN enrollments e ON e.course_id = c.id WHERE e.id = NEW.enrollment_id AND l.is_published = true) > 0
      THEN ((SELECT COUNT(*) FROM course_progress WHERE enrollment_id = NEW.enrollment_id AND is_completed = true)::decimal / 
            (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id JOIN courses c ON cm.course_id = c.id JOIN enrollments e ON e.course_id = c.id WHERE e.id = NEW.enrollment_id AND l.is_published = true)::decimal) * 100
      ELSE 0
    END,
    is_completed = CASE
      WHEN (SELECT COUNT(*) FROM course_progress WHERE enrollment_id = NEW.enrollment_id AND is_completed = true) >= 
           (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id JOIN courses c ON cm.course_id = c.id JOIN enrollments e ON e.course_id = c.id WHERE e.id = NEW.enrollment_id AND l.is_published = true)
      THEN true ELSE false
    END,
    completed_at = CASE
      WHEN (SELECT COUNT(*) FROM course_progress WHERE enrollment_id = NEW.enrollment_id AND is_completed = true) >= 
           (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON l.module_id = cm.id JOIN courses c ON cm.course_id = c.id JOIN enrollments e ON e.course_id = c.id WHERE e.id = NEW.enrollment_id AND l.is_published = true)
      THEN CURRENT_TIMESTAMP ELSE completed_at
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.enrollment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  seq_num INTEGER;
BEGIN
  year_prefix := TO_CHAR(CURRENT_TIMESTAMP, 'YYYY') || 'INV';
  seq_num := nextval('invoice_seq');
  NEW.invoice_number := year_prefix || LPAD(seq_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate certificate number
CREATE OR REPLACE FUNCTION generate_certificate_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  seq_num INTEGER;
BEGIN
  year_prefix := 'LCC' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYY');
  seq_num := nextval('certificate_seq');
  NEW.certificate_number := year_prefix || LPAD(seq_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Calculate grade letter
CREATE OR REPLACE FUNCTION calculate_letter_grade(percentage DECIMAL)
RETURNS CHAR(2) AS $$
BEGIN
  RETURN CASE
    WHEN percentage >= 80 THEN 'A'
    WHEN percentage >= 75 THEN 'B+'
    WHEN percentage >= 70 THEN 'B'
    WHEN percentage >= 65 THEN 'C+'
    WHEN percentage >= 60 THEN 'C'
    WHEN percentage >= 55 THEN 'D+'
    WHEN percentage >= 50 THEN 'D'
    ELSE 'F'
  END;
END;
$$ LANGUAGE plpgsql;

-- Update user login attempts and locking
CREATE OR REPLACE FUNCTION handle_failed_login()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed' THEN
    UPDATE users SET
      login_attempts = login_attempts + 1,
      is_locked = CASE WHEN login_attempts + 1 >= 5 THEN true ELSE false END,
      locked_until = CASE WHEN login_attempts + 1 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes' ELSE NULL END
    WHERE email = NEW.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reset user login attempts on successful login
CREATE OR REPLACE FUNCTION reset_login_attempts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    login_attempts = 0,
    is_locked = false,
    locked_until = NULL,
    last_login_at = CURRENT_TIMESTAMP,
    last_login_ip = NEW.ip_address
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
