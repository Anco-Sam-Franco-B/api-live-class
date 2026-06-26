-- ============================================
-- Live Class Code - Seed Data
-- ============================================

-- Insert Roles
INSERT INTO roles (name, slug, description, is_system) VALUES
  ('Super Admin', 'super-admin', 'Full system access and control', true),
  ('Admin', 'admin', 'Platform administration access', true),
  ('Teacher', 'teacher', 'Course creation and teaching', true),
  ('Student', 'student', 'Course enrollment and learning', true)
ON CONFLICT (name) DO NOTHING;

-- Insert Permissions
INSERT INTO permissions (name, slug, description, module) VALUES
  -- Users
  ('View Users', 'view-users', 'Can view user list', 'users'),
  ('Create Users', 'create-users', 'Can create new users', 'users'),
  ('Edit Users', 'edit-users', 'Can edit user details', 'users'),
  ('Delete Users', 'delete-users', 'Can delete users', 'users'),
  -- Roles
  ('View Roles', 'view-roles', 'Can view roles', 'roles'),
  ('Create Roles', 'create-roles', 'Can create roles', 'roles'),
  ('Edit Roles', 'edit-roles', 'Can edit roles', 'roles'),
  ('Delete Roles', 'delete-roles', 'Can delete roles', 'roles'),
  -- Courses
  ('View Courses', 'view-courses', 'Can view courses', 'courses'),
  ('Create Courses', 'create-courses', 'Can create courses', 'courses'),
  ('Edit Courses', 'edit-courses', 'Can edit courses', 'courses'),
  ('Delete Courses', 'delete-courses', 'Can delete courses', 'courses'),
  ('Publish Courses', 'publish-courses', 'Can publish/unpublish courses', 'courses'),
  -- Categories
  ('View Categories', 'view-categories', 'Can view categories', 'categories'),
  ('Create Categories', 'create-categories', 'Can create categories', 'categories'),
  ('Edit Categories', 'edit-categories', 'Can edit categories', 'categories'),
  ('Delete Categories', 'delete-categories', 'Can delete categories', 'categories'),
  -- Modules
  ('View Modules', 'view-modules', 'Can view modules', 'modules'),
  ('Create Modules', 'create-modules', 'Can create modules', 'modules'),
  ('Edit Modules', 'edit-modules', 'Can edit modules', 'modules'),
  ('Delete Modules', 'delete-modules', 'Can delete modules', 'modules'),
  -- Lessons
  ('View Lessons', 'view-lessons', 'Can view lessons', 'lessons'),
  ('Create Lessons', 'create-lessons', 'Can create lessons', 'lessons'),
  ('Edit Lessons', 'edit-lessons', 'Can edit lessons', 'lessons'),
  ('Delete Lessons', 'delete-lessons', 'Can delete lessons', 'lessons'),
  -- Enrollments
  ('View Enrollments', 'view-enrollments', 'Can view enrollments', 'enrollments'),
  ('Create Enrollments', 'create-enrollments', 'Can create enrollments', 'enrollments'),
  ('Edit Enrollments', 'edit-enrollments', 'Can edit enrollments', 'enrollments'),
  ('Delete Enrollments', 'delete-enrollments', 'Can delete enrollments', 'enrollments'),
  -- Progress
  ('View Progress', 'view-progress', 'Can view progress', 'progress'),
  ('Manage Progress', 'manage-progress', 'Can manage progress', 'progress'),
  -- Reviews
  ('View Reviews', 'view-reviews', 'Can view reviews', 'reviews'),
  ('Create Reviews', 'create-reviews', 'Can create reviews', 'reviews'),
  ('Edit Reviews', 'edit-reviews', 'Can edit reviews', 'reviews'),
  ('Delete Reviews', 'delete-reviews', 'Can delete reviews', 'reviews'),
  -- Assignments
  ('View Assignments', 'view-assignments', 'Can view assignments', 'assignments'),
  ('Create Assignments', 'create-assignments', 'Can create assignments', 'assignments'),
  ('Edit Assignments', 'edit-assignments', 'Can edit assignments', 'assignments'),
  ('Delete Assignments', 'delete-assignments', 'Can delete assignments', 'assignments'),
  ('Grade Assignments', 'grade-assignments', 'Can grade assignments', 'assignments'),
  -- Submissions
  ('View Submissions', 'view-submissions', 'Can view submissions', 'submissions'),
  ('Create Submissions', 'create-submissions', 'Can create submissions', 'submissions'),
  ('Edit Submissions', 'edit-submissions', 'Can edit submissions', 'submissions'),
  ('Delete Submissions', 'delete-submissions', 'Can delete submissions', 'submissions'),
  -- Quizzes
  ('View Quizzes', 'view-quizzes', 'Can view quizzes', 'quizzes'),
  ('Create Quizzes', 'create-quizzes', 'Can create quizzes', 'quizzes'),
  ('Edit Quizzes', 'edit-quizzes', 'Can edit quizzes', 'quizzes'),
  ('Delete Quizzes', 'delete-quizzes', 'Can delete quizzes', 'quizzes'),
  ('Manage Questions', 'manage-questions', 'Can manage quiz questions', 'quizzes'),
  ('Attempt Quizzes', 'attempt-quizzes', 'Can attempt quizzes', 'quizzes'),
  -- Grades
  ('View Grades', 'view-grades', 'Can view grades', 'grades'),
  ('Create Grades', 'create-grades', 'Can create grades', 'grades'),
  ('Edit Grades', 'edit-grades', 'Can edit grades', 'grades'),
  ('Delete Grades', 'delete-grades', 'Can delete grades', 'grades'),
  -- Meetings
  ('View Meetings', 'view-meetings', 'Can view meetings', 'meetings'),
  ('Create Meetings', 'create-meetings', 'Can create meetings', 'meetings'),
  ('Edit Meetings', 'edit-meetings', 'Can edit meetings', 'meetings'),
  ('Delete Meetings', 'delete-meetings', 'Can delete meetings', 'meetings'),
  -- Attendance
  ('View Attendance', 'view-attendance', 'Can view attendance', 'attendance'),
  ('Take Attendance', 'take-attendance', 'Can take attendance', 'attendance'),
  ('Manage Attendance', 'manage-attendance', 'Can manage attendance records', 'attendance'),
  -- Payments
  ('View Payments', 'view-payments', 'Can view payments', 'payments'),
  ('Manage Payments', 'manage-payments', 'Can manage payments', 'payments'),
  ('Refund Payments', 'refund-payments', 'Can process refunds', 'payments'),
  ('View Receipts', 'view-receipts', 'Can view payment receipts', 'payments'),
  ('Generate Invoices', 'generate-invoices', 'Can generate invoices', 'payments'),
  ('View Payment Stats', 'view-payment-stats', 'Can view payment statistics', 'payments'),
  ('Export Payments', 'export-payments', 'Can export payment data', 'payments'),
  -- Transactions
  ('View Transactions', 'view-transactions', 'Can view transactions', 'transactions'),
  ('Manage Transactions', 'manage-transactions', 'Can manage transactions', 'transactions'),
  -- Subscriptions
  ('View Subscriptions', 'view-subscriptions', 'Can view subscriptions', 'subscriptions'),
  ('Manage Subscriptions', 'manage-subscriptions', 'Can manage subscriptions', 'subscriptions'),
  -- Invoices
  ('View Invoices', 'view-invoices', 'Can view invoices', 'invoices'),
  ('Generate Invoices', 'generate-invoices', 'Can generate invoices', 'invoices'),
  ('Manage Invoices', 'manage-invoices', 'Can manage invoices', 'invoices'),
  -- Messages
  ('View Messages', 'view-messages', 'Can view messages', 'messages'),
  ('Send Messages', 'send-messages', 'Can send messages', 'messages'),
  ('Manage Messages', 'manage-messages', 'Can manage messages', 'messages'),
  -- Notifications
  ('View Notifications', 'view-notifications', 'Can view notifications', 'notifications'),
  ('Send Notifications', 'send-notifications', 'Can send notifications', 'notifications'),
  ('Manage Notifications', 'manage-notifications', 'Can manage notifications', 'notifications'),
  -- Certificates
  ('View Certificates', 'view-certificates', 'Can view certificates', 'certificates'),
  ('Issue Certificates', 'issue-certificates', 'Can issue certificates', 'certificates'),
  ('Revoke Certificates', 'revoke-certificates', 'Can revoke certificates', 'certificates'),
  -- Reports
  ('View Reports', 'view-reports', 'Can view reports', 'reports'),
  ('Generate Reports', 'generate-reports', 'Can generate reports', 'reports'),
  -- Settings
  ('View Settings', 'view-settings', 'Can view settings', 'settings'),
  ('Edit Settings', 'edit-settings', 'Can edit settings', 'settings'),
  -- Audit
  ('View Audit Logs', 'view-audit-logs', 'Can view audit logs', 'audit'),
  -- Announcements
  ('View Announcements', 'view-announcements', 'Can view announcements', 'announcements'),
  ('Create Announcements', 'create-announcements', 'Can create announcements', 'announcements'),
  ('Edit Announcements', 'edit-announcements', 'Can edit announcements', 'announcements'),
  ('Delete Announcements', 'delete-announcements', 'Can delete announcements', 'announcements'),
  -- Certificate Templates
  ('View Certificate Templates', 'view-certificate-templates', 'Can view certificate templates', 'certificate_templates'),
  ('Create Certificate Templates', 'create-certificate-templates', 'Can create certificate templates', 'certificate_templates'),
  ('Edit Certificate Templates', 'edit-certificate-templates', 'Can edit certificate templates', 'certificate_templates'),
  ('Delete Certificate Templates', 'delete-certificate-templates', 'Can delete certificate templates', 'certificate_templates')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Super Admin gets ALL permissions
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'super-admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- Admin gets all permissions except delete-roles, create-roles, edit-roles
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.slug NOT IN ('delete-roles', 'create-roles', 'edit-roles')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- Teacher permissions
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'teacher'
  AND p.slug IN (
    'view-courses', 'create-courses', 'edit-courses', 'delete-courses', 'publish-courses',
    'view-categories', 'create-categories', 'edit-categories', 'delete-categories',
    'view-modules', 'create-modules', 'edit-modules', 'delete-modules',
    'view-lessons', 'create-lessons', 'edit-lessons', 'delete-lessons',
    'view-enrollments', 'create-enrollments', 'edit-enrollments', 'delete-enrollments',
    'view-progress', 'manage-progress',
    'view-reviews',
    'view-assignments', 'create-assignments', 'edit-assignments', 'delete-assignments', 'grade-assignments',
    'view-submissions', 'create-submissions', 'edit-submissions', 'delete-submissions',
    'view-quizzes', 'create-quizzes', 'edit-quizzes', 'delete-quizzes', 'manage-questions',
    'view-grades', 'create-grades', 'edit-grades', 'delete-grades',
    'view-meetings', 'create-meetings', 'edit-meetings', 'delete-meetings',
    'view-attendance', 'take-attendance', 'manage-attendance',
    'view-messages', 'send-messages',
    'view-notifications', 'send-notifications',
    'view-certificates', 'issue-certificates',
    'view-reports', 'generate-reports',
    'view-announcements', 'create-announcements', 'edit-announcements', 'delete-announcements',
    'view-certificate-templates', 'create-certificate-templates', 'edit-certificate-templates', 'delete-certificate-templates'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- Student permissions
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'student'
  AND p.slug IN (
    'view-courses',
    'view-categories',
    'view-modules',
    'view-lessons',
    'view-enrollments', 'create-enrollments',
    'view-progress',
    'view-reviews', 'create-reviews', 'edit-reviews', 'delete-reviews',
    'view-assignments',
    'create-submissions', 'view-submissions', 'edit-submissions', 'delete-submissions',
    'view-quizzes', 'attempt-quizzes',
    'view-grades',
    'view-meetings',
    'view-attendance',
    'view-transactions',
    'view-subscriptions', 'manage-subscriptions',
    'view-invoices',
    'view-messages', 'send-messages',
    'view-notifications',
    'view-certificates',
    'view-announcements'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Insert Course Categories
INSERT INTO course_categories (name, slug, description, icon, color, sort_order) VALUES
  ('Programming', 'programming', 'Web, mobile, and software development courses', 'code', '#4f46e5', 1),
  ('Mathematics', 'mathematics', 'Algebra, calculus, statistics and more', 'calculator', '#059669', 2),
  ('Science', 'science', 'Physics, chemistry, biology and earth science', 'flask', '#d97706', 3),
  ('Languages', 'languages', 'English, French, Swahili and other languages', 'globe', '#dc2626', 4)
ON CONFLICT (slug) DO NOTHING;

-- Create Super Admin user
-- Password: Admin@123 (will be hashed by setup script)
INSERT INTO users (role_id, first_name, last_name, email, phone, password, is_verified, is_active)
VALUES (1, 'Super', 'Admin', 'admin@liveclasscode.com', '+256700000000', '$2a$10$placeholder_hash_will_be_updated', true, true)
ON CONFLICT (email) DO NOTHING;

-- Insert System Settings
INSERT INTO system_settings (key, value, description) VALUES
  ('platform_name', '"Live Class Code"', 'Platform display name'),
  ('platform_email', '"noreply@liveclasscode.com"', 'Platform email address'),
  ('platform_currency', '"UGX"', 'Default currency'),
  ('payment_providers', '["mtn_momo", "airtel_money"]', 'Enabled payment providers'),
  ('max_file_upload_size', '10485760', 'Maximum file upload size in bytes'),
  ('allowed_file_types', '["pdf","doc","docx","jpg","png","mp4","zip"]', 'Allowed file types for upload'),
  ('default_timezone', '"Africa/Kampala"', 'Default timezone'),
  ('course_levels', '["beginner","intermediate","advanced","all-levels"]', 'Available course levels'),
  ('max_login_attempts', '5', 'Maximum login attempts before lockout'),
  ('lockout_duration_minutes', '30', 'Account lockout duration in minutes'),
  ('smtp_enabled', 'false', 'Is SMTP configured'),
  ('jaas_enabled', 'false', 'Is 8x8.vc (JaaS) configured'),
  ('mtn_momo_enabled', 'false', 'Is MTN MoMo configured'),
  ('airtel_money_enabled', 'false', 'Is Airtel Money configured'),
  ('platform_logo', '""', 'Platform logo URL'),
  ('platform_favicon', '""', 'Platform favicon URL'),
  ('brand_primary_color', '"#4f46e5"', 'Primary brand color'),
  ('brand_secondary_color', '"#059669"', 'Secondary brand color'),
  ('platform_tagline', '""', 'Platform tagline/slogan'),
  ('platform_description', '""', 'Platform meta description'),
  ('support_email', '""', 'Support email address'),
  ('support_phone', '""', 'Support phone number'),
  ('social_facebook', '""', 'Facebook page URL'),
  ('social_twitter', '""', 'Twitter/X profile URL'),
  ('social_linkedin', '""', 'LinkedIn page URL'),
  ('social_youtube', '""', 'YouTube channel URL'),
  ('social_instagram', '""', 'Instagram profile URL'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('registration_enabled', 'true', 'Allow new user registrations'),
  ('default_user_role', '"student"', 'Default role for new users'),
  ('session_timeout_minutes', '"60"', 'Session timeout in minutes'),
  ('password_min_length', '"8"', 'Minimum password length'),
   ('enable_certificates', 'true', 'Enable certificate generation'),
   ('certificate_signature_url', '""', 'Certificate authority signature image URL'),
   ('certificate_authority_name', '"Live Class Code"', 'Certificate authority/institution name')
ON CONFLICT (key) DO NOTHING;
