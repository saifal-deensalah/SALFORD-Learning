import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Express, Request, Response } from 'express';
import express from 'express';
import {
  type Context,
  type Row,
  type Handlers,
  fail,
  need,
  uid,
  hash,
  equal,
  enqueue,
  ApiError,
} from './core.js';
const exec = promisify(execFile);
export class Storage {
  private client?: S3Client;
  constructor(readonly c: Context) {
    if (c.config.storageMode === 's3')
      this.client = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      });
  }
  local(key: string) {
    if (!/^[a-zA-Z0-9/_.,-]+$/.test(key) || key.includes('..'))
      fail(400, 'INVALID_STORAGE_KEY');
    const base = path.resolve(this.c.config.dataDir, 'storage'),
      file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep)) fail(400, 'INVALID_STORAGE_KEY');
    return file;
  }
  async write(key: string, data: Buffer, mime = 'application/octet-stream') {
    if (this.client)
      await this.client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
    else {
      const file = this.local(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    }
  }
  async read(key: string) {
    if (this.client) {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
      return Buffer.from(await need(r.Body).transformToByteArray());
    }
    return readFile(this.local(key));
  }
  async size(key: string) {
    return this.client
      ? Number(
          (
            await this.client.send(
              new HeadObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: key,
              }),
            )
          ).ContentLength,
        )
      : (await stat(this.local(key))).size;
  }
  async signedDownload(key: string, seconds: number) {
    if (!this.client) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      { expiresIn: Math.max(1, Math.floor(seconds)) },
    );
  }
  async remove(key: string) {
    if (this.client)
      await this.client.send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
    else
      await unlink(this.local(key)).catch((e: any) => {
        if (e.code !== 'ENOENT') throw e;
      });
  }
  async upload(asset: Row) {
    const expiresAt = new Date(this.c.config.now() + 600000).toISOString();
    if (this.client) {
      const checksum = Buffer.from(asset.checksum_sha256, 'hex').toString(
        'base64',
      );
      const uploadUrl = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: asset.object_key,
          ContentType: asset.mime_type,
          ContentLength: Number(asset.byte_size),
          ChecksumSHA256: checksum,
        }),
        { expiresIn: 600 },
      );
      return {
        assetId: asset.id,
        uploadUrl,
        expiresAt,
        headers: {
          'Content-Type': asset.mime_type,
          'x-amz-checksum-sha256': checksum,
        },
      };
    }
    const expires = String(this.c.config.now() + 600000);
    return {
      assetId: asset.id,
      uploadUrl: `${this.c.config.origin}/v1/media/uploads/${
        asset.id
      }?expires=${expires}&signature=${hash(
        this.c,
        `upload:${asset.id}:${expires}`,
      )}`,
      expiresAt,
      headers: { 'Content-Type': asset.mime_type },
    };
  }
}
export const streamUrl = (c: Context, id: string, expires: number) =>
  `${
    c.config.origin
  }/v1/media/stream/${id}/index.m3u8?expires=${expires}&signature=${hash(
    c,
    `stream:${id}:${expires}`,
  )}`;
