import argon2 from 'argon2';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import {
  type Context,
  type Input,
  type Handlers,
  type Row,
  fail,
  need,
  uid,
  token,
  hash,
  seal,
  normalizeEmail,
  publicUser,
  enqueue,
  limit,
  iso,
} from './core.js';

const googleVerifier = new OAuth2Client();
const appleKeys = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
export async function session(
  c: Context,
  user: Row,
  installation: string,
  remember: boolean,
  family = uid(),
  authTime = c.config.now(),
) {
  const refresh = token(),
    expires = new Date(authTime + (remember ? 30 : 1) * 86400000).toISOString(),
    id = uid();
  await c.db.query(
    'INSERT INTO auth_sessions(id,user_id,device_id,family_id,refresh_token_hash,remember_me,expires_at,auth_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      user.id,
      installation,
      family,
      hash(c, refresh),
      remember,
      expires,
      new Date(authTime).toISOString(),
    ],
  );
  const accessToken = await new SignJWT({
    sid: id,
    auth_time: Math.floor(authTime / 1000),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('salford')
    .setAudience('salford-mobile')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(Buffer.from(c.config.secret));
  return {
    user: publicUser(user, c),
    accessToken,
    accessExpiresAt: new Date(c.config.now() + 600000).toISOString(),
    refreshToken: refresh,
    refreshExpiresAt: expires,
    sessionId: id,
  };
}
export async function authenticate(c: Context, bearer: string | undefined) {
  if (!bearer?.startsWith('Bearer ')) fail(401, 'TOKEN_REQUIRED');
  let payload: any;
  try {
    payload = (
      await jwtVerify(bearer.slice(7), Buffer.from(c.config.secret), {
        algorithms: ['HS256'],
        issuer: 'salford',
        audience: 'salford-mobile',
      })
    ).payload;
  } catch {
    fail(401, 'TOKEN_EXPIRED');
  }
  const [u] = await c.db.query(
    `SELECT u.*,s.id session_id,s.family_id,s.device_id,s.auth_time FROM users u JOIN auth_sessions s ON u.id=s.user_id WHERE s.id=$1 AND u.id=$2 AND u.status='active' AND s.revoked_at IS NULL AND s.expires_at>now()`,
    [payload.sid, payload.sub],
  );
  return need(u, 'SESSION_REVOKED');
}
async function issueEmail(
  c: Context,
  user: Row,
  purpose: string,
  targetEmail?: string,
) {
  const value = token(),
    challenge = uid();
  await c.db.query(
    'UPDATE auth_challenges SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',
    [user.id, purpose],
  );
  await c.db.query(
    'INSERT INTO auth_challenges(id,user_id,purpose,token_hash,target_email,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [
      challenge,
      user.id,
      purpose,
      hash(c, value),
      targetEmail || user.email,
      new Date(c.config.now() + 1800000).toISOString(),
    ],
  );
  await enqueue(
    c,
    'email',
    challenge,
    { to: targetEmail || user.email, purpose, token: value },
    `email:${challenge}`,
  );
}
export async function appleClientSecret() {
  if (
    !process.env.APPLE_KEY_FILE ||
    !process.env.APPLE_CLIENT_ID ||
    !process.env.APPLE_TEAM_ID ||
    !process.env.APPLE_KEY_ID
  )
    fail(503, 'APPLE_NOT_CONFIGURED');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID)
    .setSubject(process.env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(createPrivateKey(readFileSync(process.env.APPLE_KEY_FILE)));
}
async function social(c: Context, i: Input, provider: 'google' | 'apple') {
  const audiences = (
    provider === 'google'
      ? process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_IDS
      : process.env.APPLE_CLIENT_ID
  )?.split(',').map(value => value.trim()).filter(Boolean);
  if (!audiences?.length) fail(503, 'SOCIAL_NOT_CONFIGURED');
  let identity: any;
  try {
    if (provider === 'google') {
      const ticket = await googleVerifier.verifyIdToken({
        idToken: i.body.idToken,
        audience: audiences,
      });
      identity = ticket.getPayload();
      if (!identity?.sub) fail(401, 'INVALID_PROVIDER_IDENTITY');
    } else {
      identity = (
        await jwtVerify(i.body.idToken, appleKeys, {
          algorithms: ['RS256'],
          audience: audiences,
          issuer: 'https://appleid.apple.com',
        })
      ).payload;
    }
  } catch {
    fail(401, 'INVALID_PROVIDER_IDENTITY');
  }
  if (
    provider === 'google' &&
    (!identity.email || identity.email_verified !== true)
  )
    fail(403, 'VERIFIED_EMAIL_REQUIRED');
  let providerRefresh: string | undefined;
  if (provider === 'apple') {
    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: i.body.authorizationCode,
        client_id: process.env.APPLE_CLIENT_ID!,
        client_secret: await appleClientSecret(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) fail(401, 'INVALID_PROVIDER_CODE');
    const data = (await response.json()) as Row;
    providerRefresh = data.refresh_token;
    const checked = await jwtVerify(data.id_token, appleKeys, {
      algorithms: ['RS256'],
      audience: audiences,
      issuer: 'https://appleid.apple.com',
    });
    if (checked.payload.sub !== identity.sub)
      fail(401, 'PROVIDER_IDENTITY_MISMATCH');
  }
  return c.db.tx(async db => {
    const t = { ...c, db };
    const [challenge] = await db.query(
      'SELECT * FROM auth_challenges WHERE id=$1 AND purpose=$2 AND installation_id=$3 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',
      [i.body.challengeId, `social_${provider}`, i.body.installationId],
    );
    if (!challenge)
      fail(401, 'INVALID_NONCE');
    // Apple exposes a nonce in its ID token. The original Google Sign-In SDK
    // does not accept a caller nonce, so Google relies on its verified token
    // plus this short-lived, single-use server challenge.
    if (
      provider === 'apple' &&
      (typeof identity.nonce !== 'string' ||
        hash(c, identity.nonce) !== challenge.token_hash)
    )
      fail(401, 'INVALID_NONCE');
    await db.query('UPDATE auth_challenges SET consumed_at=now() WHERE id=$1', [
      challenge.id,
    ]);
    let [user] = await db.query(
      'SELECT u.* FROM users u JOIN auth_identities a ON a.user_id=u.id WHERE a.provider=$1 AND a.subject=$2',
      [provider, identity.sub],
    );
    if (!user) {
      if (
        provider === 'apple' &&
        (!identity.email || ![true, 'true'].includes(identity.email_verified))
      )
        fail(403, 'VERIFIED_EMAIL_REQUIRED');
      const email = normalizeEmail(identity.email);
      if (
        (
          await db.query('SELECT id FROM users WHERE lower(btrim(email))=$1', [
            email,
          ])
        ).length
      )
        fail(409, 'ACCOUNT_LINK_REQUIRED');
      const trustedName =
          provider === 'google' && typeof identity.name === 'string'
            ? identity.name.slice(0, 100)
            : i.body.name || '',
        trustedPicture =
          provider === 'google' &&
          typeof identity.picture === 'string' &&
          identity.picture.startsWith('https://')
            ? identity.picture
            : null;
      [user] = await db.query(
        "INSERT INTO users(email,name,email_verified_at,role) VALUES($1,$2,now(),'student') RETURNING *",
        [email, trustedName],
      );
      await db.query('INSERT INTO user_settings(user_id) VALUES($1)', [
        user.id,
      ]);
      await db.query(
        'INSERT INTO auth_identities(user_id,provider,subject,provider_refresh_token_ciphertext,provider_profile_picture_url) VALUES($1,$2,$3,$4,$5)',
        [
          user.id,
          provider,
          identity.sub,
          providerRefresh ? seal(t, providerRefresh) : null,
          trustedPicture,
        ],
      );
    } else {
      if (provider === 'google')
        await db.query(
          'UPDATE auth_identities SET provider_profile_picture_url=$3 WHERE user_id=$1 AND provider=$2',
          [
            user.id,
            provider,
            typeof identity.picture === 'string' &&
            identity.picture.startsWith('https://')
              ? identity.picture
              : null,
          ],
        );
      if (providerRefresh)
        await db.query(
          'UPDATE auth_identities SET provider_refresh_token_ciphertext=$3 WHERE user_id=$1 AND provider=$2',
          [user.id, provider, seal(t, providerRefresh)],
        );
    }
    if (user.status !== 'active') fail(403, 'ACCOUNT_UNAVAILABLE');
    return session(t, user, i.body.installationId, i.body.rememberMe);
  });
}
export function authHandlers(c: Context): Handlers {
  return {
    register: async i => {
      await limit(c, `register:${normalizeEmail(i.body.email)}`, 3, 3600);
      const passwordHash = await argon2.hash(i.body.password, {
        type: argon2.argon2id,
      });
      await c.db.tx(async db => {
        const t = { ...c, db };
        const [u] = await db.query(
          'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',
          [normalizeEmail(i.body.email), i.body.name || '', passwordHash],
        );
        if (u) {
          await db.query('INSERT INTO user_settings(user_id) VALUES($1)', [
            u.id,
          ]);
          if (!c.config.localEmailAuth) await issueEmail(t, u, 'verify_email');
        } else if (c.config.localEmailAuth) {
          fail(409, 'EMAIL_ALREADY_REGISTERED');
        }
      });
      return c.config.localEmailAuth
        ? { message: 'Account created. You can sign in now.', emailVerificationRequired: false }
        : { message: 'If eligible, you will receive an email.', emailVerificationRequired: true };
    },
    login: async i => {
      await limit(c, `login:${i.ip}:${normalizeEmail(i.body.email)}`, 5, 60);
      const [u] = await c.db.query(
        'SELECT * FROM users WHERE lower(btrim(email))=$1',
        [normalizeEmail(i.body.email)],
      );
      const valid = u?.password_hash
        ? await argon2
            .verify(u.password_hash, i.body.password)
            .catch(() => false)
        : await argon2.hash(i.body.password).then(() => false);
      if (!valid || u.status !== 'active') fail(401, 'INVALID_CREDENTIALS');
      return session(c, u, i.body.installationId, i.body.rememberMe);
    },
    refreshSession: async i => {
      const result = await c.db.tx(async db => {
        const [s] = await db.query(
          'SELECT * FROM auth_sessions WHERE refresh_token_hash=$1 FOR UPDATE',
          [hash(c, i.body.refreshToken)],
        );
        if (!s) return null;
        if (
          s.consumed_at ||
          s.revoked_at ||
          new Date(s.expires_at).getTime() < c.config.now() ||
          s.device_id !== i.body.installationId
        ) {
          await db.query(
            'UPDATE auth_sessions SET revoked_at=now() WHERE family_id=$1',
            [s.family_id],
          );
          return null;
        }
        const [u] = await db.query(
          "SELECT * FROM users WHERE id=$1 AND status='active'",
          [s.user_id],
        );
        if (!u) return null;
        await db.query(
          'UPDATE auth_sessions SET consumed_at=now() WHERE id=$1',
          [s.id],
        );
        return session(
          { ...c, db },
          u,
          s.device_id,
          s.remember_me,
          s.family_id,
          new Date(s.auth_time).getTime(),
        );
      });
      if (!result) fail(401, 'SESSION_REVOKED');
      return result;
    },
    logout: async i => {
      await c.db.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE family_id=$1',
        [i.user.family_id],
      );
      await c.db.query('DELETE FROM device_tokens WHERE user_id=$1 AND id=$2', [
        i.user.id,
        i.user.device_id,
      ]);
    },
    logoutAll: async i => {
      await c.db.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',
        [i.user.id],
      );
      await c.db.query('DELETE FROM device_tokens WHERE user_id=$1', [
        i.user.id,
      ]);
    },
    requestVerification: async i => c.config.localEmailAuth
      ? { message: 'Email verification is not required in local development.' }
      : requestEmail(c, i, 'verify_email'),
    requestPasswordReset: async i => requestEmail(c, i, 'reset_password'),
    verifyEmail: async i => consume(c, i, false),
    resetPassword: async i => consume(c, i, true),
    createSocialChallenge: async i => {
      const id = uid(),
        nonce = token(),
        expiresAt = new Date(c.config.now() + 300000).toISOString();
      await c.db.query(
        'INSERT INTO auth_challenges(id,purpose,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,$5)',
        [
          id,
          `social_${i.body.provider}`,
          hash(c, nonce),
          i.body.installationId,
          expiresAt,
        ],
      );
      return { challengeId: id, nonce, expiresAt };
    },
    loginGoogle: i => social(c, i, 'google'),
    loginApple: i => social(c, i, 'apple'),
    getMe: async i => publicUser(i.user, c),
    updateMe: async i =>
      publicUser(
        (
          await c.db.query(
            'UPDATE users SET name=$2,updated_at=now() WHERE id=$1 RETURNING *',
            [i.user.id, i.body.name.trim()],
          )
        )[0],
        c,
      ),
    requestEmailChange: async i => {
      await c.db.tx(db =>
        issueEmail(
          { ...c, db },
          i.user,
          'change_email',
          normalizeEmail(i.body.newEmail),
        ),
      );
      return { message: 'If eligible, you will receive an email.' };
    },
    getSettings: async i => settings(c, i.user.id),
    updateSettings: async i => {
      await c.db.query(
        'UPDATE user_settings SET learning_notifications=COALESCE($2,learning_notifications),certificate_public=COALESCE($3,certificate_public),updated_at=now() WHERE user_id=$1',
        [
          i.user.id,
          i.body.learningNotifications ?? null,
          i.body.certificatePublic ?? null,
        ],
      );
      return settings(c, i.user.id);
    },
    deleteAccount: async i => {
      await c.db.query(
        "UPDATE users SET status='deletion_pending' WHERE id=$1",
        [i.user.id],
      );
      await c.db.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',
        [i.user.id],
      );
      await c.db.query('DELETE FROM device_tokens WHERE user_id=$1', [
        i.user.id,
      ]);
      const [r] = await c.db.query(
        "INSERT INTO account_deletions(user_id,status) VALUES($1,'pending') ON CONFLICT(user_id) DO UPDATE SET status=account_deletions.status RETURNING *",
        [i.user.id],
      );
      await enqueue(
        c,
        'account.delete',
        i.user.id,
        { userId: i.user.id },
        `delete:${i.user.id}`,
      );
      return { status: r.status, requestedAt: iso(r.requested_at) };
    },
  };
}
async function settings(c: Context, id: string) {
  const [r] = await c.db.query('SELECT * FROM user_settings WHERE user_id=$1', [
    id,
  ]);
  return {
    learningNotifications: r?.learning_notifications ?? true,
    certificatePublic: r?.certificate_public ?? false,
  };
}
async function requestEmail(c: Context, i: Input, purpose: string) {
  await limit(c, `${purpose}:${normalizeEmail(i.body.email)}`, 3, 3600);
  await c.db.tx(async db => {
    const [u] = await db.query(
      "SELECT * FROM users WHERE lower(btrim(email))=$1 AND status='active'",
      [normalizeEmail(i.body.email)],
    );
    if (u && (purpose !== 'verify_email' || !u.email_verified_at))
      await issueEmail({ ...c, db }, u, purpose);
  });
  return { message: 'If eligible, you will receive an email.' };
}
async function consume(c: Context, i: Input, reset: boolean) {
  const passwordHash = reset
    ? await argon2.hash(i.body.newPassword, { type: argon2.argon2id })
    : null;
  return c.db.tx(async db => {
    const [ch] = await db.query(
      'SELECT * FROM auth_challenges WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',
      [hash(c, i.body.token)],
    );
    if (
      !ch ||
      (reset
        ? ch.purpose !== 'reset_password'
        : !['verify_email', 'change_email'].includes(ch.purpose))
    )
      fail(400, 'INVALID_OR_EXPIRED_TOKEN');
    if (reset)
      await db.query(
        "UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1 AND status='active'",
        [ch.user_id, passwordHash],
      );
    else {
      await db.query(
        "UPDATE users SET email=$2,email_verified_at=now(),updated_at=now() WHERE id=$1 AND status='active'",
        [ch.user_id, ch.target_email],
      );
    }
    if (reset || ch.purpose === 'change_email') {
      await db.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',
        [ch.user_id],
      );
      await db.query('DELETE FROM device_tokens WHERE user_id=$1', [
        ch.user_id,
      ]);
    }
    await db.query('UPDATE auth_challenges SET consumed_at=now() WHERE id=$1', [
      ch.id,
    ]);
    return {
      message: reset ? 'Password reset. Sign in again.' : 'Email verified.',
    };
  });
}
