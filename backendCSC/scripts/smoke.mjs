// Check the actual local environment; never connect to or import from a cloud DB.
// Stop the normal backend before running this script. It starts/stops its own API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createApp, createRuntime} from '../dist/app.js';
import {connect, loadConfig, ROOT} from '../dist/core.js';

async function main() {
  const config = loadConfig();
  // Fail before connecting, including when inherited shell variables override .env.
  assert.equal(config.dbMode, 'embedded', 'check:local requires DB_MODE=embedded');
  assert.equal(config.env, 'development', 'Use the normal local development environment');
  assert(!config.databaseUrl, 'Remove the inactive cloud URL from the loaded environment');
  assert.equal(config.databaseSchema, 'public');
  assert.equal(config.host, '127.0.0.1', 'The API must bind only to loopback');
  assert.equal(config.origin, `http://127.0.0.1:${config.port}`);
  assert.equal(config.mailMode, 'local');
  assert.equal(config.storageMode, 'local');
  assert(!config.redisUrl, 'The local setup must use the in-process worker');
  assert.equal(config.billingMode, 'demo');
  const dataDir = path.resolve(config.dataDir);
  const postgresDir = path.join(dataDir, 'postgres');
  await fs.access(path.join(postgresDir, 'PG_VERSION')); // Never initialize a DB here.

  let scannedFiles = 0;
  async function scan(dir) {
    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
      if (['node_modules', '.gradle', '.cxx', 'build', 'dist', 'Pods', 'artifacts', 'source'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (/\.(?:tsx?|jsx?|[cm]js|json|xml|gradle|properties|plist|swift|kt|md|ya?ml|toml)$/.test(entry.name) || entry.name.startsWith('.env')) {
        const content = await fs.readFile(file, 'utf8');
        scannedFiles++;
        assert(!content.includes(config.secret) && !/sb_secret_[a-zA-Z0-9_-]{16,}/.test(content),
          `Backend secret found in ${path.relative(ROOT, file)}`);
      }
    }
  }
  for (const folder of ['frontend', 'admin-dashboard']) await scan(path.resolve(ROOT, '..', folder));

  // Any accidental pg connection must fail locally, without contacting a database.
  let postgresTcpAttempts = 0;
  const originalClient = pg.Client.prototype.connect;
  const originalPool = pg.Pool.prototype.connect;
  const forbidPostgres = () => {
    postgresTcpAttempts++;
    throw Error('TCP PostgreSQL is forbidden in this check');
  };
  pg.Client.prototype.connect = pg.Pool.prototype.connect = forbidPostgres;
  let db, runtime, app;
  const checks = [];
  const demoAuth = process.argv.includes('--demo-auth');
  try {
    db = await connect(config);
    const [database] = await db.query(`SELECT current_database() AS name, current_schema() AS schema,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE') AS tables,
      (SELECT count(*)::int FROM courses) AS courses,
      (SELECT count(*)::int FROM lessons) AS lessons,
      (SELECT count(*)::int FROM users) AS users`);
    assert.equal(database.schema, 'public');
    assert(database.tables >= 36, 'Expected the initialized application schema');
    const migrations = (await db.query('SELECT name FROM schema_migrations ORDER BY name')).map(row => row.name);
    const expected = (await fs.readdir(path.join(ROOT, 'database'))).filter(name => name.endsWith('.sql')).sort();
    assert.deepEqual(migrations, expected, 'Pending schema changes: review them before running this check');
    const coursesBefore = await db.query('SELECT id, title FROM courses ORDER BY id');
    await db.close(); db = undefined;

    // No test-mode DB override: this is the same loader/runtime used by npm start.
    runtime = await createRuntime();
    assert.equal(path.resolve(runtime.c.config.dataDir), dataDir);
    assert.deepEqual(await runtime.c.db.query('SELECT id, title FROM courses ORDER BY id'), coursesBefore,
      'Course data must persist after closing and reopening the database');
    app = await createApp(runtime);
    await app.listen(config.port, config.host);
    const address = app.getHttpServer().address();
    assert.equal(address.address, '127.0.0.1', 'The actual listening socket must be loopback');
    assert.equal(address.port, config.port);

    async function call(route, method = 'GET', body, expectedStatus = 200, accessToken) {
      const response = await fetch(`${config.origin}/v1${route}`, {
        method, signal: AbortSignal.timeout(30000),
        headers: {...(body ? {'Content-Type': 'application/json'} : {}),
          ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {})},
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, expectedStatus, `${method} ${route} returned an unexpected status`);
      checks.push({method, route, status: response.status});
      return response.status === 204 ? undefined : (await response.json()).data;
    }
    await call('/health/live');
    await call('/health/ready');
    const docs = await fetch(`${config.origin}/docs/`, {signal: AbortSignal.timeout(15000)});
    assert.equal(docs.status, 200);
    await docs.arrayBuffer();

    // Opt-in: creates/revokes only its own demo sessions and rate-limit entries.
    // No user deletion, purchase, seed, background jobs or cleanup.
    if (demoAuth) {
      const accounts = JSON.parse(await fs.readFile(path.join(dataDir, 'demo-accounts.json'), 'utf8'));
      await call('/me', 'GET', undefined, 401);
      await call('/auth/login', 'POST', {...accounts.learner, password: randomUUID(), installationId: randomUUID(), rememberMe: false}, 401);
      for (const role of ['learner', 'admin']) {
        const session = await call('/auth/login', 'POST', {...accounts[role], installationId: randomUUID(), rememberMe: false});
        const user = await call('/me', 'GET', undefined, 200, session.accessToken);
        assert.equal(user.id, session.user.id);
        if (role === 'learner') {
          const catalog = await call('/courses', 'GET', undefined, 200, session.accessToken);
          assert(catalog.items.length > 0, 'Seeded courses must be visible through the API');
        }
        await call('/admin/overview', 'GET', undefined, role === 'admin' ? 200 : 403, session.accessToken);
        await call('/auth/logout', 'POST', undefined, 204, session.accessToken);
        await call('/me', 'GET', undefined, 401, session.accessToken);
      }
    }

    await app.close(); app = undefined;
    await runtime.close(); runtime = undefined;
    assert.equal(postgresTcpAttempts, 0);
    assert.equal(await fs.stat(path.join(dataDir, 'postgres.lock')).then(() => true, () => false), false);
    const result = {
      checkedAt: new Date().toISOString(), mode: config.dbMode, environment: config.env,
      apiOrigin: config.origin, listener: address, database, migrations,
      dataDir, postgresDir, persistenceVerified: true, postgresTcpAttempts,
      frontendSecretScan: {scannedFiles, matches: 0},
      checks, swagger: docs.status, demoAuth, workerStarted: false,
      apiStopped: true, databaseClosed: true, lockReleased: true,
    };
    await fs.mkdir(path.join(ROOT, 'test-results'), {recursive: true});
    const report = demoAuth ? 'embedded-local-auth.json' : 'embedded-local.json';
    await fs.writeFile(path.join(ROOT, 'test-results', report), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    try { await app?.close(); }
    finally {
      try { await runtime?.close(); await db?.close(); }
      finally {
        pg.Client.prototype.connect = originalClient;
        pg.Pool.prototype.connect = originalPool;
      }
    }
  }
}

main().catch(error => {
  // Never print raw errors/configuration, credentials, response bodies or tokens.
  console.error(JSON.stringify({status: 'failed', code: error.code || 'CHECK_FAILED',
    reason: error instanceof assert.AssertionError ? error.message :
      'Local check failed. Check that the API is stopped, the local database is initialized, and the build is current.'}));
  process.exitCode = 1;
});
