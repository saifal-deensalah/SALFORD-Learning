// Opt-in: creates two dedicated local test accounts, never deletes them or migrates.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import argon2 from 'argon2';
import {loadConfig, connect, ROOT} from '../dist/core.js';
import {Runtime, createApp} from '../dist/app.js';

const config = loadConfig();
assert(config.env === 'development' && config.dbMode === 'embedded' && config.localEmailAuth, 'Requires development + embedded + LOCAL_EMAIL_AUTH=true');
assert.equal(config.host, '127.0.0.1', 'Requires loopback');
assert(!config.databaseUrl && !config.redisUrl, 'External database/queue settings are not allowed');
await fs.access(path.join(config.dataDir, 'postgres/PG_VERSION')); // Never initialize here.
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

if (process.argv[2] === '--child') {
  const fixture = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
  const db = await connect(config);
  const runtime = new Runtime({config: {...config, worker: false}, db});
  let app;
  try {
    const applied = (await db.query('SELECT name FROM schema_migrations ORDER BY name')).map(r => r.name);
    const expected = (await fs.readdir(path.join(ROOT, 'database'))).filter(n => n.endsWith('.sql')).sort();
    assert.deepEqual(applied, expected, 'Pending migrations: stop and review; this script never migrates');
    if (process.argv.includes('--prepare-legacy')) {
      // Only a new, dedicated fixture: simulates an account created before the setting.
      const passwordHash = await argon2.hash(fixture.password, {type: argon2.argon2id});
      await db.tx(async tx => {
        const [user] = await tx.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [fixture.legacyEmail, 'Local auth legacy test', passwordHash]);
        await tx.query('INSERT INTO user_settings(user_id) VALUES($1)', [user.id]);
      });
    }
    const snapshot = async () => {
      const users = await db.query('SELECT id,email,password_hash,email_verified_at,role,status,created_at,updated_at FROM users ORDER BY id');
      const fixtures = users.filter(u => [fixture.email, fixture.legacyEmail].includes(u.email));
      return {
        otherUsersDigest: digest(users.filter(u => ![fixture.email, fixture.legacyEmail].includes(u.email))),
        fixtures: await Promise.all(fixtures.map(async u => ({id: u.id, email: u.email, rowDigest: digest(u), argon2id: u.password_hash.startsWith('$argon2id$'), passwordMatches: await argon2.verify(u.password_hash, fixture.password), verified: !!u.email_verified_at, role: u.role}))),
        challenges: Number((await db.query('SELECT count(*) n FROM auth_challenges WHERE user_id=ANY($1::uuid[])', [fixtures.map(u => u.id)]))[0].n),
        mailDigest: digest(await db.query("SELECT id FROM outbox_events WHERE topic='email' ORDER BY id")),
      };
    };
    app = await createApp(runtime);
    await app.listen(config.port, config.host);
    process.send({event: 'ready', pid: process.pid, address: app.getHttpServer().address(), snapshot: await snapshot()});
    process.on('message', async message => {
      if (message === 'snapshot') process.send({event: 'snapshot', snapshot: await snapshot()});
      if (message === 'stop') {
        await app.close(); await runtime.close(); process.exit(0);
      }
    });
  } catch {
    await app?.close(); await runtime.close(); process.exitCode = 1; process.disconnect();
  }
} else {
  // Refuse before connecting or creating fixtures when the normal server is running.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(Error('Stop the normal backend with Ctrl+C first; nothing was changed.')));
    probe.listen(config.port, config.host, () => probe.close(resolve));
  });
  const directory = path.join(ROOT, '.local/auth-review', randomUUID());
  await fs.mkdir(directory, {recursive: true});
  const fixture = {email: `auth-review-${randomUUID()}@example.test`, legacyEmail: `auth-legacy-${randomUUID()}@example.test`, password: randomBytes(24).toString('base64url')};
  const accounts = path.join(directory, 'accounts.json');
  await fs.writeFile(accounts, JSON.stringify(fixture, null, 2), {mode: 0o600});
  let child;
  const receive = event => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {cleanup(); reject(Error(`Timed out waiting for local test ${event}`));}, 45000);
    const message = data => {if (data.event === event) {cleanup(); resolve(data);}};
    const exited = () => {cleanup(); reject(Error('Local test backend exited unexpectedly'));};
    const cleanup = () => {clearTimeout(timer); child.off('message', message); child.off('exit', exited);};
    child.on('message', message); child.once('exit', exited);
  });
  const start = async prepare => {
    child = fork(fileURLToPath(import.meta.url), ['--child', accounts, ...(prepare ? ['--prepare-legacy'] : [])], {cwd: ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    const ready = await receive('ready');
    assert.equal(ready.address.address, '127.0.0.1');
    assert.equal(ready.address.port, config.port);
    return ready;
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const ended = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Backend did not stop gracefully; no forced stop attempted')), 30000);
      child.once('exit', code => {clearTimeout(timer); code === 0 ? resolve() : reject(Error('Backend shutdown failed'));});
    });
    child.send('stop'); await ended;
  };
  const checks = [];
  async function call(route, method = 'GET', body, status = 200, token) {
    const response = await fetch(`http://127.0.0.1:${config.port}/v1${route}`, {method, signal: AbortSignal.timeout(20000), headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})}, body: body ? JSON.stringify(body) : undefined});
    assert.equal(response.status, status, `${method} ${route}: unexpected HTTP status`);
    checks.push({route, method, status});
    return status === 204 ? undefined : (await response.json()).data;
  }
  const login = (email, password = fixture.password, status = 200) => call('/auth/login', 'POST', {email, password, installationId: randomUUID(), rememberMe: false}, status);
  try {
    const first = await start(true);
    await call('/health/ready');
    const created = await call('/auth/register', 'POST', {email: fixture.email, password: fixture.password}, 202);
    assert.equal(created.emailVerificationRequired, false);
    await call('/auth/register', 'POST', {email: fixture.email, password: fixture.password}, 409);
    await login(fixture.email, 'wrong-password', 401);
    const session = await login(fixture.email), legacy = await login(fixture.legacyEmail);
    assert.equal(session.user.emailVerificationRequired, false);
    assert.equal(session.user.role, 'student');
    await call('/me', 'GET', undefined, 401);
    await call('/me', 'GET', undefined, 200, session.accessToken);
    await call('/admin/courses', 'GET', undefined, 403, session.accessToken);
    await call('/auth/logout', 'POST', undefined, 204, session.accessToken);
    await call('/me', 'GET', undefined, 401, session.accessToken);
    await call('/auth/logout', 'POST', undefined, 204, legacy.accessToken);
    const pending = receive('snapshot'); child.send('snapshot');
    const {snapshot: beforeRestart} = await pending;
    assert.equal(beforeRestart.otherUsersDigest, first.snapshot.otherUsersDigest);
    assert.equal(beforeRestart.mailDigest, first.snapshot.mailDigest);
    assert.equal(beforeRestart.challenges, 0);
    assert(beforeRestart.fixtures.every(u => u.argon2id && u.passwordMatches && !u.verified && u.role === 'student'));
    assert.equal(beforeRestart.fixtures.find(u => u.email === fixture.legacyEmail).rowDigest, first.snapshot.fixtures[0].rowDigest);
    await stop();
    const second = await start(false);
    assert.notEqual(first.pid, second.pid, 'Must restart the actual backend process');
    assert.deepEqual(second.snapshot, beforeRestart, 'Database rows must survive a process restart');
    const again = await login(fixture.email);
    assert.equal(again.user.id, session.user.id);
    await call('/auth/logout', 'POST', undefined, 204, again.accessToken);
    const report = {checkedAt: new Date().toISOString(), success: true, database: path.join(config.dataDir, 'postgres'), loopback: true, processRestarted: true, passwordHashVerified: true, oldUnverifiedAccountUnchanged: true, otherUsersUnchanged: true, noActivationMail: true, fixturesRetained: true, checks};
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`Private test credentials and report: ${directory}`);
  } finally { await stop(); }
}
