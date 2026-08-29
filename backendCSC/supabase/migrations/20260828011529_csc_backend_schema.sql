-- Generated from the backend migrations. No credentials or application data.
-- This schema is private: all end-user access stays behind the NestJS API.
CREATE SCHEMA csc;
CREATE ROLE csc_backend NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE csc_backend SET search_path = csc, pg_catalog;
ALTER ROLE csc_backend SET statement_timeout = '30s';
SET LOCAL search_path = csc, pg_catalog;
CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
-- Source: database/001_initial.sql
-- SALFORD backend design, PostgreSQL. Empty-database reference migration.
-- No users, plans, prices or paid entitlements are seeded by this file.
-- Authorization, provider verification and watched-range validation also require services.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  avatar_key text,
  password_hash text,
  email_verified_at timestamptz,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deletion_pending','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(btrim(email)));

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK (provider IN ('google','apple')),
  subject text NOT NULL,
  provider_refresh_token_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, subject), UNIQUE(user_id, provider)
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL,
  family_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  remember_me boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id, family_id);
CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  installation_id uuid,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','reset_password','change_email','social_google','social_apple','reauthenticate')),
  token_hash text NOT NULL UNIQUE,
  target_email text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  learning_notifications boolean NOT NULL DEFAULT true,
  certificate_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL CHECK(status IN ('pending','processing','completed','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  avatar_key text
);
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('image','video','certificate')),
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK(byte_size > 0),
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded','processing','ready','failed')),
  duration_seconds numeric(12,3) CHECK(duration_seconds > 0),
  playback_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  legacy_key text UNIQUE,
  category_id uuid NOT NULL REFERENCES categories(id),
  instructor_id uuid NOT NULL REFERENCES instructors(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_asset_id uuid REFERENCES media_assets(id),
  access_type text NOT NULL CHECK(access_type IN ('free','subscription')),
  certificate_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  featured_rank integer,
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_catalog ON courses(status, category_id, created_at DESC, id);
CREATE INDEX courses_search ON courses USING gin(to_tsvector('simple', title || ' ' || description));
CREATE TABLE course_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  version integer NOT NULL CHECK(version > 0),
  title_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','retired')),
  published_at timestamptz,
  UNIQUE(course_id, version), UNIQUE(id, course_id)
);
ALTER TABLE courses ADD CONSTRAINT courses_published_version_fk
  FOREIGN KEY(published_version_id, id) REFERENCES course_versions(id, course_id);
CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  title text NOT NULL,
  sort_order integer NOT NULL CHECK(sort_order >= 0),
  UNIQUE(course_version_id, sort_order), UNIQUE(id, course_version_id)
);
CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  chapter_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL CHECK(sort_order >= 0),
  media_asset_id uuid NOT NULL REFERENCES media_assets(id),
  duration_seconds numeric(12,3) NOT NULL CHECK(duration_seconds > 0),
  required boolean NOT NULL DEFAULT true,
  is_preview boolean NOT NULL DEFAULT false,
  FOREIGN KEY(chapter_id, course_version_id) REFERENCES chapters(id, course_version_id),
  UNIQUE(chapter_id, sort_order), UNIQUE(id, course_version_id)
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(features) = 'array'),
  certificate_enabled boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE plan_courses (
  plan_id uuid NOT NULL REFERENCES plans(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  PRIMARY KEY(plan_id, course_id)
);
CREATE TABLE billing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id),
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  external_product_id text NOT NULL,
  external_offer_id text NOT NULL DEFAULT '',
  interval_unit text NOT NULL CHECK(interval_unit IN ('month','year')),
  currency char(3),
  amount_minor bigint CHECK(amount_minor >= 0),
  active boolean NOT NULL DEFAULT false,
  UNIQUE(provider, environment, external_product_id, external_offer_id),
  UNIQUE(id, plan_id), UNIQUE(id, provider, environment)
);
CREATE TABLE billing_customers (
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  external_customer_id text NOT NULL,
  PRIMARY KEY(user_id, provider, environment),
  UNIQUE(provider, environment, external_customer_id)
);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  billing_product_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  external_subscription_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','active','grace','on_hold','expired','revoked')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT false,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(billing_product_id, plan_id) REFERENCES billing_products(id, plan_id),
  FOREIGN KEY(billing_product_id, provider, environment) REFERENCES billing_products(id, provider, environment),
  UNIQUE(provider, environment, external_subscription_id),
  CHECK(period_end > period_start)
);
CREATE INDEX subscriptions_access ON subscriptions(user_id, status, period_end);
CREATE TABLE purchase_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  billing_product_id uuid NOT NULL REFERENCES billing_products(id),
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  evidence_hash text NOT NULL,
  evidence_ciphertext text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  subscription_id uuid REFERENCES subscriptions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(billing_product_id, provider, environment) REFERENCES billing_products(id, provider, environment),
  UNIQUE(provider, environment, evidence_hash)
);
CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  external_transaction_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('charge','refund','reversal')),
  currency char(3) NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor >= 0),
  occurred_at timestamptz NOT NULL,
  UNIQUE(provider, environment, external_transaction_id, kind)
);
CREATE TABLE checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  billing_product_id uuid NOT NULL REFERENCES billing_products(id),
  external_session_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('pending','processing','succeeded','failed','expired')),
  subscription_id uuid REFERENCES subscriptions(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  course_version_id uuid NOT NULL,
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
  completed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_version_id, course_id) REFERENCES course_versions(id, course_id),
  UNIQUE(user_id, course_version_id), UNIQUE(id, user_id, course_version_id),
  CHECK(completed_at IS NULL OR progress_percent = 100)
);
CREATE INDEX enrollments_library ON enrollments(user_id, last_activity_at DESC, id);
CREATE TABLE bookmarks (
  user_id uuid NOT NULL REFERENCES users(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, course_id)
);
CREATE INDEX bookmarks_list ON bookmarks(user_id, created_at DESC, course_id);
CREATE TABLE playback_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  enrollment_id uuid,
  course_version_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
  last_received_at timestamptz,
  last_position_seconds numeric(12,3) NOT NULL DEFAULT 0 CHECK(last_position_seconds >= 0),
  closed_at timestamptz,
  FOREIGN KEY(lesson_id, course_version_id) REFERENCES lessons(id, course_version_id),
  FOREIGN KEY(enrollment_id, user_id, course_version_id) REFERENCES enrollments(id, user_id, course_version_id),
  UNIQUE(id, user_id, lesson_id), CHECK(expires_at > started_at)
);
CREATE TABLE playback_events (
  event_id uuid PRIMARY KEY,
  playback_session_id uuid NOT NULL REFERENCES playback_sessions(id),
  sequence integer NOT NULL CHECK(sequence > 0),
  kind text NOT NULL CHECK(kind IN ('heartbeat','pause','seek','ended')),
  position_seconds numeric(12,3) NOT NULL CHECK(position_seconds >= 0),
  playback_rate numeric(3,2) NOT NULL CHECK(playback_rate BETWEEN 0.5 AND 2),
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(playback_session_id, sequence)
);
CREATE TABLE lesson_progress (
  user_id uuid NOT NULL REFERENCES users(id),
  lesson_id uuid NOT NULL,
  course_version_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  last_position_seconds numeric(12,3) NOT NULL DEFAULT 0 CHECK(last_position_seconds >= 0),
  watched_seconds numeric(12,3) NOT NULL DEFAULT 0 CHECK(watched_seconds >= 0),
  watched_ranges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(watched_ranges) = 'array'),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(lesson_id, course_version_id) REFERENCES lessons(id, course_version_id),
  FOREIGN KEY(enrollment_id, user_id, course_version_id) REFERENCES enrollments(id, user_id, course_version_id),
  PRIMARY KEY(user_id, lesson_id)
);
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES enrollments(id),
  public_code text NOT NULL UNIQUE,
  learner_name_snapshot text NOT NULL,
  course_title_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','issued','failed','revoked')),
  pdf_key text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('learning','billing','certificate','security')),
  title text NOT NULL,
  body text NOT NULL,
  target_type text CHECK(target_type IN ('course','certificate','subscription')),
  target_id uuid,
  read_at timestamptz,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX notifications_inbox ON notifications(user_id, created_at DESC, id);
