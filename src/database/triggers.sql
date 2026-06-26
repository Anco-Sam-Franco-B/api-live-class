-- ============================================
-- Live Class Code - Database Triggers
-- ============================================

-- Sequences for invoice and certificate numbers
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;
CREATE SEQUENCE IF NOT EXISTS certificate_seq START 1;

-- Course rating triggers
DROP TRIGGER IF EXISTS trg_course_review_after_insert ON course_reviews;
CREATE TRIGGER trg_course_review_after_insert
  AFTER INSERT ON course_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_course_rating();

DROP TRIGGER IF EXISTS trg_course_review_after_update ON course_reviews;
CREATE TRIGGER trg_course_review_after_update
  AFTER UPDATE ON course_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_course_rating();

-- Enrollment progress triggers
DROP TRIGGER IF EXISTS trg_course_progress_after_insert ON course_progress;
CREATE TRIGGER trg_course_progress_after_insert
  AFTER INSERT OR UPDATE ON course_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_enrollment_progress();

-- Invoice number trigger
DROP TRIGGER IF EXISTS trg_invoice_before_insert ON invoices;
CREATE TRIGGER trg_invoice_before_insert
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION generate_invoice_number();

-- Certificate number trigger
DROP TRIGGER IF EXISTS trg_certificate_before_insert ON certificates;
CREATE TRIGGER trg_certificate_before_insert
  BEFORE INSERT ON certificates
  FOR EACH ROW
  EXECUTE FUNCTION generate_certificate_number();

-- Login log triggers
DROP TRIGGER IF EXISTS trg_login_log_after_insert_failed ON login_logs;
CREATE TRIGGER trg_login_log_after_insert_failed
  AFTER INSERT ON login_logs
  FOR EACH ROW
  WHEN (NEW.status = 'failed')
  EXECUTE FUNCTION handle_failed_login();

DROP TRIGGER IF EXISTS trg_login_log_after_insert_success ON login_logs;
CREATE TRIGGER trg_login_log_after_insert_success
  AFTER INSERT ON login_logs
  FOR EACH ROW
  WHEN (NEW.status = 'success')
  EXECUTE FUNCTION reset_login_attempts();

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_course_modules_updated_at ON course_modules;
CREATE TRIGGER trg_course_modules_updated_at
  BEFORE UPDATE ON course_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;
CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON enrollments;
CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Prevent deletion of system roles
CREATE OR REPLACE FUNCTION prevent_system_role_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'Cannot delete system roles';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_before_delete ON roles;
CREATE TRIGGER trg_roles_before_delete
  BEFORE DELETE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_system_role_deletion();
