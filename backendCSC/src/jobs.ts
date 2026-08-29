import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { GoogleAuth } from 'google-auth-library';
import { Queue, Worker } from 'bullmq';
import {
  type Context,
  type Row,
  ApiError,
  token,
  unseal,
  seal,
  enqueue,
  fail,
  hash,
} from './core.js';
import { Providers } from './providers.js';
import {
  verifyStoredPurchase,
  processWebhook,
  syncStripe,
  syncCheckout,
} from './billing.js';
import { Storage, processVideo } from './media.js';
import { notify } from './catalog.js';
import { appleClientSecret } from './auth.js';

async function email(c: Context, p: Row, id: string) {
  const [challenge] = await c.db.query(
    "SELECT ch.id FROM auth_challenges ch JOIN users u ON u.id=ch.user_id WHERE ch.token_hash=$1 AND ch.consumed_at IS NULL AND ch.expires_at>now() AND u.status='active'",
    [hash(c, p.token || '')],
  );
  if (!challenge) return;
  const origin = process.env.AUTH_LINK_ORIGIN || c.config.origin;
  const link = `${origin}/auth/action?purpose=${encodeURIComponent(
    p.purpose,
  )}&token=${encodeURIComponent(p.token)}`;
  const message = {
    from: process.env.SMTP_FROM || 'SALFORD <noreply@example.com>',
    to: p.to,
    subject:
      p.purpose === 'reset_password'
        ? 'Reset your SALFORD password'
        : 'Verify your SALFORD email',
    text: `Open this link to continue. It expires in 30 minutes.\n${link}\nIf you did not request this, ignore this message.`,
  };
  if (c.config.mailMode === 'local') {
    const dir = path.join(c.config.dataDir, 'mail');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify(message, null, 2),
      { mode: 0o600 },
    );
    return;
  }
  if (!process.env.SMTP_URL) fail(503, 'SMTP_NOT_CONFIGURED');
  await nodemailer.createTransport(process.env.SMTP_URL).sendMail(message);
}
async function certificate(c: Context, p: Row) {
  const [e] = await c.db.query(
    'SELECT e.*,u.status FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.id=$1 AND e.completed_at IS NOT NULL',
    [p.enrollmentId],
  );
  if (!e || e.status !== 'active') return;
  const [row] = await c.db.query(
    'INSERT INTO certificates(enrollment_id,public_code,learner_name_snapshot,course_title_snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(enrollment_id) DO UPDATE SET enrollment_id=EXCLUDED.enrollment_id RETURNING *',
    [e.id, token(), p.name, p.title],
  );
  if (row.status === 'issued' || row.status === 'revoked') return;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', b => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  if (process.env.CERTIFICATE_FONT) doc.font(process.env.CERTIFICATE_FONT);
  doc.rect(22, 22, 798, 551).lineWidth(3).stroke('#047f8c');
  doc
    .fillColor('#093c54')
    .fontSize(32)
    .text('SALFORD', { align: 'center' })
    .moveDown();
  doc
    .fontSize(24)
    .text('Certificate of completion', { align: 'center' })
    .moveDown();
  doc
    .fontSize(22)
    .text(p.name || 'Learner', { align: 'center' })
    .moveDown();
  doc
    .fontSize(18)
    .text(`Completed: ${p.title}`, { align: 'center' })
    .moveDown();
  doc
    .fontSize(11)
    .fillColor('#555555')
    .text(
      `Issued: ${new Date().toISOString().slice(0, 10)}\nVerification code: ${
        row.public_code
      }\nCourse completion record. No external accreditation is implied.`,
      { align: 'center' },
    );
  doc.end();
  const key = `certificates/${row.id}.pdf`;
  await new Storage(c).write(key, await finished, 'application/pdf');
  await c.db.tx(async db => {
    await db.query(
      "UPDATE certificates SET status='issued',pdf_key=$2,issued_at=now() WHERE id=$1",
      [row.id, key],
    );
    await notify(
      { ...c, db },
      p.userId,
      'certificate',
      'Your certificate is ready',
      p.title,
      'certificate',
      row.id,
      `certificate:${row.id}`,
    );
  });
}
async function push(c: Context, p: Row, id: string) {
  const [n] = await c.db.query(
    "SELECT n.*,s.learning_notifications FROM notifications n JOIN user_settings s ON s.user_id=n.user_id JOIN users u ON u.id=n.user_id WHERE n.id=$1 AND u.status='active'",
    [p.notificationId],
  );
  if (!n || (n.kind === 'learning' && !n.learning_notifications)) return;
  const devices = await c.db.query(
    "SELECT d.* FROM device_tokens d WHERE d.user_id=$1 AND d.permission IN ('granted','provisional') AND EXISTS(SELECT 1 FROM auth_sessions a WHERE a.device_id=d.id AND a.user_id=d.user_id AND a.revoked_at IS NULL AND a.expires_at>now())",
    [n.user_id],
  );
  if (!devices.length) return;
  if (c.config.env !== 'production' && !process.env.FCM_PROJECT_ID) {
    const dir = path.join(c.config.dataDir, 'push');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        notificationId: n.id,
        deviceCount: devices.length,
        status: 'local-preview-not-delivered',
      }),
    );
    return;
  }
  if (!process.env.FCM_PROJECT_ID) fail(503, 'FCM_NOT_CONFIGURED');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  for (const device of devices) {
    try {
      await client.request({
        url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
          process.env.FCM_PROJECT_ID,
        )}/messages:send`,
        method: 'POST',
        timeout: 15000,
        data: {
          message: {
            token: unseal(c, device.token_ciphertext),
            notification: {
              title: 'SALFORD',
              body: 'You have an update in your learning account.',
            },
            data: { notificationId: n.id },
          },
        },
      });
    } catch (e: any) {
      if (
        JSON.stringify(e.response?.data?.error?.details || []).includes(
          'UNREGISTERED',
        )
      )
        await c.db.query('DELETE FROM device_tokens WHERE id=$1', [device.id]);
      else throw e;
    }
  }
}
async function deleteAccount(c: Context, p: Row) {
  const [user] = await c.db.query('SELECT * FROM users WHERE id=$1', [
    p.userId,
  ]);
  if (!user || user.status === 'deleted') return;
  const identities = await c.db.query(
    'SELECT * FROM auth_identities WHERE user_id=$1',
    [user.id],
  );
  for (const identity of identities)
    if (
      identity.provider === 'apple' &&
      identity.provider_refresh_token_ciphertext
    ) {
      const response = await fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.APPLE_CLIENT_ID!,
          client_secret: await appleClientSecret(),
          token: unseal(c, identity.provider_refresh_token_ciphertext),
          token_type_hint: 'refresh_token',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) fail(503, 'APPLE_REVOCATION_FAILED');
    }
  const certificates = await c.db.query(
    'SELECT ce.pdf_key FROM certificates ce JOIN enrollments e ON e.id=ce.enrollment_id WHERE e.user_id=$1',
    [user.id],
  );
  for (const ce of certificates)
    if (ce.pdf_key) await new Storage(c).remove(ce.pdf_key);
  await c.db.tx(async db => {
    await db.query(
      'DELETE FROM playback_events WHERE playback_session_id IN (SELECT id FROM playback_sessions WHERE user_id=$1)',
      [user.id],
    );
    await db.query('DELETE FROM playback_sessions WHERE user_id=$1', [user.id]);
    await db.query("UPDATE demo_payments SET status='refunded',updated_at=now() WHERE user_id=$1 AND status='succeeded'", [user.id]);
    await db.query(
      'DELETE FROM certificates WHERE enrollment_id IN (SELECT id FROM enrollments WHERE user_id=$1)',
      [user.id],
    );
    for (const table of [
      'lesson_progress',
      'enrollments',
      'bookmarks',
      'notifications',
      'device_tokens',
      'auth_challenges',
      'auth_identities',
      'auth_sessions',
      'user_settings',
    ])
      await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [user.id]);
    await db.query(
      "UPDATE users SET name='Deleted account',email=$2,password_hash=NULL,avatar_key=NULL,email_verified_at=NULL,status='deleted',updated_at=now() WHERE id=$1",
      [user.id, `deleted+${user.id}@invalid.local`],
    );
    await db.query(
      "UPDATE account_deletions SET status='completed',completed_at=now() WHERE user_id=$1",
      [user.id],
    );
    const events = await db.query('SELECT id,topic,payload FROM outbox_events');
    for (const event of events) {
      if (event.topic === 'account.delete') continue;
      const data = JSON.parse(unseal(c, event.payload.sealed));
      if (data.userId === user.id || data.to === user.email)
        await db.query(
          'UPDATE outbox_events SET payload=$2,delivered_at=COALESCE(delivered_at,now()) WHERE id=$1',
          [event.id, { sealed: seal(c, '{}') }],
        );
    }
  });
  const dir = path.join(c.config.dataDir, 'mail');
  if (c.config.mailMode === 'local')
    for (const file of await readdir(dir).catch(() => [])) {
      const absolute = path.resolve(dir, file);
      if (path.dirname(absolute) !== path.resolve(dir)) continue;
      const mail = JSON.parse(await readFile(absolute, 'utf8'));
      if (mail.to === user.email) await unlink(absolute);
    }
}
export class Jobs {
  private interval?: NodeJS.Timeout;
  private busy = false;
  private queue?: Queue;
  private worker?: Worker;
  private ticks = 0;
  constructor(readonly c: Context, readonly providers: Providers) {}
  async ready() {
    if (this.c.config.redisUrl) {
      if (!this.queue) {
        const u = new URL(this.c.config.redisUrl);
        this.queue = new Queue('salford-outbox', {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username || undefined,
            password: u.password || undefined,
            ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        });
        this.queue.on('error', () =>
          console.error('Queue connection unavailable'),
        );
      }
      await Promise.race([
        this.queue.getJobCounts('waiting'),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error('Redis timeout')), 2000),
        ),
      ]);
    }
  }
  async run(id: string) {
    const event = await this.c.db.tx(async db => {
      const [e] = await db.query(
        'SELECT * FROM outbox_events WHERE id=$1 AND delivered_at IS NULL AND attempts<10 AND next_attempt_at<=now() AND (leased_until IS NULL OR leased_until<now()) FOR UPDATE SKIP LOCKED',
        [id],
      );
      if (!e) return;
      await db.query(
        "UPDATE outbox_events SET leased_until=now()+interval '10 minutes',attempts=attempts+1 WHERE id=$1",
        [id],
      );
      return e;
    });
    if (!event) return;
    if (event.topic.startsWith('billing.') && this.c.config.billingMode === 'demo') {
      await this.c.db.query("UPDATE outbox_events SET delivered_at=now(),leased_until=NULL,last_error_code='REAL_BILLING_DISABLED' WHERE id=$1", [id]);
      return;
    }
    try {
      const p = JSON.parse(unseal(this.c, event.payload.sealed));
      if (event.topic === 'email') await email(this.c, p, id);
      else if (event.topic === 'certificate') await certificate(this.c, p);
      else if (event.topic === 'push') await push(this.c, p, id);
      else if (event.topic === 'media') await processVideo(this.c, p.assetId);
      else if (event.topic === 'billing.verify')
        await verifyStoredPurchase(this.c, this.providers, p.verificationId);
      else if (event.topic === 'billing.webhook')
        await processWebhook(this.c, this.providers, p.webhookId);
      else if (event.topic === 'billing.stripe')
        await syncStripe(this.c, this.providers, p.externalId);
      else if (event.topic === 'billing.checkout')
        await syncCheckout(this.c, this.providers, p.checkoutId);
      else if (event.topic === 'account.delete') await deleteAccount(this.c, p);
      else throw Error('UNKNOWN_JOB');
      await this.c.db.query(
        'UPDATE outbox_events SET delivered_at=now(),leased_until=NULL,last_error_code=NULL WHERE id=$1',
        [id],
      );
    } catch (e: any) {
      const code = e instanceof ApiError ? e.code : 'JOB_FAILED';
      await this.c.db.query(
        'UPDATE outbox_events SET leased_until=NULL,last_error_code=$2,next_attempt_at=$3 WHERE id=$1',
        [
          id,
          code,
          new Date(
            Date.now() + Math.min(3600, 2 ** event.attempts) * 1000,
          ).toISOString(),
        ],
      );
      if (event.attempts >= 9) {
        if (event.topic === 'media')
          await this.c.db.query(
            "UPDATE media_assets SET status='failed' WHERE id=$1",
            [event.aggregate_id],
          );
        if (event.topic === 'account.delete')
          await this.c.db.query(
            "UPDATE account_deletions SET status='failed' WHERE user_id=$1",
            [event.aggregate_id],
          );
      }
      console.error(
        JSON.stringify({
          event: 'job_failed',
          jobId: id,
          topic: event.topic,
          code,
        }),
      );
    }
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      const rows = await this.c.db.query(
        'SELECT id FROM outbox_events WHERE delivered_at IS NULL AND attempts<10 AND next_attempt_at<=now() AND (leased_until IS NULL OR leased_until<now()) ORDER BY created_at LIMIT 20',
      );
      for (const r of rows) {
        if (this.queue)
          await this.queue.add(
            'outbox',
            { id: r.id },
            { jobId: r.id, removeOnComplete: true, removeOnFail: 100 },
          );
        else await this.run(r.id);
      }
      if (++this.ticks % 60 === 0) await this.reconcile();
    } finally {
      this.busy = false;
    }
  }
  async reconcile() {
    await this.c.db.query(
      "UPDATE subscriptions SET status='expired',updated_at=now() WHERE period_end<=now() AND status IN ('active','grace','on_hold')",
    );
    const rows = this.c.config.billingMode === 'demo' ? [] : await this.c.db.query(
      "SELECT v.id FROM purchase_verifications v LEFT JOIN subscriptions s ON s.id=v.subscription_id WHERE v.status<>'rejected' AND (s.id IS NULL OR s.verified_at<now()-interval '1 hour') LIMIT 100",
    );
    for (const r of rows)
      await enqueue(
        this.c,
        'billing.verify',
        r.id,
        { verificationId: r.id },
        `reconcile:${r.id}:${Math.floor(Date.now() / 3600000)}`,
      );
    if (this.providers.available('stripe')) {
      const subscriptions = await this.c.db.query(
        "SELECT id,external_subscription_id FROM subscriptions WHERE provider='stripe' AND verified_at<now()-interval '1 hour' LIMIT 100",
      );
      for (const s of subscriptions)
        await enqueue(
          this.c,
          'billing.stripe',
          s.id,
          { externalId: s.external_subscription_id },
          `stripe-reconcile:${s.id}:${Math.floor(Date.now() / 3600000)}`,
        );
      const checkouts = await this.c.db.query(
        "SELECT id FROM checkout_sessions WHERE status IN ('pending','processing') LIMIT 100",
      );
      for (const checkout of checkouts)
        await enqueue(
          this.c,
          'billing.checkout',
          checkout.id,
          { checkoutId: checkout.id },
          `checkout-reconcile:${checkout.id}:${Math.floor(Date.now() / 60000)}`,
        );
    }
    await this.c.db.query('DELETE FROM rate_limits WHERE expires_at<now()');
    await this.c.db.query(
      'DELETE FROM idempotency_keys WHERE expires_at<now()',
    );
  }
  async start() {
    if (this.c.config.redisUrl) {
      const u = new URL(this.c.config.redisUrl),
        connection = {
          host: u.hostname,
          port: Number(u.port || 6379),
          username: u.username || undefined,
          password: u.password || undefined,
          ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
        };
      this.queue ||= new Queue('salford-outbox', { connection });
      this.worker = new Worker('salford-outbox', job => this.run(job.data.id), {
        connection,
        concurrency: 2,
      });
      this.worker.on('error', () => console.error('Queue worker unavailable'));
    }
    this.interval = setInterval(
      () =>
        this.drain().catch(() => console.error('Outbox scheduler unavailable')),
      1000,
    );
    this.interval.unref();
  }
  async close() {
    if (this.interval) clearInterval(this.interval);
    await this.worker?.close();
    await this.queue?.close();
    while (this.busy) await new Promise(r => setTimeout(r, 20));
  }
}
