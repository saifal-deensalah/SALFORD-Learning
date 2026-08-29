import {
  type Context,
  type Handlers,
  type Row,
  fail,
  need,
  uid,
  hash,
  enqueue,
  verified,
  limit,
} from './core.js';
import { course, canAccess } from './catalog.js';
import { streamUrl } from './media.js';
export function mergeRanges(
  ranges: number[][],
  start: number,
  end: number,
  duration: number,
) {
  const all = [
      ...ranges,
      ...(end > start ? [[Math.max(0, start), Math.min(duration, end)]] : []),
    ].sort((a, b) => a[0] - b[0]),
    out: number[][] = [];
  for (const r of all) {
    if (r[1] <= r[0]) continue;
    const prev = out.at(-1);
    if (prev && r[0] <= prev[1] + 0.05) prev[1] = Math.max(prev[1], r[1]);
    else out.push([...r]);
  }
  return out;
}
export function learningHandlers(c: Context): Handlers {
  return {
    startPlayback: async i => {
      const [l] = await c.db.query(
        'SELECT l.*,m.playback_key,m.status media_status,v.course_id,v.status version_status FROM lessons l JOIN media_assets m ON m.id=l.media_asset_id JOIN course_versions v ON v.id=l.course_version_id WHERE l.id=$1',
        [i.params.lessonId],
      );
      need(l);
      if (l.media_status !== 'ready' || l.version_status !== 'published')
        fail(404, 'LESSON_UNAVAILABLE');
      let enrollment: Row | undefined;
      const row = await course(c, i.user.id, l.course_id, true);
      if (i.body.enrollmentId) {
        verified(i, c);
        enrollment = need(
          (
            await c.db.query(
              'SELECT * FROM enrollments WHERE id=$1 AND user_id=$2 AND course_version_id=$3',
              [i.body.enrollmentId, i.user.id, l.course_version_id],
            )
          )[0],
        );
        if (!(await canAccess(c, i.user.id, row)))
          fail(403, 'SUBSCRIPTION_REQUIRED');
      } else if (
        !l.is_preview ||
        row.status !== 'published' ||
        l.course_version_id !== row.published_version_id
      )
        fail(403, 'ENROLLMENT_REQUIRED');
      const [p] = await c.db.query(
        'SELECT * FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2',
        [i.user.id, l.id],
      );
      const id = uid(),
        expires = c.config.now() + 300000;
      await c.db.query(
        'INSERT INTO playback_sessions(id,user_id,enrollment_id,course_version_id,lesson_id,expires_at,grant_key,last_received_at,last_position_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          i.user.id,
          enrollment?.id || null,
          l.course_version_id,
          l.id,
          new Date(expires).toISOString(),
          l.playback_key,
          new Date(c.config.now()).toISOString(),
          p?.last_position_seconds || 0,
        ],
      );
      return {
        playbackSessionId: id,
        lessonId: l.id,
        streamUrl: streamUrl(c, id, expires),
        expiresAt: new Date(expires).toISOString(),
        format: 'hls',
        resumePositionSeconds: Number(p?.last_position_seconds || 0),
        durationSeconds: Number(l.duration_seconds),
        heartbeatIntervalSeconds: 15,
        progressAllowed: !!enrollment,
      };
    },
    recordPlayback: async i => {
      await limit(
        c,
        `progress:${i.user.id}:${i.params.playbackSessionId}`,
        30,
        60,
      );
      return c.db.tx(async db => {
        const t = { ...c, db };
        const s = need(
          (
            await db.query(
              'SELECT * FROM playback_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',
              [i.params.playbackSessionId, i.user.id],
            )
          )[0],
        );
        if (new Date(s.expires_at).getTime() < c.config.now() || s.closed_at)
          fail(409, 'PLAYBACK_SESSION_EXPIRED');
        const l = need(
          (
            await db.query(
              'SELECT l.*,v.course_id FROM lessons l JOIN course_versions v ON v.id=l.course_version_id WHERE l.id=$1',
              [s.lesson_id],
            )
          )[0],
        );
        const row = await course(t, i.user.id, l.course_id, true);
        if (s.enrollment_id && !(await canAccess(t, i.user.id, row)))
          fail(403, 'SUBSCRIPTION_REQUIRED');
        let p: Row = {
          last_position_seconds: s.last_position_seconds,
          watched_seconds: 0,
          watched_ranges: [],
          completed_at: null,
        };
        if (s.enrollment_id) {
          await db.query(
            'INSERT INTO lesson_progress(user_id,lesson_id,course_version_id,enrollment_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
            [i.user.id, l.id, l.course_version_id, s.enrollment_id],
          );
          p = (
            await db.query(
              'SELECT * FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2 FOR UPDATE',
              [i.user.id, l.id],
            )
          )[0];
        }
        const accepted: string[] = [];
        const duration = Number(l.duration_seconds);
        let lastTime = new Date(s.last_received_at || s.started_at).getTime(),
          position = Number(s.last_position_seconds),
          seq = s.last_sequence;
        // last_received_at is the wall-clock credit cursor. Heartbeats may retain
        // up to two already-earned seconds to absorb network/decoder jitter.
        // A seek, pause or end clears that reserve; no client time is trusted.
        let available = Math.max(
          0,
          Math.min(30, (c.config.now() - lastTime) / 1000),
        );
        for (const event of i.body.events) {
          const payloadHash = hash(t, JSON.stringify(event));
          const [old] = await db.query(
            'SELECT * FROM playback_events WHERE event_id=$1 OR (playback_session_id=$2 AND sequence=$3)',
            [event.eventId, s.id, event.sequence],
          );
          if (old) {
            if (
              old.payload_hash !== payloadHash ||
              old.playback_session_id !== s.id
            )
              fail(409, 'EVENT_CONFLICT');
            accepted.push(event.eventId);
            continue;
          }
          if (event.sequence !== seq + 1) fail(409, 'EVENT_SEQUENCE_CONFLICT');
          if (event.positionSeconds > duration + 1)
            fail(422, 'POSITION_OUT_OF_RANGE');
          const end = Math.min(duration, event.positionSeconds),
            delta = end - position;
          if (
            s.enrollment_id &&
            event.kind !== 'seek' &&
            delta > 0 &&
            delta <= available * event.playbackRate + 1
          ) {
            // Small arrival jitter must not discard a whole 15-second interval.
            // Credit only real elapsed time, never the tolerance itself.
            const credited = Math.min(delta, available * event.playbackRate);
            p.watched_ranges = mergeRanges(
              p.watched_ranges,
              position,
              position + credited,
              duration,
            );
            available = Math.max(0, available - credited / event.playbackRate);
          }
          if (event.kind !== 'heartbeat') available = 0;
          await db.query(
            'INSERT INTO playback_events(event_id,playback_session_id,sequence,kind,position_seconds,playback_rate,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              event.eventId,
              s.id,
              event.sequence,
              event.kind,
              end,
              event.playbackRate,
              payloadHash,
            ],
          );
          seq = event.sequence;
          position = end;
          accepted.push(event.eventId);
        }
        const watched = (p.watched_ranges as number[][]).reduce(
            (sum, r) => sum + r[1] - r[0],
            0,
          ),
          complete = !!p.completed_at || watched >= duration * 0.95;
        let enrollment = null;
        if (seq !== s.last_sequence) {
          await db.query(
            'UPDATE playback_sessions SET last_sequence=$2,last_position_seconds=$3,last_received_at=$4 WHERE id=$1',
            [s.id, seq, position, new Date(c.config.now() - Math.min(2, available) * 1000).toISOString()],
          );
          if (s.enrollment_id) {
            await db.query(
              'UPDATE lesson_progress SET last_position_seconds=$3,watched_seconds=$4,watched_ranges=$5,completed_at=CASE WHEN $6 THEN COALESCE(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE user_id=$1 AND lesson_id=$2',
              [
                i.user.id,
                l.id,
                position,
                watched,
                JSON.stringify(p.watched_ranges),
                complete,
              ],
            );
            const e = need(
              (
                await db.query(
                  'SELECT * FROM enrollments WHERE id=$1 FOR UPDATE',
                  [s.enrollment_id],
                )
              )[0],
            );
            const required = await db.query(
              'SELECT l.duration_seconds,p.watched_seconds,p.completed_at FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_version_id=$1 AND l.required',
              [e.course_version_id, i.user.id],
            );
            const all =
                required.length > 0 && required.every(r => r.completed_at),
              total = required.reduce(
                (n, r) => n + Number(r.duration_seconds),
                0,
              ),
              pct = all
                ? 100
                : Math.min(
                    99.99,
                    Math.round(
                      (required.reduce(
                        (n, r) =>
                          n +
                          Math.min(
                            1,
                            Number(r.watched_seconds || 0) /
                              (Number(r.duration_seconds) * 0.95),
                          ) *
                            Number(r.duration_seconds),
                        0,
                      ) /
                        total) *
                        10000,
                    ) / 100,
                  );
            await db.query(
              'UPDATE enrollments SET progress_percent=$2,completed_at=CASE WHEN $3 THEN COALESCE(completed_at,now()) ELSE completed_at END,last_activity_at=now() WHERE id=$1',
              [e.id, pct, all],
            );
            enrollment = { id: e.id, progressPercent: pct, completed: all };
            const certificateAllowed =
              row.certificate_enabled &&
              await canAccess(t, i.user.id, row, true);
            if (all && !e.completed_at && certificateAllowed) {
              const [version] = await db.query(
                'SELECT title_snapshot FROM course_versions WHERE id=$1',
                [e.course_version_id],
              );
              await enqueue(
                t,
                'certificate',
                e.id,
                {
                  enrollmentId: e.id,
                  userId: i.user.id,
                  name: i.user.name,
                  title: version.title_snapshot,
                },
                `certificate:${e.id}`,
              );
            }
          }
        } else if (s.enrollment_id) {
          const [e] = await db.query('SELECT * FROM enrollments WHERE id=$1', [
            s.enrollment_id,
          ]);
          enrollment = {
            id: e.id,
            progressPercent: Number(e.progress_percent),
            completed: !!e.completed_at,
          };
        }
        return {
          acceptedEventIds: accepted,
          lesson: {
            lessonId: l.id,
            lastPositionSeconds: position,
            watchedSeconds: watched,
            completed: complete && !!s.enrollment_id,
          },
          enrollment,
          nextSequence: seq + 1,
        };
      });
    },
  };
}