export const certificateUrl = (c: Context, id: string) => {
  const expires = c.config.now() + 300000;
  return {
    url: `${
      c.config.origin
    }/v1/media/certificates/${id}?expires=${expires}&signature=${hash(
      c,
      `certificate:${id}:${expires}`,
    )}`,
    expiresAt: new Date(expires).toISOString(),
  };
};
function checkGrant(c: Context, req: Request, scope: string, id: string) {
  const exp = String(req.query.expires || ''),
    sig = String(req.query.signature || '');
  if (
    !/^\d+$/.test(exp) ||
    Number(exp) < c.config.now() ||
    Number(exp) > c.config.now() + 3600000 ||
    !equal(hash(c, `${scope}:${id}:${exp}`), sig)
  )
    fail(403, 'MEDIA_GRANT_EXPIRED');
}
function sniff(data: Buffer, mime: string) {
  return mime === 'image/png'
    ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg'
    ? data[0] === 255 && data[1] === 216
    : mime === 'image/webp'
    ? data.toString('ascii', 8, 12) === 'WEBP'
    : mime === 'video/mp4'
    ? data.toString('ascii', 4, 8) === 'ftyp'
    : mime === 'video/webm'
    ? data.subarray(0, 4).toString('hex') === '1a45dfa3'
    : false;
}
export function assetView(a: Row) {
  return {
    id: a.id,
    status: a.status,
    kind: a.kind,
    durationSeconds: a.duration_seconds ? Number(a.duration_seconds) : null,
    url: null,
  };
}
export function mediaHandlers(c: Context): Handlers {
  return {
    createUpload: async i => {
      const b = i.body,
        allowed =
          b.kind === 'image'
            ? ['image/png', 'image/jpeg', 'image/webp']
            : ['video/mp4', 'video/webm'];
      if (
        !allowed.includes(b.mimeType) ||
        b.byteSize > (b.kind === 'image' ? 5 : 100) * 1024 * 1024
      )
        fail(422, 'UPLOAD_LIMIT_OR_TYPE');
      const [count] = await c.db.query(
        "SELECT count(*) n FROM media_assets WHERE uploaded_by=$1 AND status IN ('pending','processing','uploaded')",
        [i.user.id],
      );
      if (Number(count.n) >= 10) fail(429, 'UPLOAD_QUOTA');
      const id = uid();
      const [a] = await c.db.query(
        'INSERT INTO media_assets(id,uploaded_by,kind,object_key,mime_type,byte_size,checksum_sha256) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          id,
          i.user.id,
          b.kind,
          `uploads/${id}/source`,
          b.mimeType,
          b.byteSize,
          b.checksumSha256,
        ],
      );
      return new Storage(c).upload(a);
    },
    completeUpload: async i => {
      const a = need(
        (
          await c.db.query('SELECT * FROM media_assets WHERE id=$1', [
            i.params.assetId,
          ])
        )[0],
      );
      if (a.status === 'ready' || a.status === 'processing')
        return assetView(a);
      const storage = new Storage(c);
      const size = await storage
        .size(a.object_key)
        .catch(() => fail(422, 'UPLOAD_NOT_FOUND'));
      if (size !== Number(a.byte_size)) fail(422, 'UPLOAD_SIZE_MISMATCH');
      const data = await storage.read(a.object_key);
      if (data.length !== Number(a.byte_size) || !sniff(data, a.mime_type))
        fail(422, 'INVALID_MEDIA_CONTENT');
      const { createHash } = await import('node:crypto');
      if (createHash('sha256').update(data).digest('hex') !== a.checksum_sha256)
        fail(422, 'CHECKSUM_MISMATCH');
      return c.db.tx(async db => {
        const [r] = await db.query(
          'UPDATE media_assets SET status=$2 WHERE id=$1 RETURNING *',
          [a.id, a.kind === 'image' ? 'ready' : 'processing'],
        );
        if (a.kind === 'video')
          await enqueue(
            { ...c, db },
            'media',
            a.id,
            { assetId: a.id },
            `media:${a.id}`,
          );
        return assetView(r);
      });
    },
    getAsset: async i =>
      assetView(
        need(
          (
            await c.db.query('SELECT * FROM media_assets WHERE id=$1', [
              i.params.assetId,
            ])
          )[0],
        ),
      ),
  };
}
export async function processVideo(c: Context, id: string) {
  const asset = need(
    (await c.db.query('SELECT * FROM media_assets WHERE id=$1', [id]))[0],
  );
  if (asset.status === 'ready') return;
  const storage = new Storage(c),
    dir = path.join(c.config.dataDir, 'processing', id);
  await mkdir(dir, { recursive: true });
  const input = path.join(dir, 'source');
  await writeFile(input, await storage.read(asset.object_key));
  const binary = process.env.FFMPEG_PATH || String(ffmpegStatic);
  if (!existsSync(binary)) throw new ApiError(503, 'FFMPEG_NOT_AVAILABLE');
  const output = path.join(dir, 'index.m3u8');
  const r = await exec(
    binary,
    [
      '-nostdin',
      '-y',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-force_key_frames',
      'expr:gte(t,n_forced*6)',
      '-f',
      'hls',
      '-hls_time',
      '6',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      path.join(dir, 'segment-%04d.ts'),
      output,
    ],
    { timeout: 300000, maxBuffer: 5e6, windowsHide: true },
  );
  const m = r.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!m) throw new ApiError(422, 'MEDIA_DURATION_UNKNOWN');
  const duration = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  for (const file of await readdir(dir))
    if (file.endsWith('.ts') || file === 'index.m3u8')
      await storage.write(
        `hls/${id}/${file}`,
        await readFile(path.join(dir, file)),
        file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
      );
  await c.db.query(
    "UPDATE media_assets SET status='ready',duration_seconds=$2,playback_key=$3 WHERE id=$1",
    [id, duration, `hls/${id}/`],
  );
}
export function mountMedia(app: Express, c: Context) {
  const wrap =
    (fn: (req: Request, res: Response) => Promise<any>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (e: any) {
        res.status(e instanceof ApiError ? e.status : 404).json({
          error: {
            code: e instanceof ApiError ? e.code : 'MEDIA_NOT_FOUND',
            message: 'Media unavailable',
            requestId: uid(),
          },
        });
      }
    };
  app.put(
    '/v1/media/uploads/:assetId',
    express.raw({ type: () => true, limit: '100mb' }),
    wrap(async (req, res) => {
      if (c.config.storageMode !== 'local') fail(404, 'RESOURCE_NOT_FOUND');
      checkGrant(c, req, 'upload', String(req.params.assetId));
      const a = need(
        (
          await c.db.query(
            "SELECT * FROM media_assets WHERE id=$1 AND status='pending'",
            [req.params.assetId],
          )
        )[0],
      );
      if (!Buffer.isBuffer(req.body) || req.body.length !== Number(a.byte_size))
        fail(422, 'UPLOAD_SIZE_MISMATCH');
      await new Storage(c).write(a.object_key, req.body, a.mime_type);
      res.status(204).end();
    }),
  );
  app.get(
    '/v1/media/stream/:sessionId/:file',
    wrap(async (req, res) => {
      const id = String(req.params.sessionId),
        file = String(req.params.file);
      checkGrant(c, req, 'stream', id);
      if (!/^(index\.m3u8|segment-\d{4,}\.ts)$/.test(file))
        fail(404, 'MEDIA_NOT_FOUND');
      const [s] = await c.db.query(
        'SELECT s.*,u.status user_status FROM playback_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.closed_at IS NULL AND s.expires_at>now()',
        [id],
      );
      if (!s || s.user_status !== 'active') fail(403, 'MEDIA_GRANT_EXPIRED');
      const storage = new Storage(c);
      if (file.endsWith('.ts')) {
        const url = await storage.signedDownload(
          s.grant_key + file,
          Math.min(120, (Number(req.query.expires) - c.config.now()) / 1000),
        );
        if (url) {
          res.redirect(302, url);
          return;
        }
      }
      let data = await storage.read(s.grant_key + file);
      if (file.endsWith('.m3u8')) {
        const query = `?expires=${req.query.expires}&signature=${req.query.signature}`;
        data = Buffer.from(
          data
            .toString()
            .split('\n')
            .map(line => (line && !line.startsWith('#') ? line + query : line))
            .join('\n'),
        );
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res
        .type(
          file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        )
        .send(data);
    }),
  );
  app.get(
    '/v1/media/images/:assetId',
    wrap(async (req, res) => {
      const [a] = await c.db.query(
        "SELECT m.* FROM media_assets m WHERE m.id=$1 AND m.kind='image' AND m.status='ready' AND EXISTS(SELECT 1 FROM courses c WHERE c.cover_asset_id=m.id AND c.status='published')",
        [req.params.assetId],
      );
      need(a);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type(a.mime_type).send(await new Storage(c).read(a.object_key));
    }),
  );
  app.get(
    '/v1/media/certificates/:certificateId',
    wrap(async (req, res) => {
      checkGrant(c, req, 'certificate', String(req.params.certificateId));
      const [r] = await c.db.query(
        "SELECT ce.* FROM certificates ce JOIN enrollments e ON e.id=ce.enrollment_id JOIN users u ON u.id=e.user_id WHERE ce.id=$1 AND ce.status='issued' AND u.status='active'",
        [req.params.certificateId],
      );
      need(r);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="certificate.pdf"',
      );
      res.type('application/pdf').send(await new Storage(c).read(r.pdf_key));
    }),
  );
}
