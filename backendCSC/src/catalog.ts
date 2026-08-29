import {
  type Context,
  type Input,
  type Row,
  type Handlers,
  fail,
  need,
  verified,
  publicUser,
  paginate,
  audit,
  iso,
  enqueue,
} from './core.js';
export const billingEnvironment = () =>
  process.env.BILLING_ENVIRONMENT || 'sandbox';
export async function canAccess(c: Context, user: string, course: Row, certificate = false) {
  if (course.access_type === 'free') return true;
  if (c.config.billingMode === 'demo')
    return !!(await c.db.query(`SELECT d.id FROM demo_payments d JOIN plans p ON p.id=d.plan_id
      JOIN plan_courses pc ON pc.plan_id=p.id WHERE d.user_id=$1 AND pc.course_id=$2 AND d.status='succeeded'
      AND d.period_end>now() AND d.period_start<=now() AND (NOT $3::boolean OR p.certificate_enabled) LIMIT 1`,
      [user, course.id, certificate])).length;
  return !!(
    await c.db.query(
      `SELECT s.id FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN plan_courses pc ON pc.plan_id=s.plan_id WHERE s.user_id=$1 AND pc.course_id=$2 AND s.status IN ('active','grace') AND s.period_end>now() AND s.period_start<=now() AND s.environment=$3 AND (NOT $4::boolean OR p.certificate_enabled) LIMIT 1`,
      [user, course.id, billingEnvironment(), certificate],
    )
  ).length;
}
export async function courseRows(c: Context, user: string, all = false) {
  return c.db.query(
    `SELECT c.*,ca.name category_name,ca.slug category_slug,i.name instructor_name,i.bio instructor_bio,
  EXISTS(SELECT 1 FROM bookmarks b WHERE b.user_id=$1 AND b.course_id=c.id) saved,
  (SELECT count(*)::int FROM lessons l WHERE l.course_version_id=c.published_version_id) lesson_count,
  (SELECT COALESCE(sum(duration_seconds),0)::float FROM lessons l WHERE l.course_version_id=c.published_version_id) duration_seconds,
  (SELECT count(*)::int FROM enrollments e WHERE e.course_id=c.id) popularity
  FROM courses c JOIN categories ca ON ca.id=c.category_id JOIN instructors i ON i.id=c.instructor_id
  WHERE ($2::boolean OR (c.status='published' AND ca.active)) ORDER BY c.created_at DESC,c.id`,
    [user, all],
  );
}
export async function courseSummary(c: Context, user: string, row: Row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    coverUrl: row.cover_asset_id
      ? `${c.config.origin}/v1/media/images/${row.cover_asset_id}`
      : null,
    instructor: {
      id: row.instructor_id,
      name: row.instructor_name,
      bio: row.instructor_bio || '',
      avatarUrl: null,
    },
    category: {
      id: row.category_id,
      slug: row.category_slug,
      name: row.category_name,
    },
    accessType: row.access_type,
    lessonCount: Number(row.lesson_count),
    durationSeconds: Number(row.duration_seconds),
    saved: row.saved,
    canAccess: await canAccess(c, user, row),
  };
}
export async function course(
  c: Context,
  user: string,
  id: string,
  all = false,
) {
  return need((await courseRows(c, user, all)).find(row => row.id === id));
}
export function enrollmentView(e: Row, access: boolean) {
  return {
    id: e.id,
    courseId: e.course_id,
    courseVersionId: e.course_version_id,
    progressPercent: Number(e.progress_percent),
    completedAt: iso(e.completed_at),
    lastActivityAt: iso(e.last_activity_at),
    canAccess: access,
  };
}
export async function library(c: Context, i: Input, history = false) {
  let rows = await c.db.query(
    `SELECT * FROM enrollments WHERE user_id=$1 ${
      history ? 'AND last_activity_at IS NOT NULL' : ''
    } ORDER BY last_activity_at DESC NULLS LAST,id`,
    [i.user.id],
  );
  if (i.query.status === 'completed') rows = rows.filter(e => !!e.completed_at);
  if (i.query.status === 'in_progress')
    rows = rows.filter(e => !e.completed_at);
  const cards = await courseRows(c, i.user.id, true),
    result = [];
  for (const e of rows) {
    const row = need(cards.find(c => c.id === e.course_id));
    const [next] = await c.db.query(
      `SELECT l.id FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_version_id=$1 AND p.completed_at IS NULL ORDER BY ch.sort_order,l.sort_order LIMIT 1`,
      [e.course_version_id, i.user.id],
    );
    result.push({
      course: await courseSummary(c, i.user.id, row),
      enrollment: enrollmentView(e, await canAccess(c, i.user.id, row)),
      nextLessonId: next?.id || null,
    });
  }
  return paginate(
    c,
    result,
    i.query,
    `${i.user.id}:${history ? 'history' : 'library'}`,
  );
}
export async function notify(
  c: Context,
  user: string,
  kind: string,
  title: string,
  body: string,
  type: string | null,
  id: string | null,
  key: string,
) {
  const [n] = await c.db.query(
    'INSERT INTO notifications(user_id,kind,title,body,target_type,target_id,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING *',
    [user, kind, title, body, type, id, key],
  );
  if (n)
    await enqueue(c, 'push', n.id, { notificationId: n.id }, `push:${n.id}`);
}
export function catalogHandlers(c: Context): Handlers {
  return {
    listCategories: async () =>
      c.db.query(
        'SELECT id,slug,name FROM categories WHERE active ORDER BY sort_order,id',
      ),
    listCourses: async i => {
      let rows = await courseRows(c, i.user.id);
      const q = String(i.query.q || '')
        .trim()
        .toLowerCase();
      if (q)
        rows = rows.filter(r =>
          `${r.title} ${r.instructor_name} ${r.description}`
            .toLowerCase()
            .includes(q),
        );
      if (i.query.categoryId)
        rows = rows.filter(r => r.category_id === i.query.categoryId);
      if (i.query.sort === 'popular')
        rows.sort(
          (a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id),
        );
      const p = paginate(c, rows, i.query, `${i.user.id}:catalog`);
      return {
        ...p,
        items: await Promise.all(
          p.items.map(r => courseSummary(c, i.user.id, r)),
        ),
      };
    },
    getCourse: async i => {
      const row = await course(c, i.user.id, i.params.courseId);
      return {
        course: await courseSummary(c, i.user.id, row),
        description: row.description,
        publishedVersionId: row.published_version_id,
        allowedPlanIds: (
          await c.db.query(
            'SELECT plan_id FROM plan_courses WHERE course_id=$1',
            [row.id],
          )
        ).map(r => r.plan_id),
        accessReason:
          row.access_type === 'free'
            ? 'free'
            : (await canAccess(c, i.user.id, row))
            ? 'subscription'
            : 'subscription_required',
      };
    },
    getCurriculum: async i => {
      const row = await course(c, i.user.id, i.params.courseId, true);
      let version = i.query.versionId || row.published_version_id;
      if (version !== row.published_version_id || row.status !== 'published') {
        if (
          !(
            await c.db.query(
              'SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2 AND course_version_id=$3',
              [i.user.id, row.id, version],
            )
          ).length
        )
          fail(404, 'RESOURCE_NOT_FOUND');
      }
      const chapters = await c.db.query(
        'SELECT * FROM chapters WHERE course_version_id=$1 ORDER BY sort_order',
        [version],
      );
      for (const ch of chapters)
        ch.lessons = (
          await c.db.query(
            'SELECT * FROM lessons WHERE chapter_id=$1 ORDER BY sort_order',
            [ch.id],
          )
        ).map(l => ({
          id: l.id,
          title: l.title,
          durationSeconds: Number(l.duration_seconds),
          required: l.required,
          isPreview: l.is_preview,
          sortOrder: l.sort_order,
        }));
      return {
        courseId: row.id,
        versionId: version,
        chapters: chapters.map(ch => ({
          id: ch.id,
          title: ch.title,
          sortOrder: ch.sort_order,
          lessons: ch.lessons,
        })),
      };
    },
    getHome: async i => {
      const rows = await courseRows(c, i.user.id);
      const trending = [...rows]
          .sort((a, b) => (a.featured_rank ?? 999) - (b.featured_rank ?? 999))
          .slice(0, 10),
        popular = [...rows]
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 10);
      return {
        user: publicUser(i.user, c),
        categories: await c.db.query(
          'SELECT id,slug,name FROM categories WHERE active ORDER BY sort_order,id',
        ),
        trending: await Promise.all(
          trending.map(r => courseSummary(c, i.user.id, r)),
        ),
        popular: await Promise.all(
          popular.map(r => courseSummary(c, i.user.id, r)),
        ),
        continueLearning: (
          await library(c, { ...i, query: { limit: 5, status: 'in_progress' } })
        ).items,
        unreadNotifications: Number(
          (
            await c.db.query(
              'SELECT count(*) n FROM notifications WHERE user_id=$1 AND read_at IS NULL',
              [i.user.id],
            )
          )[0].n,
        ),
      };
    },
    saveBookmark: async i => {
      await course(c, i.user.id, i.params.courseId);
      await c.db.query(
        'INSERT INTO bookmarks(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [i.user.id, i.params.courseId],
      );
    },
    removeBookmark: async i => {
      await c.db.query(
        'DELETE FROM bookmarks WHERE user_id=$1 AND course_id=$2',
        [i.user.id, i.params.courseId],
      );
    },
    listBookmarks: async i => {
      const rows = (await courseRows(c, i.user.id, true)).filter(r => r.saved);
      const p = paginate(c, rows, i.query, `${i.user.id}:bookmarks`);
      return {
        ...p,
        items: await Promise.all(
          p.items.map(r => courseSummary(c, i.user.id, r)),
        ),
      };
    },
    enroll: async i => {
      verified(i, c);
      const row = await course(c, i.user.id, i.params.courseId);
      if (!(await canAccess(c, i.user.id, row)))
        fail(403, 'SUBSCRIPTION_REQUIRED');
      const [e] = await c.db.query(
        'INSERT INTO enrollments(user_id,course_id,course_version_id) VALUES($1,$2,$3) ON CONFLICT(user_id,course_version_id) DO UPDATE SET course_id=EXCLUDED.course_id RETURNING *',
        [i.user.id, row.id, row.published_version_id],
      );
      return enrollmentView(e, true);
    },
    listMyCourses: i => library(c, i),
    getHistory: i => library(c, i, true),
    getProgress: async i => {
      const [e] = await c.db.query(
        'SELECT * FROM enrollments WHERE id=$1 AND user_id=$2',
        [i.params.enrollmentId, i.user.id],
      );
      need(e);
      const row = await course(c, i.user.id, e.course_id, true);
      const lessons = await c.db.query(
        'SELECT l.id,p.last_position_seconds,p.watched_seconds,p.completed_at FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_version_id=$1',
        [e.course_version_id, i.user.id],
      );
      return {
        enrollment: enrollmentView(e, await canAccess(c, i.user.id, row)),
        lessons: lessons.map(l => ({
          lessonId: l.id,
          lastPositionSeconds: Number(l.last_position_seconds || 0),
          watchedSeconds: Number(l.watched_seconds || 0),
          completed: !!l.completed_at,
        })),
      };
    },
    createCategory: async i => {
      const [r] = await c.db.query(
        'INSERT INTO categories(slug,name) VALUES($1,$2) RETURNING id,slug,name',
        [i.body.slug, i.body.name],
      );
      await audit(c, i, 'create', 'category', r.id);
      return r;
    },
    updateCategory: async i => {
      const [r] = await c.db.query(
        'UPDATE categories SET name=$2,active=$3 WHERE id=$1 RETURNING id,slug,name',
        [i.params.categoryId, i.body.name, i.body.active],
      );
      need(r);
      await audit(c, i, 'update', 'category', r.id);
      return r;
    },
    createInstructor: async i => {
      const [r] = await c.db.query(
        'INSERT INTO instructors(name,bio) VALUES($1,$2) RETURNING *',
        [i.body.name, i.body.bio],
      );
      await audit(c, i, 'create', 'instructor', r.id);
      return { id: r.id, name: r.name, bio: r.bio, avatarUrl: null };
    },
    updateInstructor: async i => {
      const [r] = await c.db.query(
        'UPDATE instructors SET name=$2,bio=$3 WHERE id=$1 RETURNING *',
        [i.params.instructorId, i.body.name, i.body.bio],
      );
      need(r);
      await audit(c, i, 'update', 'instructor', r.id);
      return { id: r.id, name: r.name, bio: r.bio, avatarUrl: null };
    },
    adminListCourses: async i =>
      paginate(
        c,
        (
          await c.db.query(
            'SELECT id,published_version_id,status FROM courses ORDER BY created_at DESC,id',
          )
        ).map(r => ({
          courseId: r.id,
          versionId: r.published_version_id || r.id,
          status: r.status,
        })),
        i.query,
        'admin:catalog',
      ),
    createCourse: async i =>
      c.db.tx(async db => {
        const t = { ...c, db },
          b = i.body;
        const [row] = await db.query(
          'INSERT INTO courses(slug,title,category_id,instructor_id,access_type,certificate_enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            b.slug,
            b.title,
            b.categoryId,
            b.instructorId,
            b.accessType,
            b.certificateEnabled,
          ],
        );
        const [v] = await db.query(
          'INSERT INTO course_versions(course_id,version,title_snapshot) VALUES($1,1,$2) RETURNING id',
          [row.id, row.title],
        );
        await audit(t, i, 'create', 'course', row.id);
        return { courseId: row.id, versionId: v.id, status: 'draft' };
      }),
    saveCourseDraft: async i =>
      c.db.tx(async db => {
        const t = { ...c, db },
          b = i.body,
          id = i.params.courseId;
        need(
          (
            await db.query('SELECT id FROM courses WHERE id=$1 FOR UPDATE', [
              id,
            ])
          )[0],
        );
        let [v] = await db.query(
          "SELECT * FROM course_versions WHERE course_id=$1 AND status='draft' ORDER BY version DESC LIMIT 1",
          [id],
        );
        if (!v)
          [v] = await db.query(
            'INSERT INTO course_versions(course_id,version,title_snapshot) SELECT $1,COALESCE(max(version),0)+1,$2 FROM course_versions WHERE course_id=$1 RETURNING *',
            [id, b.title],
          );
        await db.query('DELETE FROM lessons WHERE course_version_id=$1', [
          v.id,
        ]);
        await db.query('DELETE FROM chapters WHERE course_version_id=$1', [
          v.id,
        ]);
        const { chapters, ...metadata } = b;
        await db.query(
          'UPDATE course_versions SET title_snapshot=$2,metadata=$3 WHERE id=$1',
          [v.id, b.title, metadata],
        );
        for (const [index, ch] of chapters.entries()) {
          const [chapter] = await db.query(
            'INSERT INTO chapters(course_version_id,title,sort_order) VALUES($1,$2,$3) RETURNING id',
            [v.id, ch.title, index],
          );
          for (const [pos, l] of ch.lessons.entries()) {
            const asset = need(
              (
                await db.query(
                  "SELECT * FROM media_assets WHERE id=$1 AND kind='video' AND status='ready'",
                  [l.mediaAssetId],
                )
              )[0],
              'MEDIA_NOT_READY',
            );
            await db.query(
              'INSERT INTO lessons(course_version_id,chapter_id,title,description,sort_order,media_asset_id,duration_seconds,required,is_preview) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [
                v.id,
                chapter.id,
                l.title,
                l.description,
                pos,
                asset.id,
                asset.duration_seconds,
                l.required,
                l.isPreview,
              ],
            );
          }
        }
        await audit(t, i, 'save_draft', 'course', id);
        return { courseId: id, versionId: v.id, status: 'draft' };
      }),
    publishCourse: async i =>
      c.db.tx(async db => {
        const t = { ...c, db },
          id = i.params.courseId;
        need(
          (
            await db.query('SELECT id FROM courses WHERE id=$1 FOR UPDATE', [
              id,
            ])
          )[0],
        );
        const v = need(
          (
            await db.query(
              "SELECT * FROM course_versions WHERE id=$1 AND course_id=$2 AND status='draft'",
              [i.body.versionId, id],
            )
          )[0],
        );
        const lessons = await db.query(
          'SELECT l.*,m.status media_status FROM lessons l JOIN media_assets m ON m.id=l.media_asset_id WHERE l.course_version_id=$1',
          [v.id],
        );
        if (
          !lessons.some(l => l.required) ||
          lessons.some(l => l.media_status !== 'ready')
        )
          fail(422, 'INCOMPLETE_CURRICULUM');
        const b = v.metadata;
        if (!b) fail(422, 'INCOMPLETE_DRAFT');
        need(
          (
            await db.query(
              "SELECT id FROM media_assets WHERE id=$1 AND kind='image' AND status='ready'",
              [b.coverAssetId],
            )
          )[0],
          'COVER_NOT_READY',
        );
        if (
          b.accessType === 'subscription' &&
          !(
            await db.query('SELECT 1 FROM plan_courses WHERE course_id=$1', [
              id,
            ])
          ).length
        )
          fail(422, 'PLAN_COVERAGE_REQUIRED');
        await db.query(
          "UPDATE courses SET title=$2,description=$3,category_id=$4,instructor_id=$5,cover_asset_id=$6,access_type=$7,certificate_enabled=$8,featured_rank=$9,published_version_id=$10,status='published',updated_at=now() WHERE id=$1",
          [
            id,
            b.title,
            b.description,
            b.categoryId,
            b.instructorId,
            b.coverAssetId,
            b.accessType,
            b.certificateEnabled,
            b.featuredRank,
            v.id,
          ],
        );
        await db.query(
          "UPDATE course_versions SET status='published',published_at=now() WHERE id=$1",
          [v.id],
        );
        await audit(t, i, 'publish', 'course', id);
        return { courseId: id, versionId: v.id, status: 'published' };
      }),
    archiveCourse: async i => {
      const [r] = await c.db.query(
        "UPDATE courses SET status='archived',updated_at=now() WHERE id=$1 RETURNING *",
        [i.params.courseId],
      );
      need(r);
      await audit(c, i, 'archive', 'course', r.id);
      return {
        courseId: r.id,
        versionId: r.published_version_id || r.id,
        status: 'archived',
      };
    },
  };
}
