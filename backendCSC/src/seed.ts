import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { type Context, ROOT, uid, token } from './core.js';
import { Storage, processVideo } from './media.js';
export async function seed(c: Context, providedPassword?: string) {
  if (c.config.env === 'production')
    throw Error('Demo seed is forbidden in production');
  const existing = (
    await c.db.query("SELECT id FROM users WHERE email='admin@salford.test'")
  )[0];
  if (existing) return { existing: true, adminId: existing.id };
  const password = providedPassword || token().slice(0, 24),
    hash = await argon2.hash(password, { type: argon2.argon2id });
  const [admin] = await c.db.query(
    "INSERT INTO users(email,name,password_hash,role,email_verified_at) VALUES('admin@salford.test','Demo Admin',$1,'admin',now()) RETURNING *",
    [hash],
  );
  const [student] = await c.db.query(
    "INSERT INTO users(email,name,password_hash,email_verified_at) VALUES('learner@salford.test','Demo Learner',$1,now()) RETURNING *",
    [hash],
  );
  for (const u of [admin, student])
    await c.db.query('INSERT INTO user_settings(user_id) VALUES($1)', [u.id]);
  const storage = new Storage(c),
    media = [];
  for (const [file, kind, mime] of [
    ['course-cover.png', 'image', 'image/png'],
    ['lesson-preview.mp4', 'video', 'video/mp4'],
  ]) {
    const data = await readFile(path.join(ROOT, 'assets', file)),
      id = uid(),
      key = `seed/${id}/${file}`;
    await storage.write(key, data, mime);
    const [a] = await c.db.query(
      'INSERT INTO media_assets(id,uploaded_by,kind,object_key,mime_type,byte_size,checksum_sha256,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        id,
        admin.id,
        kind,
        key,
        mime,
        data.length,
        createHash('sha256').update(data).digest('hex'),
        kind === 'image' ? 'ready' : 'processing',
      ],
    );
    media.push(a);
  }
  await processVideo(c, media[1].id);
  const [video] = await c.db.query('SELECT * FROM media_assets WHERE id=$1', [
    media[1].id,
  ]);
  // Keep every seeded course cover tied to the supplied Figma artwork. The
  // mobile client still receives these through the media API; it never needs
  // to guess a local placeholder from a course title.
  const coverAssets = new Map<string, (typeof media)[number]>();
  for (const slug of [
    'programming',
    'cybersecurity',
    'visual-design',
    'ux-research',
    'figma',
    'portfolio',
    'prototyping',
  ]) {
    const data = await readFile(
        path.join(ROOT, 'assets', 'course-covers', `${slug}.png`),
      ),
      id = uid(),
      key = `seed/${id}/${slug}.png`;
    await storage.write(key, data, 'image/png');
    const [asset] = await c.db.query(
      'INSERT INTO media_assets(id,uploaded_by,kind,object_key,mime_type,byte_size,checksum_sha256,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        id,
        admin.id,
        'image',
        key,
        'image/png',
        data.length,
        createHash('sha256').update(data).digest('hex'),
        'ready',
      ],
    );
    coverAssets.set(slug, asset);
  }
  const categories = new Map<string, string>();
  for (const [slug, name] of [
    ['ui-ux', 'UI & UX'],
    ['animation', 'Animation'],
    ['graphic-design', 'Graphic Design'],
    ['programming', 'Programming'],
    ['cybersecurity', 'Cybersecurity'],
  ]) {
    const [ca] = await c.db.query(
      'INSERT INTO categories(slug,name) VALUES($1,$2) RETURNING id',
      [slug, name],
    );
    categories.set(name, ca.id);
  }
  const [instructor] = await c.db.query(
    "INSERT INTO instructors(name,bio) VALUES('John Smith','Demonstration instructor. Replace with licensed real course content.') RETURNING id",
  );
  const courses = [];
  const seededCourses: Array<[string, string, string, number]> = [
    ['programming', 'Introduction to Programming', 'Programming', 3],
    ['cybersecurity', 'Cybersecurity Essentials', 'Cybersecurity', 4],
    ['visual-design', 'Visual Design', 'Graphic Design', 0],
    ['ux-research', 'UX Research', 'UI & UX', 1],
    ['figma', 'UI Design With Figma', 'UI & UX', 2],
    ['portfolio', 'Build Own Portfolio', 'Graphic Design', 5],
    ['prototyping', 'Advanced Prototyping', 'Animation', 6],
  ];
  for (const [slug, title, category, featuredRank] of seededCourses) {
    const [row] = await c.db.query(
      'INSERT INTO courses(slug,legacy_key,title,description,category_id,instructor_id,cover_asset_id,access_type,certificate_enabled,featured_rank) VALUES($1,$1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING *',
      [
        slug,
        title,
        'Local demonstration course. Both lessons use an original 18-second sample video, not the real course curriculum.',
        categories.get(category),
        instructor.id,
        coverAssets.get(slug)!.id,
        slug === 'programming' ? 'free' : 'subscription',
        featuredRank,
      ],
    );
    const [v] = await c.db.query(
      "INSERT INTO course_versions(course_id,version,title_snapshot,status,published_at) VALUES($1,1,$2,'published',now()) RETURNING id",
      [row.id, title],
    );
    const [ch] = await c.db.query(
      "INSERT INTO chapters(course_version_id,title,sort_order) VALUES($1,'Demo chapter',0) RETURNING id",
      [v.id],
    );
    for (let index = 0; index < 2; index++)
      await c.db.query(
        'INSERT INTO lessons(course_version_id,chapter_id,title,sort_order,media_asset_id,duration_seconds,is_preview) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          v.id,
          ch.id,
          `Sample lesson ${index + 1}`,
          index,
          video.id,
          video.duration_seconds,
          index === 0,
        ],
      );
    await c.db.query(
      "UPDATE courses SET published_version_id=$2,status='published' WHERE id=$1",
      [row.id, v.id],
    );
    courses.push(row.id);
  }
  for (const name of ['Basic', 'Pro', 'Premium']) {
    const [p] = await c.db.query(
      'INSERT INTO plans(code,name,features,active,demo_amount_minor) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [
        name.toLowerCase(),
        name,
        JSON.stringify(['Course access', 'Completion certificates']),
        c.config.billingMode === 'demo',
        { Basic: 999, Pro: 1999, Premium: 2999 }[name],
      ],
    );
    for (const id of courses)
      await c.db.query(
        'INSERT INTO plan_courses(plan_id,course_id) VALUES($1,$2)',
        [p.id, id],
      );
  }
  const accounts = {
    admin: { email: admin.email, password },
    learner: { email: student.email, password },
    note: 'Local demo accounts only. Billing is simulated and never charges money.',
  };
  await writeFile(
    path.join(c.config.dataDir, 'demo-accounts.json'),
    JSON.stringify(accounts, null, 2),
    { mode: 0o600 },
  );
  return {
    existing: false,
    adminId: admin.id,
    studentId: student.id,
    courses: 7,
    accountsFile: path.join(c.config.dataDir, 'demo-accounts.json'),
  };
}
