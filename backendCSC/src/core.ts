import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export type Row = Record<string, any>;
export class ApiError extends Error {
  constructor(public status: number, public code: string, message = code) {
    super(message);
  }
}
export function fail(status: number, code: string, message?: string): never {
  throw new ApiError(status, code, message);
}
export function need<T>(
  value: T | null | undefined,
  code = 'RESOURCE_NOT_FOUND',
): T {
  if (value == null) fail(404, code);
  return value;
}
export const uid = randomUUID;
export const iso = (value: any) =>
  value == null ? null : new Date(value).toISOString();
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const readJson = (file: string) =>
  JSON.parse(readFileSync(file, 'utf8'));
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export interface Config {
  env: string;
  port: number;
  host: string;
  origin: string;
  dataDir: string;
  dbMode: string;
  localEmailAuth: boolean;
  databaseUrl?: string;
  databaseSchema: string;
  databaseSsl: boolean;
  databaseCaFile?: string;
  databasePoolMax: number;
  secret: string;
  redisUrl?: string;
  mailMode: string;
  storageMode: string;
  billingMode: 'demo' | 'provider-test';
  worker: boolean;
  now: () => number;
}
export function loadConfig(overrides: Partial<Config> = {}): Config {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const env = overrides.env || process.env.NODE_ENV || 'development';
  const localFile = path.join(ROOT, '../frontend/src/services/local-config.json');
  const localPort = existsSync(localFile) ? readJson(localFile).apiPort : 3000;
  const port = overrides.port ?? Number(process.env.PORT || localPort);
  const dataDir =
    overrides.dataDir || process.env.DATA_DIR || path.join(ROOT, '.local');
  mkdirSync(dataDir, { recursive: true });
  let secret = overrides.secret || process.env.APP_SECRET;
  if (!secret && env !== 'production') {
    const file = path.join(dataDir, 'secrets.json');
    if (!existsSync(file))
      writeFileSync(file, JSON.stringify({ secret: token() + token() }), {
        mode: 0o600,
      });
    secret = readJson(file).secret;
  }
  const c: Config = {
    env,
    port,
    host: process.env.HOST || '127.0.0.1',
    origin: process.env.PUBLIC_API_ORIGIN || `http://127.0.0.1:${port}`,
    dataDir,
    // Automated tests must never inherit a developer's cloud database.
    dbMode: env === 'test' ? 'embedded' : process.env.DB_MODE || 'embedded',
    localEmailAuth: env !== 'test' && process.env.LOCAL_EMAIL_AUTH === 'true',
    databaseUrl: env === 'test' ? undefined : process.env.DATABASE_URL,
    databaseSchema: env === 'test' ? 'public' : process.env.DATABASE_SCHEMA || 'public',
    databaseSsl: env !== 'test' && process.env.DATABASE_SSL !== 'false',
    databaseCaFile: env === 'test' ? undefined : process.env.DATABASE_CA_FILE,
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 5),
    secret: secret || '',
    redisUrl: process.env.REDIS_URL,
    mailMode: process.env.MAIL_MODE || 'local',
    storageMode: process.env.STORAGE_MODE || 'local',
    billingMode: 'demo',
    worker: true,
    now: Date.now,
    ...overrides,
  };
  if (process.env.LOCAL_EMAIL_AUTH && !['true', 'false'].includes(process.env.LOCAL_EMAIL_AUTH))
    throw Error('LOCAL_EMAIL_AUTH must be true or false');
  if (c.localEmailAuth && (c.env !== 'development' || c.dbMode !== 'embedded' || !['127.0.0.1', '::1', 'localhost'].includes(c.host)))
    throw Error('LOCAL_EMAIL_AUTH requires NODE_ENV=development, DB_MODE=embedded and a loopback HOST');
  if (c.secret.length < 32)
    throw Error('APP_SECRET must have at least 32 random characters');
  if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535)
    throw Error('Invalid PORT');
  if (
    env === 'production' &&
    (c.dbMode !== 'postgres' ||
      !c.databaseUrl ||
      !c.origin.startsWith('https://') ||
      c.mailMode !== 'smtp' ||
      c.storageMode !== 's3' ||
      !c.redisUrl)
  )
    throw Error(
      'Production requires PostgreSQL, Redis, SMTP, S3 and a public HTTPS origin',
    );
  if (c.billingMode !== 'demo' && !(env === 'test' && c.billingMode === 'provider-test'))
    throw Error('Only simulated billing is allowed outside automated tests');
  if (
    env === 'production' &&
    (!process.env.S3_BUCKET || !process.env.SMTP_URL || !process.env.SMTP_FROM)
  )
    throw Error('Production requires S3_BUCKET, SMTP_URL and SMTP_FROM');
  if (
    env === 'production' &&
    process.env.ADMIN_API_ENABLED === 'true' &&
    (process.env.ADMIN_API_KEY || '').length < 32
  )
    throw Error('Production admin API requires a separate ADMIN_API_KEY');
  if (!['embedded', 'postgres'].includes(c.dbMode))
    throw Error('Unknown DB_MODE');
  if (c.dbMode === 'postgres' && !c.databaseUrl)
    throw Error('DATABASE_URL is required for PostgreSQL');
  if (!/^[a-z_][a-z0-9_]*$/.test(c.databaseSchema))
    throw Error('Invalid DATABASE_SCHEMA');
  if (!Number.isInteger(c.databasePoolMax) || c.databasePoolMax < 1 || c.databasePoolMax > 20)
    throw Error('DATABASE_POOL_MAX must be between 1 and 20');
  return c;
}
export interface DB {
  query(sql: string, args?: any[]): Promise<Row[]>;
  tx<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
function scoped(query: (sql: string, args?: any[]) => Promise<Row[]>): DB {
  return { query, tx: async fn => fn(scoped(query)), close: async () => {} };
}
export async function connect(c: Config): Promise<DB> {
  if (c.dbMode === 'postgres') {
    const url = new URL(c.databaseUrl!);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('Invalid PostgreSQL URL');
    if (url.hostname.endsWith('.supabase.com') || url.hostname.endsWith('.supabase.co')) {
      if (!c.databaseSsl) throw Error('Supabase connections require verified TLS');
    }
    // URL SSL flags must not silently override certificate verification.
    for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
    const pool = new pg.Pool({
      connectionString: url.toString(),
      max: c.databasePoolMax,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      application_name: 'csc-backend',
      options: `-c search_path=${c.databaseSchema},pg_catalog`,
      ssl: c.databaseSsl ? {
        rejectUnauthorized: true,
        ...(c.databaseCaFile ? {ca: readFileSync(c.databaseCaFile, 'utf8')} : {}),
      } : false,
    });
    pool.on('error', error => console.error(JSON.stringify({event: 'database_pool_error', code: (error as {code?: string}).code || 'UNKNOWN'})));
    try { await pool.query('SELECT 1'); } catch (error) { await pool.end(); throw error; }
    return {
      query: async (sql, args) => (await pool.query(sql, args)).rows,
      tx: async fn => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(
            scoped(async (s, a) => (await client.query(s, a)).rows),
          );
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const lock = path.join(c.dataDir, 'postgres.lock');
  try {
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
  } catch {
    throw Error(
      `Embedded database is already locked. Stop its API before migrate/seed. If a process crashed, verify the PID in ${lock} is no longer running before removing that lock file.`,
    );
  }
  const p = new PGlite(path.join(c.dataDir, 'postgres'));
  try {
    await p.waitReady;
  } catch (e) {
    unlinkSync(lock);
    throw e;
  }
  return {
    query: async (sql, args) => (await p.query<Row>(sql, args)).rows,
    tx: async fn =>
      p.transaction(async tx =>
        fn(scoped(async (s, a) => (await tx.query<Row>(s, a)).rows)),
      ),
    close: async () => {
      await p.close();
      unlinkSync(lock);
    },
  };
}
export async function migrate(db: DB) {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { readdirSync } = await import('node:fs');
  for (const name of readdirSync(path.join(ROOT, 'database'))
    .filter(n => n.endsWith('.sql'))
    .sort())
    await db.tx(async t => {
      await t.query('SELECT pg_advisory_xact_lock(783146)');
      if (
        (
          await t.query('SELECT name FROM schema_migrations WHERE name=$1', [
            name,
          ])
        ).length
      )
        return;
      const sql = readFileSync(path.join(ROOT, 'database', name), 'utf8')
        .replace(/^BEGIN;\s*$/gm, '')
        .replace(/^COMMIT;\s*$/gm, '');
      // PGlite query accepts one statement. SQL files here have no procedural blocks.
      for (const statement of sql
        .split(';')
        .map(s => s.trim())
        .filter(Boolean))
        await t.query(statement);
      await t.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    });
}
export interface Context {
  db: DB;
  config: Config;
}
export interface Input {
  body: Row;
  query: Row;
  params: Row;
  headers: Row;
  user: Row;
  rawBody?: Buffer;
  requestId: string;
  ip: string;
}
export type Handler = (input: Input) => Promise<any>;
export type Handlers = Record<string, Handler>;
export function hash(c: Context, value: string) {
  return createHmac('sha256', c.config.secret).update(value).digest('hex');
}
export function seal(c: Context, value: string) {
  const iv = randomBytes(12),
    key = createHash('sha256').update(c.config.secret).digest(),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64url');
}
export function unseal(c: Context, value: string) {
  const b = Buffer.from(value, 'base64url'),
    dec = createDecipheriv(
      'aes-256-gcm',
      createHash('sha256').update(c.config.secret).digest(),
      b.subarray(0, 12),
    );
  dec.setAuthTag(b.subarray(-16));
  return Buffer.concat([
    dec.update(b.subarray(12, -16)),
    dec.final(),
  ]).toString();
}
export async function enqueue(
  c: Context,
  topic: string,
  id: string,
  payload: Row,
  key: string,
) {
  await c.db.query(
    'INSERT INTO outbox_events(topic,aggregate_id,payload,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(dedupe_key) DO NOTHING',
    [topic, id, { sealed: seal(c, JSON.stringify(payload)) }, key],
  );
}
export async function audit(
  c: Context,
  i: Input,
  action: string,
  type: string,
  id?: string,
) {
  await c.db.query(
    'INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',
    [i.user?.id || null, action, type, id || null, i.requestId],
  );
}
export async function limit(
  c: Context,
  key: string,
  max: number,
  seconds: number,
) {
  const until = new Date(c.config.now() + seconds * 1000).toISOString();
  const [r] = await c.db.query(
    `INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN $2 ELSE rate_limits.expires_at END RETURNING hits`,
    [hash(c, key), until],
  );
  if (r.hits > max) fail(429, 'RATE_LIMITED');
}
export function verified(i: Input, c: Context) {
  if (!c.config.localEmailAuth && !i.user.email_verified_at) fail(403, 'EMAIL_NOT_VERIFIED');
}
export function publicUser(u: Row, c: Context) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: !!u.email_verified_at,
    emailVerificationRequired: !c.config.localEmailAuth,
    avatarUrl: null,
    role: u.role,
  };
}
export async function idempotent(
  c: Context,
  i: Input,
  operation: string,
  fn: (c: Context) => Promise<any>,
) {
  return c.db.tx(async db => {
    const t = { ...c, db },
      key = i.headers['idempotency-key'],
      requestHash = digest(JSON.stringify({ body: i.body, params: i.params }));
    await db.query(
      'DELETE FROM idempotency_keys WHERE user_id=$1 AND expires_at<now()',
      [i.user.id],
    );
    await db.query(
      "INSERT INTO idempotency_keys(user_id,operation,key,request_hash,status,expires_at) VALUES($1,$2,$3,$4,'processing',now()+interval '1 day') ON CONFLICT DO NOTHING",
      [i.user.id, operation, key, requestHash],
    );
    const [row] = await db.query(
      'SELECT * FROM idempotency_keys WHERE user_id=$1 AND operation=$2 AND key=$3 FOR UPDATE',
      [i.user.id, operation, key],
    );
    if (row.request_hash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT');
    if (row.status === 'completed') return row.response_body;
    const result = await fn(t);
    await db.query(
      "UPDATE idempotency_keys SET status='completed',response_body=$4 WHERE user_id=$1 AND operation=$2 AND key=$3",
      [i.user.id, operation, key, result ?? null],
    );
    return result;
  });
}
export function paginate(c: Context, rows: Row[], query: Row, scope: string) {
  const bound = hash(
    c,
    JSON.stringify({
      scope,
      q: query.q || '',
      categoryId: query.categoryId || '',
      sort: query.sort || '',
      status: query.status || '',
      unreadOnly: query.unreadOnly || false,
    }),
  );
  let offset = 0;
  if (query.cursor) {
    try {
      const [data, sig] = String(query.cursor).split('.');
      if (!equal(hash(c, data), sig)) throw Error();
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (
        parsed.bound !== bound ||
        parsed.exp < c.config.now() ||
        !Number.isInteger(parsed.offset) ||
        parsed.offset < 0
      )
        throw Error();
      offset = parsed.offset;
    } catch {
      fail(400, 'INVALID_CURSOR');
    }
  }
  const count = Number(query.limit || 20),
    items = rows.slice(offset, offset + count);
  let nextCursor = null;
  if (offset + count < rows.length) {
    const data = Buffer.from(
      JSON.stringify({
        offset: offset + count,
        bound,
        exp: c.config.now() + 3600000,
      }),
    ).toString('base64url');
    nextCursor = `${data}.${hash(c, data)}`;
  }
  return { items, nextCursor };
}
