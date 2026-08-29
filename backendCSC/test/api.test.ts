import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  createRuntime,
  createApp,
  operations,
  contract,
  Runtime,
} from '../src/app.js';
import { seed } from '../src/seed.js';
import { ROOT, ApiError, hash, connect, loadConfig, verified } from '../src/core.js';
import argon2 from 'argon2';
import { mergeRanges } from '../src/learning.js';
import { persistPurchase, syncCheckout } from '../src/billing.js';
import { canAccess } from '../src/catalog.js';
const require = createRequire(import.meta.url),
  Ajv = require('ajv').default,
  addFormats = require('ajv-formats');
const password = 'Test-password-12345',
  installationId = randomUUID(),
  coverage = new Set<string>();

test('Desktop client rejects stale sessions, preserves offline sessions and validates responses', async () => {
  const originalFetch = globalThis.fetch;
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = Object.assign(new EventTarget(), {location: {origin: 'http://127.0.0.1:5173'}});
  Object.defineProperty(globalThis, 'window', {value: target, configurable: true});
  const client = await import('../../admin-dashboard/src/api.ts');
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(status >= 400 ? {error: {code: 'UNAUTHORIZED'}} : {data}), {status});
  const userSession = {accessToken: 'test-access', refreshToken: 'test-refresh', user: {id: 'test-admin', role: 'admin'}};
  const tick = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
  try {
    globalThis.fetch = async () => reply(userSession);
    await client.login('admin@example.test', 'test-only', '');
    let resolveRefresh!: (response: Response) => void;
    const pendingRefresh = new Promise<Response>(resolve => {resolveRefresh = resolve;});
    globalThis.fetch = async input => String(input).endsWith('/auth/refresh') ? pendingRefresh : String(input).endsWith('/auth/logout') ? new Response(null, {status: 204}) : reply(null, 401);
    const pending = client.api('/me').catch(error => error);
    await tick();
    await client.logout();
    resolveRefresh(reply(userSession));
    assert.equal((await pending).code, 'SESSION_CHANGED');
    assert.equal(client.hasSession(), false);

    globalThis.fetch = async () => reply(userSession);
    await client.login('admin@example.test', 'test-only', '');
    globalThis.fetch = async input => {
      if (String(input).endsWith('/auth/refresh')) throw new Error('offline');
      return reply(null, 401);
    };
    await assert.rejects(client.api('/me'), /Cannot reach/);
    assert(client.hasSession());
    globalThis.fetch = async () => new Response('{"unexpected":true}');
    await assert.rejects(client.api('/me'), /invalid response/);
    const external = 'https://storage.example.test/v1/media/uploads/id?signature=test';
    assert.equal(client.mediaUrl(external), external);
    assert.equal(client.mediaUrl('http://127.0.0.1:3000/v1/media/images/id'), '/v1/media/images/id');
  } finally {
    globalThis.fetch = async () => new Response(null, {status: 204});
    await client.logout();
    globalThis.fetch = originalFetch;
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
let runtime: Runtime,
  app: any,
  base: string,
  admin: string,
  student: string,
  other: string,
  programming: any,
  paid: any,
  enrollment: any,
  lessons: any[],
  certificate: any,
  product: any,
  userId: string;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(contract, 'contract');
const validators = new Map<string, any>();
async function api(
  id: string,
  options: {
    body?: any;
    params?: any;
    query?: any;
    token?: string;
    headers?: any;
    status?: number;
  } = {}
) {
  const op = operations.find((o) => o.operationId === id);
  assert(op, id);
  coverage.add(id);
  let route = op.route.replace(
    /\{([^}]+)\}/g,
    (_: string, key: string) => options.params[key]
  );
  if (options.query) route += '?' + new URLSearchParams(options.query);
  const response = await fetch(base + '/v1' + route, {
    method: op.method.toUpperCase(),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text(),
    json = text ? JSON.parse(text) : undefined;
  if (options.status !== undefined)
    assert.equal(response.status, options.status, `${id}: ${text}`);
  if (response.status < 300 && response.status !== 204) {
    const key = `${id}:${response.status}`;
    let validate = validators.get(key);
    if (!validate) {
      validate = ajv.compile({
        $ref: `contract#/paths/${op.route
          .replace(/~/g, '~0')
          .replace(/\//g, '~1')}/${op.method}/responses/${
          response.status
        }/content/application~1json/schema`,
      });
      validators.set(key, validate);
    }
    assert(
      validate(json),
      `${id}: invalid response ${JSON.stringify(validate.errors)}`
    );
  }
  return {
    status: response.status,
    data: json?.data,
    error: json?.error,
    headers: response.headers,
  };
}
const login = async (email: string, installation = installationId) =>
  (
    await api('login', {
      body: { email, password, installationId: installation, rememberMe: true },
      status: 200,
    })
  ).data;
async function emailToken(to: string, reset = false) {
  await runtime.jobs.drain();
  const dir = path.join(runtime.c.config.dataDir, 'mail'),
    files = await readdir(dir);
  for (const file of files) {
    const mail = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    if (mail.to !== to || mail.subject.includes('Reset') !== reset) continue;
    const token = new URL(
      mail.text.match(/https?:\/\/[^\s]+/)[0]
    ).searchParams.get('token')!;
    const [ch] = await runtime.c.db.query(
      'SELECT * FROM auth_challenges WHERE token_hash=$1 AND consumed_at IS NULL',
      [hash(runtime.c, token)]
    );
    if (ch) return token;
  }
  throw Error('No local email token');
}
before(
  async () => {
    runtime = await createRuntime({
      config: {
        env: 'test',
        billingMode: 'provider-test',
        dataDir: path.join(ROOT, '.local', 'tests', randomUUID()),
        port: 0,
        secret: 'test-secret-not-production-'.repeat(3),
      },
      testVerifier: async (provider, evidence, p, u) => {
        if (evidence !== 'valid-purchase')
          throw new ApiError(422, 'INVALID_PURCHASE');
        return {
          externalId: 'one-store-subscription',
          transactionId: 'one-transaction',
          binding: u.billing_account_id,
          productId: p.external_product_id,
          status: 'active',
          start: new Date(Date.now() - 1000).toISOString(),
          end: new Date(Date.now() + 86400000).toISOString(),
          autoRenew: true,
          environment: 'sandbox',
        };
      },
    });
    await seed(runtime.c, password);
    app = await createApp(runtime);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    runtime.c.config.origin = base;
    admin = (await login('admin@salford.test')).accessToken;
    const s = await login('learner@salford.test');
    student = s.accessToken;
    userId = s.user.id;
    const [otherUser] = await runtime.c.db.query(
      "INSERT INTO users(email,name,password_hash,email_verified_at) SELECT 'other@salford.test','Other',password_hash,now() FROM users WHERE id=$1 RETURNING *",
      [userId]
    );
    await runtime.c.db.query('INSERT INTO user_settings(user_id) VALUES($1)', [
      otherUser.id,
    ]);
    other = (await login(otherUser.email, randomUUID())).accessToken;
    programming = (
      await api('listCourses', {
        token: student,
        query: { q: 'Programming' },
        status: 200,
      })
    ).data.items[0];
    paid = (
      await api('listCourses', {
        token: student,
        query: { q: 'Figma' },
        status: 200,
      })
    ).data.items[0];
  },
  { timeout: 120000 }
);
after(async () => {
  await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'test-results', 'coverage.json'),
    JSON.stringify(
      {
        httpOperationsExercised: coverage.size,
        total: operations.length,
        exercised: [...coverage].sort(),
        notExercised: operations
          .filter((o) => !coverage.has(o.operationId))
          .map((o) => o.operationId),
        note: 'Live-provider success paths require separate provider credentials and sandbox tests.',
      },
      null,
      2
    )
  );
  await app?.close();
  await runtime?.close();
});

test('All contract operations have handlers and health endpoints respond', async () => {
  assert.equal(operations.length, 78);
  for (const op of operations)
    assert.equal(typeof runtime.handlers()[op.operationId], 'function');
  await api('liveness', { status: 200 });
  await api('readiness', { status: 200 });
  assert.equal((await fetch(base + '/admin/')).status, 404, 'The removed admin website must not be served');
});

test('Automated tests cannot inherit the live Supabase database configuration', () => {
  const previous = {mode:process.env.DB_MODE,url:process.env.DATABASE_URL,schema:process.env.DATABASE_SCHEMA};
  try {
    process.env.DB_MODE = 'postgres';
    process.env.DATABASE_URL = 'postgresql://example.invalid/never-connect';
    process.env.DATABASE_SCHEMA = 'csc';
    const config = loadConfig({env:'test',dataDir:runtime.c.config.dataDir});
    assert.equal(config.dbMode, 'embedded');
    assert.equal(config.databaseUrl, undefined);
    assert.equal(config.databaseSchema, 'public');
    assert.throws(() => loadConfig({env:'test',databaseSchema:'csc; DROP SCHEMA public',dataDir:runtime.c.config.dataDir}), /Invalid DATABASE_SCHEMA/);
  } finally {
    for (const [key,value] of Object.entries({DB_MODE:previous.mode,DATABASE_URL:previous.url,DATABASE_SCHEMA:previous.schema})) {
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});

test('Authentication and admin boundaries reject unauthorized access', async () => {
  await api('getMe', { status: 401 });
  await api('getMe', { token: 'forged', status: 401 });
  await api('adminListCourses', { token: student, status: 403 });
  await api('adminListCourses', { token: admin, status: 200 });
  await api('login', {
    body: {
      email: 'learner@salford.test',
      password: 'wrong',
      installationId,
      rememberMe: true,
    },
    status: 401,
  });
});
test('Registration sends a local verification email and rejects role escalation', async () => {
  await api('register', {
    body: { email: 'new@salford.test', password, role: 'admin' },
    status: 422,
  });
  await api('register', {
    body: { email: 'new@salford.test', password, name: 'New learner' },
    status: 202,
  });
  await api('requestVerification', {
    body: { email: 'new@salford.test' },
    status: 202,
  });
  const value = await emailToken('new@salford.test');
  await api('verifyEmail', { body: { token: value }, status: 200 });
  await api('verifyEmail', { body: { token: value }, status: 400 });
  const session = await login('new@salford.test', randomUUID());
  assert.equal(session.user.emailVerified, true);
});

test('Local email policy is explicitly restricted to development, embedded DB and loopback', () => {
  const local = {env: 'development', dbMode: 'embedded', localEmailAuth: true, dataDir: runtime.c.config.dataDir, secret: runtime.c.config.secret, host: '127.0.0.1'};
  assert.equal(loadConfig(local).localEmailAuth, true);
  for (const invalid of [{env: 'production'}, {env: 'test'}, {dbMode: 'postgres'}, {host: '0.0.0.0'}]) {
    assert.throws(() => loadConfig({...local, ...invalid}), /LOCAL_EMAIL_AUTH requires/);
  }
  assert.equal(loadConfig({env: 'test', dataDir: runtime.c.config.dataDir}).localEmailAuth, false);
});

test('Local email accounts use real passwords, support old unverified users and preserve security', async () => {
  const previous = runtime.c.config;
  const oldEmail = 'old-local-policy@salford.test', newEmail = 'new-local-policy@salford.test';
  await api('register', {body: {email: oldEmail, password}, status: 202});
  const [oldBefore] = await runtime.c.db.query('SELECT * FROM users WHERE email=$1', [oldEmail]);
  assert.equal(oldBefore.email_verified_at, null);
  assert.throws(() => verified({user: oldBefore} as any, runtime.c), /EMAIL_NOT_VERIFIED/);
  const mailBefore = await runtime.c.db.query("SELECT id FROM outbox_events WHERE topic='email' ORDER BY id");
  runtime.c.config = loadConfig({...previous, env: 'development', billingMode: 'demo', localEmailAuth: true});
  try {
    const created = await api('register', {body: {email: newEmail, password}, status: 202});
    assert.equal(created.data.emailVerificationRequired, false);
    await api('register', {body: {email: newEmail, password}, status: 409});
    await api('register', {body: {email: 'escalate-local@salford.test', password, role: 'admin'}, status: 422});
    await api('register', {body: {email: 'weak-local@salford.test', password: 'short'}, status: 422});
    await api('requestVerification', {body: {email: newEmail}, status: 202});
    assert.deepEqual(await runtime.c.db.query("SELECT id FROM outbox_events WHERE topic='email' ORDER BY id"), mailBefore);
    const [stored] = await runtime.c.db.query('SELECT * FROM users WHERE email=$1', [newEmail]);
    assert(stored.password_hash.startsWith('$argon2id$'));
    assert(await argon2.verify(stored.password_hash, password));
    assert.equal(stored.email_verified_at, null, 'Do not pretend to verify email ownership');
    assert.equal((await runtime.c.db.query('SELECT id FROM auth_challenges WHERE user_id=$1', [stored.id])).length, 0);
    const current = await login(newEmail), legacy = await login(oldEmail);
    assert.equal(current.user.role, 'student');
    assert.equal(current.user.emailVerificationRequired, false);
    assert.equal(current.user.emailVerified, false);
    assert.equal(legacy.user.id, oldBefore.id);
    const [oldAfter] = await runtime.c.db.query('SELECT * FROM users WHERE id=$1', [oldBefore.id]);
    assert.deepEqual(oldAfter, oldBefore);
    verified({user: oldAfter} as any, runtime.c);
    await api('login', {body: {email: newEmail, password: 'wrong-password', installationId, rememberMe: false}, status: 401});
    await api('getMe', {status: 401});
    await api('getMe', {token: current.accessToken, status: 200});
    await api('adminListCourses', {token: current.accessToken, status: 403});
    await api('logout', {token: current.accessToken, status: 204});
    await api('getMe', {token: current.accessToken, status: 401});
    await runtime.c.db.query("UPDATE users SET status='suspended' WHERE id=$1", [stored.id]);
    await api('login', {body: {email: newEmail, password, installationId, rememberMe: false}, status: 401});
  } finally {
    runtime.c.config = previous;
  }
});
test('Reset is single-use and invalidates sessions', async () => {
  const s = await login('new@salford.test', randomUUID());
  await api('requestPasswordReset', {
    body: { email: 'new@salford.test' },
    status: 202,
  });
  const value = await emailToken('new@salford.test', true);
  await api('resetPassword', {
    body: { token: value, newPassword: password },
    status: 200,
  });
  await api('getMe', { token: s.accessToken, status: 401 });
  await api('resetPassword', {
    body: { token: value, newPassword: password },
    status: 400,
  });
});
test('Refresh token rotation detects replay and revokes the family', async () => {
  const device = randomUUID(),
    s = await login('other@salford.test', device);
  const renewed = await api('refreshSession', {
    body: { refreshToken: s.refreshToken, installationId: device },
    status: 200,
  });
  await api('refreshSession', {
    body: { refreshToken: s.refreshToken, installationId: device },
    status: 401,
  });
  await api('getMe', { token: renewed.data.accessToken, status: 401 });
});
test('Profile, preferences and email change require verified replacement', async () => {
  await api('updateMe', {
    token: student,
    body: { name: 'Updated Learner' },
    status: 200,
  });
  const prefs = await api('updateSettings', {
    token: student,
    body: { learningNotifications: false },
    status: 200,
  });
  assert.equal(prefs.data.learningNotifications, false);
  await api('getSettings', { token: student, status: 200 });
  const s = await login('new@salford.test', randomUUID());
  await api('requestEmailChange', {
    token: s.accessToken,
    body: { newEmail: 'changed@salford.test' },
    status: 202,
  });
  assert.equal(
    (await api('getMe', { token: s.accessToken, status: 200 })).data.email,
    'new@salford.test'
  );
  await api('verifyEmail', {
    body: { token: await emailToken('changed@salford.test') },
    status: 200,
  });
  await api('getMe', { token: s.accessToken, status: 401 });
});
test('Social providers fail closed without credentials, never fake a login', async () => {
  const challenge = (
    await api('createSocialChallenge', {
      body: { provider: 'google', installationId },
      status: 201,
    })
  ).data;
  const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_IDS', 'APPLE_CLIENT_ID'] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    // Blank dotenv values and comma/whitespace lists mean unconfigured too.
    for (const value of [undefined, '', ' ,  , ']) {
      for (const key of keys) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      for (const operation of ['loginGoogle', 'loginApple'])
        await api(operation, {
          body: {
            challengeId: challenge.challengeId,
            idToken: 'forged',
            ...(operation === 'loginApple' ? {authorizationCode: 'forged'} : {}),
            installationId,
            rememberMe: true,
          },
          status: 503,
        });
    }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
test('Catalog search, categories, home, pagination and empty results', async () => {
  await api('getHome', { token: student, status: 200 });
  await api('listCategories', { token: student, status: 200 });
  const p = (
    await api('listCourses', {
      token: student,
      query: { limit: '2' },
      status: 200,
    })
  ).data;
  assert.equal(p.items.length, 2);
  const next = (
    await api('listCourses', {
      token: student,
      query: { limit: '2', cursor: p.nextCursor },
      status: 200,
    })
  ).data;
  assert.notEqual(p.items[0].id, next.items[0].id);
  await api('listCourses', {
    token: student,
    query: { q: 'different', cursor: p.nextCursor },
    status: 400,
  });
  assert.equal(
    (
      await api('listCourses', {
        token: student,
        query: { q: 'missing-xyz' },
        status: 200,
      })
    ).data.items.length,
    0
  );
  await api('getCourse', {
    token: student,
    params: { courseId: programming.id },
    status: 200,
  });
  lessons = (
    await api('getCurriculum', {
      token: student,
      params: { courseId: programming.id },
      status: 200,
    })
  ).data.chapters[0].lessons;
});
test('Bookmarks are idempotent and isolated by account', async () => {
  for (let n = 0; n < 2; n++)
    await api('saveBookmark', {
      token: student,
      params: { courseId: programming.id },
      status: 204,
    });
  assert.equal(
    (await api('listBookmarks', { token: student, status: 200 })).data.items
      .length,
    1
  );
  assert.equal(
    (await api('listBookmarks', { token: other, status: 200 })).data.items
      .length,
    0
  );
  await api('removeBookmark', {
    token: student,
    params: { courseId: programming.id },
    status: 204,
  });
});
test('Enrollment enforces verified paid access and idempotency', async () => {
  await api('enroll', {
    token: student,
    params: { courseId: paid.id },
    headers: { 'Idempotency-Key': randomUUID() },
    status: 403,
  });
  const key = randomUUID();
  enrollment = (
    await api('enroll', {
      token: student,
      params: { courseId: programming.id },
      headers: { 'Idempotency-Key': key },
      status: 201,
    })
  ).data;
  assert.equal(
    (
      await api('enroll', {
        token: student,
        params: { courseId: programming.id },
        headers: { 'Idempotency-Key': key },
        status: 201,
      })
    ).data.id,
    enrollment.id
  );
  await api('enroll', {
    token: student,
    params: { courseId: paid.id },
    headers: { 'Idempotency-Key': key },
    status: 409,
  });
  await api('getProgress', {
    token: other,
    params: { enrollmentId: enrollment.id },
    status: 404,
  });
  await api('listMyCourses', { token: student, status: 200 });
});
test('Protected HLS playlist and segments work; forged grants fail', async () => {
  const playback = (
    await api('startPlayback', {
      token: student,
      params: { lessonId: lessons[0].id },
      body: { enrollmentId: enrollment.id },
      status: 201,
    })
  ).data;
  const response = await fetch(playback.streamUrl);
  assert.equal(response.status, 200);
  const manifest = await response.text();
  assert.match(manifest, /#EXTM3U/);
  const segment = manifest.split('\n').find((l) => l && !l.startsWith('#'))!;
  assert.match(segment, /signature=/);
  assert.equal((await fetch(new URL(segment, playback.streamUrl))).status, 200);
  const bad = new URL(playback.streamUrl);
  bad.searchParams.set('signature', 'bad');
  assert.equal((await fetch(bad)).status, 403);
});
test('Seeking or ending immediately cannot complete a lesson', async () => {
  const play = (
    await api('startPlayback', {
      token: student,
      params: { lessonId: lessons[0].id },
      body: { enrollmentId: enrollment.id },
      status: 201,
    })
  ).data;
  const event = {
    eventId: randomUUID(),
    sequence: 1,
    kind: 'ended',
    positionSeconds: play.durationSeconds,
    playbackRate: 1,
  };
  const first = (
    await api('recordPlayback', {
      token: student,
      params: { playbackSessionId: play.playbackSessionId },
      body: { events: [event] },
      status: 200,
    })
  ).data;
  assert.equal(first.lesson.completed, false);
  assert.equal(first.lesson.watchedSeconds, 0);
  await api('recordPlayback', {
    token: other,
    params: { playbackSessionId: play.playbackSessionId },
    body: { events: [event] },
    status: 404,
  });
  const repeated = (
    await api('recordPlayback', {
      token: student,
      params: { playbackSessionId: play.playbackSessionId },
      body: { events: [event] },
      status: 200,
    })
  ).data;
  assert.equal(repeated.lesson.watchedSeconds, 0);
  await api('recordPlayback', {
    token: student,
    params: { playbackSessionId: play.playbackSessionId },
    body: { events: [{ ...event, positionSeconds: 0 }] },
    status: 409,
  });
});
test('Native playback tolerates arrival jitter without granting unearned watch time', async () => {
  const previousClock = runtime.c.config.now;
  const start = Date.now();
  let elapsed = 0;
  runtime.c.config.now = () => start + elapsed;
  try {
    const play = (await api('startPlayback', {token: student, params: {lessonId: lessons[0].id}, body: {enrollmentId: enrollment.id}, status: 201})).data;
    // Timing and positions observed from the Android emulator, after a seek.
    const events: [number, string, number][] = [[0,'seek',0], [10604,'heartbeat',1.173], [25617,'heartbeat',16.946], [26445,'pause',17.96], [26734,'ended',18]];
    let result: any;
    for (const [index, [time, kind, positionSeconds]] of events.entries()) {
      elapsed = time;
      result = (await api('recordPlayback', {token: student, params: {playbackSessionId: play.playbackSessionId}, body: {events: [{eventId: randomUUID(), sequence: index + 1, kind, positionSeconds, playbackRate: 1}]}, status: 200})).data;
    }
    assert.equal(result.lesson.completed, true);
    assert(result.lesson.watchedSeconds >= 17.1 && result.lesson.watchedSeconds <= 18);
    const second = (await api('startPlayback', {token: student, params: {lessonId: lessons[1].id}, body: {enrollmentId: enrollment.id}, status: 201})).data;
    const send = async (sequence: number, kind: string, positionSeconds: number) => (await api('recordPlayback', {token: student, params: {playbackSessionId: second.playbackSessionId}, body: {events: [{eventId: randomUUID(), sequence, kind, positionSeconds, playbackRate: 1}]}, status: 200})).data;
    await send(1, 'seek', 0);
    for (let sequence = 2; sequence <= 6; sequence++) {
      const receipt = await send(sequence, 'heartbeat', (sequence - 1) * 0.2);
      assert.equal(receipt.lesson.watchedSeconds, 0, 'Repeated sub-second events cannot manufacture time');
    }
  } finally {
    runtime.c.config.now = previousClock;
  }
});

test('Validated heartbeats complete required lessons and issue one PDF certificate', async () => {
  for (const lesson of lessons) {
    const play = (
      await api('startPlayback', {
        token: student,
        params: { lessonId: lesson.id },
        body: { enrollmentId: enrollment.id },
        status: 201,
      })
    ).data;
    await api('recordPlayback', {
      token: student,
      params: { playbackSessionId: play.playbackSessionId },
      body: {
        events: [
          {
            eventId: randomUUID(),
            sequence: 1,
            kind: 'seek',
            positionSeconds: 0,
            playbackRate: 1,
          },
        ],
      },
      status: 200,
    });
    await runtime.c.db.query(
      "UPDATE playback_sessions SET last_received_at=now()-interval '25 seconds' WHERE id=$1",
      [play.playbackSessionId]
    );
    const result = (
      await api('recordPlayback', {
        token: student,
        params: { playbackSessionId: play.playbackSessionId },
        body: {
          events: [
            {
              eventId: randomUUID(),
              sequence: 2,
              kind: 'heartbeat',
              positionSeconds: play.durationSeconds,
              playbackRate: 1,
            },
          ],
        },
        status: 200,
      })
    ).data;
    assert.equal(result.lesson.completed, true);
  }
  assert.equal(
    (
      await api('getProgress', {
        token: student,
        params: { enrollmentId: enrollment.id },
        status: 200,
      })
    ).data.enrollment.progressPercent,
    100
  );
  await runtime.jobs.drain();
  const certificates = (
    await api('listCertificates', { token: student, status: 200 })
  ).data.items;
  assert.equal(certificates.length, 1);
  certificate = certificates[0];
  assert.equal(certificate.status, 'issued');
  assert.equal(certificate.publicCode, null);
  const download = (
    await api('downloadCertificate', {
      token: student,
      params: { certificateId: certificate.id },
      status: 200,
    })
  ).data;
  const file = await fetch(download.url);
  assert.equal(file.status, 200);
  assert.equal(
    Buffer.from(await file.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    '%PDF'
  );
  await api('downloadCertificate', {
    token: other,
    params: { certificateId: certificate.id },
    status: 404,
  });
  await api('getHistory', { token: student, status: 200 });
});
test('Certificate public verification requires explicit sharing opt-in', async () => {
  const [r] = await runtime.c.db.query(
    'SELECT public_code FROM certificates WHERE id=$1',
    [certificate.id]
  );
  await api('verifyCertificate', {
    params: { code: r.public_code },
    status: 404,
  });
  await api('updateSettings', {
    token: student,
    body: { certificatePublic: true },
    status: 200,
  });
  const verified = await api('verifyCertificate', {
    params: { code: r.public_code },
    status: 200,
  });
  assert.equal(verified.data.valid, true);
  assert(!('email' in verified.data));
});
test('Notification ownership and device binding follow authenticated installation', async () => {
  const notifications = (
    await api('listNotifications', { token: student, status: 200 })
  ).data.items;
  assert(notifications.length > 0);
  await api('readNotification', {
    token: other,
    params: { notificationId: notifications[0].id },
    status: 404,
  });
  await api('readNotification', {
    token: student,
    params: { notificationId: notifications[0].id },
    status: 204,
  });
  await api('registerDevice', {
    token: student,
    params: { installationId },
    body: {
      installationId,
      platform: 'android',
      pushToken: 'test-fcm-token',
      permission: 'granted',
    },
    status: 204,
  });
  await api('registerDevice', {
    token: other,
    params: { installationId },
    body: {
      installationId,
      platform: 'android',
      pushToken: 'test-fcm-token',
      permission: 'granted',
    },
    status: 403,
  });
  await api('unregisterDevice', {
    token: student,
    params: { installationId },
    status: 204,
  });
});
test('Admin content editing, upload validation and publish pipeline', async () => {
  const category = (
    await api('createCategory', {
      token: admin,
      body: { slug: 'test-category', name: 'Test' },
      status: 201,
    })
  ).data;
  await api('updateCategory', {
    token: admin,
    params: { categoryId: category.id },
    body: { name: 'Test updated', active: true },
    status: 200,
  });
  const instructor = (
    await api('createInstructor', {
      token: admin,
      body: { name: 'Test instructor', bio: 'Bio' },
      status: 201,
    })
  ).data;
  await api('updateInstructor', {
    token: admin,
    params: { instructorId: instructor.id },
    body: { name: 'Instructor updated', bio: 'Updated' },
    status: 200,
  });
  const content = await readFile(path.join(ROOT, 'assets/course-cover.png'));
  const upload = (
    await api('createUpload', {
      token: admin,
      body: {
        kind: 'image',
        mimeType: 'image/png',
        byteSize: content.length,
        checksumSha256: createHash('sha256').update(content).digest('hex'),
      },
      status: 201,
    })
  ).data;
  assert.equal(
    (
      await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: content,
      })
    ).status,
    204
  );
  await api('completeUpload', {
    token: admin,
    params: { assetId: upload.assetId },
    status: 202,
  });
  await api('getAsset', {
    token: admin,
    params: { assetId: upload.assetId },
    status: 200,
  });
  const course = (
    await api('createCourse', {
      token: admin,
      body: {
        slug: 'admin-course',
        title: 'Admin Course',
        categoryId: category.id,
        instructorId: instructor.id,
        accessType: 'free',
        certificateEnabled: true,
      },
      status: 201,
    })
  ).data;
  const [video] = await runtime.c.db.query(
    "SELECT id FROM media_assets WHERE kind='video' AND status='ready' LIMIT 1"
  );
  const draft = (
    await api('saveCourseDraft', {
      token: admin,
      params: { courseId: course.courseId },
      body: {
        title: 'Published course',
        description: 'Description',
        coverAssetId: upload.assetId,
        categoryId: category.id,
        instructorId: instructor.id,
        accessType: 'free',
        certificateEnabled: true,
        featuredRank: null,
        chapters: [
          {
            title: 'Chapter',
            lessons: [
              {
                title: 'Lesson',
                description: 'Lesson description',
                mediaAssetId: video.id,
                required: true,
                isPreview: true,
              },
            ],
          },
        ],
      },
      status: 200,
    })
  ).data;
  await api('publishCourse', {
    token: admin,
    params: { courseId: course.courseId },
    body: { versionId: draft.versionId },
    status: 200,
  });
  await api('publishCourse', {
    token: admin,
    params: { courseId: course.courseId },
    body: { versionId: draft.versionId },
    status: 404,
  });
  await api('archiveCourse', {
    token: admin,
    params: { courseId: course.courseId },
    status: 200,
  });
  await api('getCourse', {
    token: student,
    params: { courseId: course.courseId },
    status: 404,
  });
});
test('Billing verification is asynchronous, owned, idempotent and provider-verified', async () => {
  const plan = (
    await api('createPlan', {
      token: admin,
      body: {
        code: 'test',
        name: 'Test Plan',
        features: ['Access'],
        certificateEnabled: true,
        courseIds: [paid.id],
        active: false,
      },
      status: 201,
    })
  ).data;
  // Provider product provisioning is external. The test fixture supplies a sandbox mapping.
  [product] = await runtime.c.db.query(
    "INSERT INTO billing_products(plan_id,provider,environment,external_product_id,interval_unit,active) VALUES($1,'google','sandbox','test.monthly','month',true) RETURNING *",
    [plan.id]
  );
  await api('updatePlan', {
    token: admin,
    params: { planId: plan.id },
    body: {
      code: 'test',
      name: 'Test Plan',
      features: ['Access'],
      certificateEnabled: true,
      courseIds: [paid.id],
      active: true,
    },
    status: 200,
  });
  await api('listPlans', { token: student, status: 200 });
  await api('getBillingOptions', {
    token: student,
    query: { platform: 'android' },
    status: 200,
  });
  const key = randomUUID(),
    verification = (
      await api('verifyPurchase', {
        token: student,
        body: {
          provider: 'google',
          productId: product.id,
          purchaseToken: 'valid-purchase',
        },
        headers: { 'Idempotency-Key': key },
        status: 202,
      })
    ).data;
  assert.equal(verification.status, 'pending');
  await api('getVerification', {
    token: other,
    params: { verificationId: verification.id },
    status: 404,
  });
  await api('verifyPurchase', {
    token: other,
    body: {
      provider: 'google',
      productId: product.id,
      purchaseToken: 'valid-purchase',
    },
    headers: { 'Idempotency-Key': randomUUID() },
    status: 409,
  });
  await runtime.jobs.drain();
  assert.equal(
    (
      await api('getVerification', {
        token: student,
        params: { verificationId: verification.id },
        status: 200,
      })
    ).data.status,
    'verified'
  );
  const subscriptions = (
    await api('getSubscriptions', { token: student, status: 200 })
  ).data;
  assert.equal(subscriptions[0].accessActive, true);
  await api('manageSubscription', {
    token: student,
    params: { subscriptionId: subscriptions[0].id },
    status: 200,
  });
  await api('enroll', {
    token: student,
    params: { courseId: paid.id },
    headers: { 'Idempotency-Key': randomUUID() },
    status: 201,
  });
  await api('updatePlan', {
    token: admin,
    params: { planId: plan.id },
    body: {
      code: 'test',
      name: 'Test Plan',
      features: [],
      certificateEnabled: false,
      courseIds: [],
      active: true,
    },
    status: 409,
  });
});
test('Invalid receipts never grant a subscription, expired access is denied', async () => {
  const v = (
    await api('verifyPurchase', {
      token: other,
      body: {
        provider: 'google',
        productId: product.id,
        purchaseToken: 'forged',
      },
      headers: { 'Idempotency-Key': randomUUID() },
      status: 202,
    })
  ).data;
  await runtime.jobs.drain();
  assert.equal(
    (
      await api('getVerification', {
        token: other,
        params: { verificationId: v.id },
        status: 200,
      })
    ).data.status,
    'rejected'
  );
  await runtime.c.db.query(
    "UPDATE subscriptions SET period_start=now()-interval '2 days',period_end=now()-interval '1 day' WHERE user_id=$1",
    [userId]
  );
  assert.equal(
    (
      await api('getCourse', {
        token: student,
        params: { courseId: paid.id },
        status: 200,
      })
    ).data.course.canAccess,
    false
  );
});
test('External checkout and unsigned provider webhooks fail closed', async () => {
  await api('createCheckout', {
    token: student,
    body: { productId: product.id },
    headers: { 'Idempotency-Key': randomUUID() },
    status: 403,
  });
  await api('getCheckout', {
    token: other,
    params: { checkoutId: randomUUID() },
    status: 404,
  });
  await api('receiveAppleEvent', {
    body: { signedPayload: 'forged' },
    status: 503,
  });
  await api('receiveGoogleEvent', {
    body: {
      message: { data: 'e30=', messageId: 'test' },
      subscription: 'test',
    },
    status: 503,
  });
  await api('receiveStripeEvent', {
    body: { id: 'fake' },
    headers: { 'Stripe-Signature': 'forged' },
    status: 503,
  });
  await api('mapProduct', {
    token: admin,
    params: { planId: product.plan_id },
    body: {
      provider: 'stripe',
      environment: 'sandbox',
      productId: 'fake',
      offerId: '',
      interval: 'month',
      active: false,
    },
    status: 503,
  });
});
test('Logout and account deletion revoke sessions immediately', async () => {
  const s = await login('changed@salford.test', randomUUID());
  await api('logout', { token: s.accessToken, status: 204 });
  await api('getMe', { token: s.accessToken, status: 401 });
  const s2 = await login('changed@salford.test', randomUUID());
  await api('logoutAll', { token: s2.accessToken, status: 204 });
  await api('getMe', { token: s2.accessToken, status: 401 });
  const s3 = await login('changed@salford.test', randomUUID());
  await api('deleteAccount', {
    token: s3.accessToken,
    headers: { 'Idempotency-Key': randomUUID() },
    status: 202,
  });
  await api('getMe', { token: s3.accessToken, status: 401 });
  await runtime.jobs.drain();
  const [u] = await runtime.c.db.query(
    'SELECT status,email,password_hash FROM users WHERE id=$1',
    [s3.user.id]
  );
  assert.equal(u.status, 'deleted');
  assert.equal(u.password_hash, null);
  assert.match(u.email, /@invalid\.local$/);
});
test('Watched ranges merge overlaps without double counting', () => {
  assert.deepEqual(
    mergeRanges(
      [
        [0, 10],
        [20, 30],
      ],
      5,
      25,
      100
    ),
    [[0, 30]]
  );
  assert.deepEqual(mergeRanges([], 0, 300, 100), [[0, 100]]);
});

test('Email action pages verify without consuming a token on GET', async () => {
  await api('register', {
    body: { email: 'page@salford.test', password, name: 'Page user' },
    status: 202,
  });
  const token = await emailToken('page@salford.test');
  const page = await fetch(
    `${base}/auth/action?purpose=verify_email&token=${encodeURIComponent(
      token
    )}`
  );
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<form/);
  const [challenge] = await runtime.c.db.query(
    'SELECT consumed_at FROM auth_challenges WHERE token_hash=$1',
    [hash(runtime.c, token)]
  );
  assert.equal(challenge.consumed_at, null);
  const submitted = await fetch(base + '/auth/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ purpose: 'verify_email', token }),
  });
  assert.equal(submitted.status, 200);
  assert.match(await submitted.text(), /Done/);
  await api('verifyEmail', { body: { token }, status: 400 });
});

test('Refund revocation cannot be undone by a delayed old active event', async () => {
  const [user] = await runtime.c.db.query('SELECT * FROM users WHERE id=$1', [
    userId,
  ]);
  const tomorrow = Date.now() + 86400000;
  await runtime.c.db.query(
    "UPDATE subscriptions SET status='revoked',access_revoked_until=$2 WHERE user_id=$1",
    [userId, new Date(tomorrow).toISOString()]
  );
  const normalized = {
    externalId: 'one-store-subscription',
    transactionId: 'test-delayed-event',
    binding: user.billing_account_id,
    productId: product.external_product_id,
    status: 'active',
    start: new Date(Date.now() - 1000).toISOString(),
    end: new Date(tomorrow).toISOString(),
    autoRenew: true,
    environment: 'sandbox',
  };
  assert.equal(
    (await persistPurchase(runtime.c, user, product, normalized)).status,
    'revoked'
  );
  assert.equal(
    (
      await persistPurchase(runtime.c, user, product, {
        ...normalized,
        start: new Date(tomorrow + 1000).toISOString(),
        end: new Date(tomorrow + 86400000).toISOString(),
      })
    ).status,
    'active'
  );
});

test('Sensitive account actions require a recently authenticated session', async () => {
  const s = await login('page@salford.test', randomUUID());
  await runtime.c.db.query(
    "UPDATE auth_sessions SET auth_time=now()-interval '10 minutes' WHERE id=$1",
    [s.sessionId]
  );
  await api('deleteAccount', {
    token: s.accessToken,
    headers: { 'Idempotency-Key': randomUUID() },
    status: 403,
  });
  const renewed = await api('refreshSession', {
    body: {
      refreshToken: s.refreshToken,
      installationId: (
        await runtime.c.db.query(
          'SELECT device_id FROM auth_sessions WHERE id=$1',
          [s.sessionId]
        )
      )[0].device_id,
    },
    status: 200,
  });
  await api('logoutAll', { token: renewed.data.accessToken, status: 403 });
});

test('Outbox retry does not duplicate an issued certificate', async () => {
  const [event] = await runtime.c.db.query(
    "SELECT id FROM outbox_events WHERE topic='certificate' LIMIT 1"
  );
  await runtime.c.db.query(
    'UPDATE outbox_events SET delivered_at=NULL,next_attempt_at=now() WHERE id=$1',
    [event.id]
  );
  await runtime.jobs.run(event.id);
  assert.equal(
    Number(
      (
        await runtime.c.db.query(
          'SELECT count(*) n FROM certificates WHERE enrollment_id=$1',
          [enrollment.id]
        )
      )[0].n
    ),
    1
  );
});

test('Embedded database refuses a second process connection', async () => {
  await assert.rejects(() => connect(runtime.c.config), /already locked/);
});

test('Stripe checkout only succeeds for its own verified paid session', async () => {
  const [p] = await runtime.c.db.query(
    "INSERT INTO billing_products(plan_id,provider,environment,external_product_id,interval_unit,active) VALUES($1,'stripe','sandbox','price_fixture','month',true) RETURNING *",
    [product.plan_id]
  );
  await runtime.c.db.query(
    "INSERT INTO billing_customers(user_id,provider,environment,external_customer_id) VALUES($1,'stripe','sandbox','cus_fixture')",
    [userId]
  );
  const [checkout] = await runtime.c.db.query(
    "INSERT INTO checkout_sessions(user_id,billing_product_id,external_session_id,status,expires_at) VALUES($1,$2,'cs_paid_fixture','pending',now()+interval '1 hour') RETURNING *",
    [userId, p.id]
  );
  const [otherCheckout] = await runtime.c.db.query(
    "INSERT INTO checkout_sessions(user_id,billing_product_id,external_session_id,status,expires_at) VALUES($1,$2,'cs_unpaid_fixture','pending',now()+interval '1 hour') RETURNING *",
    [userId, p.id]
  );
  let paymentStatus = 'unpaid';
  const original = runtime.providers.stripe;
  runtime.providers.stripe = () =>
    ({
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: 'cs_paid_fixture',
            client_reference_id: userId,
            livemode: false,
            payment_status: paymentStatus,
            status: 'complete',
            subscription: 'sub_fixture',
          }),
        },
      },
      subscriptions: {
        retrieve: async () => ({
          id: 'sub_fixture',
          customer: 'cus_fixture',
          metadata: { userId, productId: p.id },
          livemode: false,
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [
              {
                price: { id: 'price_fixture' },
                current_period_start: Math.floor(Date.now() / 1000) - 10,
                current_period_end: Math.floor(Date.now() / 1000) + 86400,
              },
            ],
          },
          latest_invoice: {
            id: 'in_fixture',
            paid: true,
            amount_paid: 999,
            currency: 'usd',
          },
        }),
      },
    } as any);
  try {
    await syncCheckout(runtime.c, runtime.providers, checkout.id);
    assert.equal(
      (
        await api('getCheckout', {
          token: student,
          params: { checkoutId: checkout.id },
          status: 200,
        })
      ).data.status,
      'pending'
    );
    paymentStatus = 'paid';
    await syncCheckout(runtime.c, runtime.providers, checkout.id);
    assert.equal(
      (
        await api('getCheckout', {
          token: student,
          params: { checkoutId: checkout.id },
          status: 200,
        })
      ).data.status,
      'succeeded'
    );
    assert.equal(
      (
        await api('getCheckout', {
          token: student,
          params: { checkoutId: otherCheckout.id },
          status: 200,
        })
      ).data.status,
      'pending'
    );
  } finally {
    runtime.providers.stripe = original;
  }
});

