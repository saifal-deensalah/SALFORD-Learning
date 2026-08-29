import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] || '');
const directory = path.join(root, 'supabase', 'migrations');
if (path.dirname(target) !== directory || !existsSync(target)) {
  throw Error('First create the migration with supabase migration new, then pass its existing path.');
}
const files = readdirSync(path.join(root, 'database')).filter(n => n.endsWith('.sql')).sort();
const schema = files.map(name => {
  const sql = readFileSync(path.join(root, 'database', name), 'utf8')
    .replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '');
  return `-- Source: database/${name}\n${sql}\nINSERT INTO schema_migrations(name) VALUES ('${name}');`;
}).join('\n\n');
writeFileSync(target, `-- Generated from the backend migrations. No credentials or application data.
-- This schema is private: all end-user access stays behind the NestJS API.
CREATE SCHEMA csc;
CREATE ROLE csc_backend NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE csc_backend SET search_path = csc, pg_catalog;
ALTER ROLE csc_backend SET statement_timeout = '30s';
SET LOCAL search_path = csc, pg_catalog;
CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
${schema}

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
`);
console.log(JSON.stringify({file: path.basename(target), sources: files.length}));
