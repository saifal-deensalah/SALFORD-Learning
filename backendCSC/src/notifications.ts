import {
  type Context,
  type Handlers,
  need,
  fail,
  iso,
  paginate,
  seal,
  hash,
} from './core.js';
import { certificateUrl } from './media.js';
export function notificationHandlers(c: Context): Handlers {
  return {
    listNotifications: async i => {
      const rows = await c.db.query(
        'SELECT * FROM notifications WHERE user_id=$1 AND (NOT $2::boolean OR read_at IS NULL) ORDER BY created_at DESC,id',
        [i.user.id, i.query.unreadOnly || false],
      );
      return paginate(
        c,
        rows.map(n => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          createdAt: iso(n.created_at),
          readAt: iso(n.read_at),
          target: n.target_type
            ? { type: n.target_type, id: n.target_id }
            : null,
        })),
        i.query,
        `${i.user.id}:notifications`,
      );
    },
    readNotification: async i => {
      need(
        (
          await c.db.query(
            'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',
            [i.params.notificationId, i.user.id],
          )
        )[0],
      );
    },
    registerDevice: async i => {
      if (
        i.body.installationId !== i.params.installationId ||
        i.params.installationId !== i.user.device_id
      )
        fail(403, 'DEVICE_SESSION_MISMATCH');
      await c.db.tx(async db => {
        await db.query(
          'DELETE FROM device_tokens WHERE token_hash=$1 AND id<>$2',
          [hash(c, i.body.pushToken), i.params.installationId],
        );
        await db.query(
          'INSERT INTO device_tokens(id,user_id,platform,token_ciphertext,token_hash,permission) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET user_id=$2,platform=$3,token_ciphertext=$4,token_hash=$5,permission=$6,updated_at=now()',
          [
            i.params.installationId,
            i.user.id,
            i.body.platform,
            seal(c, i.body.pushToken),
            hash(c, i.body.pushToken),
            i.body.permission,
          ],
        );
      });
    },
    unregisterDevice: async i => {
      await c.db.query('DELETE FROM device_tokens WHERE id=$1 AND user_id=$2', [
        i.params.installationId,
        i.user.id,
      ]);
    },
    listCertificates: async i => {
      const rows = await c.db.query(
        'SELECT ce.*,e.course_id,s.certificate_public FROM certificates ce JOIN enrollments e ON e.id=ce.enrollment_id JOIN user_settings s ON s.user_id=e.user_id WHERE e.user_id=$1 ORDER BY ce.created_at DESC,ce.id',
        [i.user.id],
      );
      return paginate(
        c,
        rows.map(r => ({
          id: r.id,
          courseId: r.course_id,
          learnerName: r.learner_name_snapshot,
          courseTitle: r.course_title_snapshot,
          status: r.status,
          issuedAt: iso(r.issued_at),
          publicCode: r.certificate_public ? r.public_code : null,
          verificationUrl: r.certificate_public
            ? `${c.config.origin}/v1/certificates/verify/${r.public_code}`
            : null,
        })),
        i.query,
        `${i.user.id}:certificates`,
      );
    },
    downloadCertificate: async i => {
      const r = need(
        (
          await c.db.query(
            'SELECT ce.* FROM certificates ce JOIN enrollments e ON e.id=ce.enrollment_id WHERE ce.id=$1 AND e.user_id=$2',
            [i.params.certificateId, i.user.id],
          )
        )[0],
      );
      if (r.status !== 'issued') fail(409, 'CERTIFICATE_NOT_READY');
      return certificateUrl(c, r.id);
    },
    verifyCertificate: async i => {
      const r = need(
        (
          await c.db.query(
            "SELECT ce.* FROM certificates ce JOIN enrollments e ON e.id=ce.enrollment_id JOIN user_settings s ON s.user_id=e.user_id JOIN users u ON u.id=e.user_id WHERE ce.public_code=$1 AND ce.status='issued' AND s.certificate_public AND u.status='active'",
            [i.params.code],
          )
        )[0],
      );
      return {
        valid: true,
        courseTitle: r.course_title_snapshot,
        learnerDisplayName: r.learner_name_snapshot,
        issuedAt: iso(r.issued_at),
      };
    },
  };
}
