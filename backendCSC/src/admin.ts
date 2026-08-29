import {
  type Context,
  type Handlers,
  type Row,
  need,
  fail,
  audit,
  iso,
  paginate,
} from './core.js';

const userView = (u: Row) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  emailVerified: !!u.email_verified_at,
  createdAt: iso(u.created_at),
  enrollmentCount: Number(u.enrollment_count || 0),
});
async function catalog(c: Context) {
  return (
    await c.db.query(`SELECT c.*,ca.name category_name,i.name instructor_name,
    (SELECT count(*)::int FROM enrollments e WHERE e.course_id=c.id) enrollment_count,
    (SELECT v.title_snapshot FROM course_versions v WHERE v.course_id=c.id AND v.status='draft' ORDER BY v.version DESC LIMIT 1) draft_title
    FROM courses c JOIN categories ca ON ca.id=c.category_id JOIN instructors i ON i.id=c.instructor_id ORDER BY c.created_at DESC,c.id`)
  ).map((r) => ({
    id: r.id,
    title: r.draft_title || r.title,
    slug: r.slug,
    status: r.status,
    categoryName: r.category_name,
    instructorName: r.instructor_name,
    accessType: r.access_type,
    enrollmentCount: r.enrollment_count,
    coverUrl: r.cover_asset_id ? `/v1/media/images/${r.cover_asset_id}` : null,
  }));
}
export function adminHandlers(c: Context): Handlers {
  return {
    adminOverview: async () => {
      const [counts] = await c.db.query(`SELECT
        (SELECT count(*)::int FROM users WHERE role='student' AND status<>'deleted') students,
        (SELECT count(*)::int FROM courses) courses,
        (SELECT count(*)::int FROM courses WHERE status='published') published,
        (SELECT count(*)::int FROM enrollments) enrollments,
        (SELECT count(*)::int FROM enrollments WHERE completed_at IS NOT NULL) completions,
        (SELECT count(*)::int FROM demo_payments WHERE status='succeeded' AND period_end>now()) active_demo_payments,
        (SELECT COALESCE(sum(amount_minor),0)::float FROM demo_payments WHERE status='succeeded') demo_amount_minor`);
      const activity = await c.db
        .query(`SELECT to_char(d,'YYYY-MM-DD') AS "day",
        (SELECT count(*)::int FROM enrollments e WHERE e.created_at>=d AND e.created_at<d+interval '1 day') enrollments
        FROM generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day') d`);
      return {
        billingMode: c.config.billingMode,
        students: counts.students,
        courses: counts.courses,
        published: counts.published,
        enrollments: counts.enrollments,
        completions: counts.completions,
        activeDemoPayments: counts.active_demo_payments,
        demoAmountMinor: counts.demo_amount_minor,
        currency: 'USD',
        activity,
        recentCourses: (await catalog(c)).slice(0, 6),
      };
    },
    adminDirectory: async () => ({
      categories: await c.db.query(
        'SELECT id,slug,name,active FROM categories ORDER BY sort_order,id'
      ),
      instructors: await c.db.query(
        'SELECT id,name,bio FROM instructors ORDER BY name,id'
      ),
      assets: (
        await c.db.query(
          'SELECT id,kind,status,mime_type,created_at FROM media_assets ORDER BY created_at DESC,id'
        )
      ).map((a) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        mimeType: a.mime_type,
        createdAt: iso(a.created_at),
      })),
      courses: (await catalog(c)).map((r) => ({ id: r.id, title: r.title })),
    }),
    adminCatalog: async (i) => {
      const q = String(i.query.q || '').toLowerCase();
      const rows = (await catalog(c)).filter(
        (r) =>
          (!q || `${r.title} ${r.instructorName}`.toLowerCase().includes(q)) &&
          (!i.query.status || r.status === i.query.status)
      );
      return paginate(c, rows, i.query, 'admin:catalog-detail');
    },
    adminGetCourse: async (i) => {
      const row = need(
        (
          await c.db.query('SELECT * FROM courses WHERE id=$1', [
            i.params.courseId,
          ])
        )[0]
      );
      const v = need(
        (
          await c.db.query(
            'SELECT * FROM course_versions WHERE course_id=$1 ORDER BY version DESC LIMIT 1',
            [row.id]
          )
        )[0]
      );
      const chapters = await c.db.query(
        'SELECT id,title FROM chapters WHERE course_version_id=$1 ORDER BY sort_order',
        [v.id]
      );
      const lessons = await c.db.query(
        'SELECT * FROM lessons WHERE course_version_id=$1 ORDER BY sort_order',
        [v.id]
      );
      return {
        courseId: row.id,
        versionId: v.id,
        status: row.status,
        versionStatus: v.status,
        draft: {
          ...(v.metadata || {
            title: row.title,
            description: row.description,
            coverAssetId: row.cover_asset_id,
            categoryId: row.category_id,
            instructorId: row.instructor_id,
            accessType: row.access_type,
            certificateEnabled: row.certificate_enabled,
            featuredRank: row.featured_rank,
          }),
          chapters: chapters.map((ch) => ({
            title: ch.title,
            lessons: lessons
              .filter((l) => l.chapter_id === ch.id)
              .map((l) => ({
                title: l.title,
                description: l.description,
                mediaAssetId: l.media_asset_id,
                required: l.required,
                isPreview: l.is_preview,
              })),
          })),
        },
      };
    },
    adminUsers: async (i) => {
      const rows = await c.db.query(
        `SELECT u.*,(SELECT count(*)::int FROM enrollments e WHERE e.user_id=u.id) enrollment_count
        FROM users u WHERE ($1='' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%') ORDER BY u.created_at DESC,u.id`,
        [i.query.q || '']
      );
      return paginate(c, rows.map(userView), i.query, 'admin:users');
    },
    adminUpdateUser: async (i) =>
      c.db.tx(async (db) => {
        const u = need(
          (
            await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [
              i.params.userId,
            ])
          )[0]
        );
        if (u.role === 'admin' || u.id === i.user.id)
          fail(403, 'ADMIN_ACCOUNT_PROTECTED');
        if (!['active', 'suspended'].includes(u.status))
          fail(409, 'ACCOUNT_NOT_EDITABLE');
        await db.query(
          'UPDATE users SET status=$2,updated_at=now() WHERE id=$1',
          [u.id, i.body.status]
        );
        if (i.body.status === 'suspended')
          await db.query(
            'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',
            [u.id]
          );
        await audit(
          { ...c, db },
          i,
          i.body.status === 'suspended' ? 'suspend_user' : 'activate_user',
          'user',
          u.id
        );
        const [count] = await db.query(
          'SELECT count(*)::int n FROM enrollments WHERE user_id=$1',
          [u.id]
        );
        return userView({
          ...u,
          status: i.body.status,
          enrollment_count: count.n,
        });
      }),
    adminAudit: async (i) =>
      paginate(
        c,
        (
          await c.db
            .query(`SELECT a.id,a.action,a.resource_type,a.resource_id,a.created_at,u.name actor_name
      FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id`)
        ).map((a) => ({
          id: a.id,
          action: a.action,
          resourceType: a.resource_type,
          resourceId: a.resource_id,
          actorName: a.actor_name || 'System',
          createdAt: iso(a.created_at),
        })),
        i.query,
        'admin:audit'
      ),
  };
}