test('Single demo checkout is authenticated, server-priced, idempotent and visible only to admins', async () => {
  const previousMode = runtime.c.config.billingMode;
  runtime.c.config.billingMode = 'demo';
  try {
    const [u] = await runtime.c.db.query(
      "INSERT INTO users(email,name,password_hash,email_verified_at) SELECT 'demo-checkout@salford.test','Checkout learner',password_hash,now() FROM users WHERE role='admin' LIMIT 1 RETURNING *"
    );
    const access = (await login(u.email, randomUUID())).accessToken;
    const planBody = {
      code: 'demo-checkout',
      name: 'Demo Checkout',
      features: ['Learning'],
      courseIds: [paid.id],
      active: true,
      certificateEnabled: true,
      amountMinor: 1450,
    };
    const plan = (
      await api('createPlan', { token: admin, body: planBody, status: 201 })
    ).data;
    const plans = (await api('listDemoPlans', { token: access, status: 200 }))
      .data;
    assert.equal(plans.find((p: any) => p.id === plan.id).amountMinor, 1450);
    const options = (
      await api('getBillingOptions', {
        token: access,
        query: { platform: 'android' },
        status: 200,
      })
    ).data;
    assert.deepEqual(options.methods, ['demo']);
    assert.equal(options.externalCheckoutEnabled, false);
    assert.equal(runtime.providers.available('stripe'), false);
    assert.throws(() => runtime.providers.stripe(), /REAL_BILLING_DISABLED/);
    await api('getCheckout', {
      token: access,
      params: { checkoutId: randomUUID() },
      status: 409,
    });
    const headers = { 'Idempotency-Key': randomUUID() };
    await api('createDemoPurchase', {
      body: { planId: plan.id },
      headers,
      status: 401,
    });
    await api('createDemoPurchase', {
      token: access,
      body: { planId: plan.id, card: '4242' },
      headers,
      status: 422,
    });
    await api('createDemoPurchase', {
      token: access,
      body: { planId: plan.id, amountMinor: 1 },
      headers,
      status: 422,
    });
    await api('createDemoPurchase', {
      token: access,
      body: { planId: plan.id, userId },
      headers,
      status: 422,
    });
    assert.equal(
      await canAccess(runtime.c, u.id, {
        id: paid.id,
        access_type: 'subscription',
      }),
      false
    );
    const payment = (
      await api('createDemoPurchase', {
        token: access,
        body: { planId: plan.id },
        headers,
        status: 201,
      })
    ).data;
    assert.equal(payment.amountMinor, 1450);
    assert.equal(payment.accessActive, true);
    const replay = (
      await api('createDemoPurchase', {
        token: access,
        body: { planId: plan.id },
        headers,
        status: 201,
      })
    ).data;
    assert.deepEqual(replay, payment);
    const repeat = (
      await api('createDemoPurchase', {
        token: access,
        body: { planId: plan.id },
        headers: { 'Idempotency-Key': randomUUID() },
        status: 201,
      })
    ).data;
    assert.equal(repeat.id, payment.id);
    assert.equal(
      await canAccess(
        runtime.c,
        u.id,
        { id: paid.id, access_type: 'subscription' },
        true
      ),
      true
    );
    assert.equal(
      (await api('getSubscriptions', { token: access, status: 200 })).data[0]
        .provider,
      'demo'
    );
    const ledger = (
      await api('adminDemoPayments', {
        token: admin,
        query: { q: u.email },
        status: 200,
      })
    ).data;
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0].id, payment.id);
    for (const id of [
      'adminOverview',
      'adminDirectory',
      'adminCatalog',
      'adminUsers',
      'adminPlans',
      'adminAudit',
      'adminDemoPayments',
    ]) {
      await api(id, { token: access, status: 403 });
      await api(id, { token: admin, status: 200 });
    }
    const detail = (
      await api('adminGetCourse', {
        token: admin,
        params: { courseId: paid.id },
        status: 200,
      })
    ).data;
    assert(detail.draft.chapters.length > 0);
    await api('updatePlan', {
      token: admin,
      params: { planId: plan.id },
      body: { ...planBody, courseIds: [] },
      status: 409,
    });
    await api('updatePlan', {
      token: admin,
      params: { planId: plan.id },
      body: { ...planBody, amountMinor: 1750 },
      status: 200,
    });
    assert.equal(
      (
        await api('adminDemoPayments', {
          token: admin,
          query: { q: u.email },
          status: 200,
        })
      ).data.items[0].amountMinor,
      1450
    );
    const adminId = (
      await runtime.c.db.query(
        "SELECT id FROM users WHERE role='admin' LIMIT 1"
      )
    )[0].id;
    await api('adminUpdateUser', {
      token: admin,
      params: { userId: adminId },
      body: { status: 'suspended' },
      status: 403,
    });
    await api('adminUpdateUser', {
      token: admin,
      params: { userId: u.id },
      body: { status: 'suspended' },
      status: 200,
    });
    await api('getMe', { token: access, status: 401 });
    await api('adminUpdateUser', {
      token: admin,
      params: { userId: u.id },
      body: { status: 'active' },
      status: 200,
    });
    await api('getMe', { token: access, status: 401 });
    await runtime.c.db.query(
      "UPDATE demo_payments SET period_start=now()-interval '31 days',period_end=now()-interval '1 day' WHERE id=$1",
      [payment.id]
    );
    assert.equal(
      await canAccess(runtime.c, u.id, {
        id: paid.id,
        access_type: 'subscription',
      }),
      false
    );
    assert.equal(
      operations.filter((o) => o.operationId === 'createDemoPurchase').length,
      1
    );
    assert(
      !operations.some((o) =>
        ['adminDemoPurchase', 'adminRefundDemoPayment'].includes(o.operationId)
      )
    );
  } finally {
    runtime.c.config.billingMode = previousMode;
  }
});