CREATE TABLE device_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  platform text NOT NULL CHECK(platform IN ('android','ios')),
  token_ciphertext text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  permission text NOT NULL CHECK(permission IN ('granted','denied','provisional')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK(provider IN ('apple','google','stripe')),
  environment text NOT NULL CHECK(environment IN ('sandbox','production')),
  external_event_id text NOT NULL,
  payload_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, environment, external_event_id)
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0)
);
CREATE INDEX outbox_pending ON outbox_events(created_at) WHERE delivered_at IS NULL;
CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('processing','completed')),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(user_id, operation, key)
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id uuid NOT NULL,
  -- Allowlisted non-secret changes only, never raw HTTP bodies.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);


INSERT INTO schema_migrations(name) VALUES ('001_initial.sql');

-- Source: database/002_runtime.sql
ALTER TABLE auth_sessions ADD COLUMN auth_time timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox_events ADD COLUMN leased_until timestamptz;
ALTER TABLE outbox_events ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox_events ADD COLUMN last_error_code text;
ALTER TABLE playback_sessions ADD COLUMN grant_key text;
ALTER TABLE checkout_sessions ADD COLUMN checkout_url_ciphertext text;
ALTER TABLE users ADD COLUMN billing_account_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX users_billing_binding ON users(billing_account_id);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX outbox_due ON outbox_events(next_attempt_at) WHERE delivered_at IS NULL;

INSERT INTO schema_migrations(name) VALUES ('002_runtime.sql');

-- Source: database/003_versions.sql
ALTER TABLE course_versions ADD COLUMN metadata jsonb;

INSERT INTO schema_migrations(name) VALUES ('003_versions.sql');

-- Source: database/004_refunds.sql
ALTER TABLE subscriptions ADD COLUMN access_revoked_until timestamptz;

INSERT INTO schema_migrations(name) VALUES ('004_refunds.sql');

-- Source: database/005_demo_billing.sql
ALTER TABLE plans ADD COLUMN demo_amount_minor integer NOT NULL DEFAULT 999 CHECK (demo_amount_minor BETWEEN 0 AND 10000000);
CREATE TABLE demo_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL CHECK (status IN ('succeeded','failed','refunded')),
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE INDEX demo_payments_access ON demo_payments(user_id, plan_id, status, period_end);
CREATE INDEX demo_payments_created ON demo_payments(created_at DESC, id);
UPDATE plans SET active=true,demo_amount_minor=CASE code WHEN 'basic' THEN 999 WHEN 'pro' THEN 1999 ELSE 2999 END
WHERE code IN ('basic','pro','premium') AND NOT EXISTS (SELECT 1 FROM billing_products b WHERE b.plan_id=plans.id);

INSERT INTO schema_migrations(name) VALUES ('005_demo_billing.sql');

-- Keep cyclic course/version references valid when importing existing data.
DO $constraints$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype='f' AND connamespace='csc'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE', c.tbl, c.conname);
  END LOOP;
END
$constraints$;

REVOKE ALL ON SCHEMA csc FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA csc FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA csc FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA csc FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA csc TO csc_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA csc TO csc_backend;
REVOKE INSERT, UPDATE, DELETE ON csc.schema_migrations FROM csc_backend;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA csc TO csc_backend;

DO $security$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='csc'
  LOOP
    EXECUTE format('ALTER TABLE csc.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('ALTER TABLE csc.%I FORCE ROW LEVEL SECURITY', t.tablename);
    IF t.tablename='schema_migrations' THEN
      EXECUTE format('CREATE POLICY backend_read ON csc.%I FOR SELECT TO csc_backend USING (true)', t.tablename);
    ELSE
      -- The trusted backend checks ownership, role and session on every API call.
      -- This is not a policy for mobile clients or Supabase authenticated users.
      EXECUTE format('CREATE POLICY backend_only ON csc.%I FOR ALL TO csc_backend USING (true) WITH CHECK (true)', t.tablename);
    END IF;
  END LOOP;
END
$security$;
ALTER DEFAULT PRIVILEGES IN SCHEMA csc REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA csc REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA csc REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
