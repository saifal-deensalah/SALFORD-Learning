const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SwaggerParser = require('@apidevtools/swagger-parser');
const {PGlite} = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '../../frontend');
const passed = [];
const pass = name => {passed.push(name); console.log(`PASS ${name}`);};

async function main() {
  const spec = JSON.parse(fs.readFileSync(path.join(root,'openapi.json'),'utf8'));
  await SwaggerParser.validate(path.join(root,'openapi.json'));
  pass('OpenAPI 3.0.3 schema, local references and operation definitions');
  const operations = Object.entries(spec.paths).flatMap(([route,methods]) => Object.entries(methods).map(([method,operation]) => ({route,method,...operation})));
  const ids = new Set(operations.map(operation => operation.operationId));
  assert.equal(ids.size, operations.length);
  pass('Unique operation identifiers');
  const map = JSON.parse(fs.readFileSync(path.join(root,'frontend-map.json'),'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(project,'src/design/manifest.json'),'utf8'));
  assert.deepEqual(map.screens.map(screen => screen.frameId).sort(),manifest.map(screen => screen.id).sort());
  for (const entry of [...map.screens,...map.panels]) for (const id of entry.operations) assert(ids.has(id),`Unknown operation ${id}`);
  pass('All 18 actual Figma frames map to existing API operations or explicit local-only behavior');
  const app = fs.readFileSync(path.join(project,'src/app/screen-config.ts'),'utf8');
  const panelDeclaration = app.match(/type Panel =([\s\S]*?);/)[1];
  const panelNames = [...panelDeclaration.matchAll(/'([a-z]+)'/g)].map(match=>match[1]);
  assert.deepEqual(map.panels.map(panel=>panel.name).sort(),panelNames.sort());
  pass('Every current frontend panel is covered');
  for(const operation of operations) {
    if(operation.route.startsWith('/admin/')) {
      assert.deepEqual(operation['x-roles'],['admin']);
      assert.notDeepEqual(operation.security,[]);
    }
    if(operation.route.startsWith('/me')) assert.notDeepEqual(operation.security,[]);
    if(operation.route.startsWith('/webhooks/')) assert(operation['x-provider-authentication']);
  }
  pass('Contract declares private/admin access and provider authentication boundaries');
  // Validate every declared path placeholder and keep conditional checkout gated.
  for(const operation of operations) for(const [,name] of operation.route.matchAll(/\{([^}]+)\}/g)) {
    assert(operation.parameters.some(p=>p.in==='path'&&p.name===name&&p.required));
  }
  assert.equal(spec.paths['/billing/checkout-sessions'].post['x-phase'],'conditional');
  assert.equal(spec.paths['/billing/purchases/verify'].post.responses['202'].description,'Success');
  assert(!Object.keys(spec.components.schemas.PlaybackEvent.properties).some(key=>/completed|percent|watchedSeconds/i.test(key)));
  pass('Path parameters, conditional checkout and server-owned completion contract');

  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(root,'database/schema.sql'),'utf8'));
    pass('Full SQL reference migration executes in embedded PostgreSQL');
    const insert = async (table,values) => {
      const names = Object.keys(values);
      const placeholders = names.map((_,index)=>`$${index+1}`).join(',');
      const result = await db.query(`INSERT INTO ${table} (${names.join(',')}) VALUES (${placeholders}) RETURNING *`,Object.values(values));
      return result.rows[0];
    };
    const rejects = async (name,code,callback) => {
      await assert.rejects(callback,error => error.code===code,`${name}: expected SQLSTATE ${code}`);
      pass(name);
    };
    const user = await insert('users',{email:'learner@example.com',name:'Test Learner'});
    const other = await insert('users',{email:'other@example.com',name:'Other Learner'});
    await rejects('Case-insensitive email uniqueness','23505',()=>insert('users',{email:' Learner@Example.com '}));
    await rejects('Unknown user role rejected','23514',()=>insert('users',{email:'role@example.com',role:'owner'}));
    await insert('auth_identities',{user_id:user.id,provider:'google',subject:'provider-subject'});
    await rejects('Same social subject cannot bind two users','23505',()=>insert('auth_identities',{user_id:other.id,provider:'google',subject:'provider-subject'}));
    const category=await insert('categories',{slug:'design',name:'Design'});
    const instructor=await insert('instructors',{name:'Instructor'});
    const media=await insert('media_assets',{uploaded_by:user.id,kind:'video',object_key:'test/lesson.mp4',mime_type:'video/mp4',byte_size:1000,checksum_sha256:'0'.repeat(64),status:'ready',duration_seconds:120});
    const course=await insert('courses',{slug:'design-course',title:'Design',category_id:category.id,instructor_id:instructor.id,access_type:'subscription'});
    const course2=await insert('courses',{slug:'another-course',title:'Another',category_id:category.id,instructor_id:instructor.id,access_type:'free'});
    const version=await insert('course_versions',{course_id:course.id,version:1,title_snapshot:'Design'});
    const otherVersion=await insert('course_versions',{course_id:course2.id,version:1,title_snapshot:'Another'});
    await rejects('Published pointer cannot reference another course','23503',()=>db.query('UPDATE courses SET published_version_id=$1 WHERE id=$2',[otherVersion.id,course.id]));
    const chapter=await insert('chapters',{course_version_id:version.id,title:'Chapter',sort_order:0});
    await rejects('Chapter positions are unique per version','23505',()=>insert('chapters',{course_version_id:version.id,title:'Duplicate',sort_order:0}));
    const lesson=await insert('lessons',{course_version_id:version.id,chapter_id:chapter.id,title:'Lesson',sort_order:0,media_asset_id:media.id,duration_seconds:120});
    await rejects('A lesson must belong to its chapter version','23503',()=>insert('lessons',{course_version_id:otherVersion.id,chapter_id:chapter.id,title:'Wrong version',sort_order:1,media_asset_id:media.id,duration_seconds:120}));
    await rejects('Non-positive duration rejected','23514',()=>insert('lessons',{course_version_id:version.id,chapter_id:chapter.id,title:'Zero duration',sort_order:1,media_asset_id:media.id,duration_seconds:0}));
    const enrollment=await insert('enrollments',{user_id:user.id,course_id:course.id,course_version_id:version.id});
    await rejects('Enrollment cannot point to another course version','23503',()=>insert('enrollments',{user_id:other.id,course_id:course.id,course_version_id:otherVersion.id}));
    await rejects('Duplicate user enrollment per version rejected','23505',()=>insert('enrollments',{user_id:user.id,course_id:course.id,course_version_id:version.id}));
    await rejects('Progress beyond 100 percent rejected','23514',()=>db.query('UPDATE enrollments SET progress_percent=101 WHERE id=$1',[enrollment.id]));
    await rejects('Incomplete course cannot be marked completed by schema update','23514',()=>db.query('UPDATE enrollments SET completed_at=now() WHERE id=$1',[enrollment.id]));
    await rejects('Lesson progress cannot use another user enrollment','23503',()=>insert('lesson_progress',{user_id:other.id,lesson_id:lesson.id,course_version_id:version.id,enrollment_id:enrollment.id}));
    await insert('lesson_progress',{user_id:user.id,lesson_id:lesson.id,course_version_id:version.id,enrollment_id:enrollment.id,last_position_seconds:15,watched_seconds:15});
    await insert('bookmarks',{user_id:user.id,course_id:course.id});
    await rejects('Duplicate bookmark cannot be inserted','23505',()=>insert('bookmarks',{user_id:user.id,course_id:course.id}));
    const plan=await insert('plans',{code:'basic',name:'Basic'});
    const product=await insert('billing_products',{plan_id:plan.id,provider:'google',environment:'sandbox',external_product_id:'salford.basic',interval_unit:'month'});
    await rejects('Negative monetary amount rejected','23514',()=>insert('billing_products',{plan_id:plan.id,provider:'google',environment:'sandbox',external_product_id:'bad-price',interval_unit:'month',amount_minor:-1}));
    await rejects('Verification provider must match product provider','23503',()=>insert('purchase_verifications',{user_id:user.id,billing_product_id:product.id,provider:'apple',environment:'sandbox',evidence_hash:'wrong-provider'}));
    await insert('purchase_verifications',{user_id:user.id,billing_product_id:product.id,provider:'google',environment:'sandbox',evidence_hash:'unique-evidence'});
    await rejects('One purchase evidence cannot bind two accounts','23505',()=>insert('purchase_verifications',{user_id:other.id,billing_product_id:product.id,provider:'google',environment:'sandbox',evidence_hash:'unique-evidence'}));
    await insert('webhook_events',{provider:'google',environment:'sandbox',external_event_id:'event-1',payload_ciphertext:'test-ciphertext'});
    await rejects('Duplicate provider webhook identity rejected','23505',()=>insert('webhook_events',{provider:'google',environment:'sandbox',external_event_id:'event-1',payload_ciphertext:'test-ciphertext'}));
    const session=await insert('playback_sessions',{user_id:user.id,enrollment_id:enrollment.id,course_version_id:version.id,lesson_id:lesson.id,expires_at:new Date(Date.now()+300000).toISOString()});
    await insert('playback_events',{event_id:'4e58c665-dbe4-4c56-b00b-aa4d4c2d25ca',playback_session_id:session.id,sequence:1,kind:'heartbeat',position_seconds:15,playback_rate:1,payload_hash:'hash'});
    await rejects('Duplicate playback sequence rejected','23505',()=>insert('playback_events',{event_id:'9e58c665-dbe4-4c56-b00b-aa4d4c2d25ca',playback_session_id:session.id,sequence:1,kind:'ended',position_seconds:120,playback_rate:1,payload_hash:'other-hash'}));
    await insert('certificates',{enrollment_id:enrollment.id,public_code:'a'.repeat(32),learner_name_snapshot:'Test Learner',course_title_snapshot:'Design'});
    await rejects('Certificate issuance is unique per enrollment','23505',()=>insert('certificates',{enrollment_id:enrollment.id,public_code:'b'.repeat(32),learner_name_snapshot:'Test Learner',course_title_snapshot:'Design'}));
    const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row=>row.table_name);
    const report={checkedAt:new Date().toISOString(),operations:operations.length,paths:Object.keys(spec.paths).length,models:Object.keys(spec.components.schemas).length,tables:tables.length,frames:manifest.length,panels:map.panels.length,checks:passed.length,passed,limits:['No HTTP backend or provider integration implemented','PGlite is embedded PostgreSQL; no production database deployment or concurrency/load test','Constraints do not replace service authorization, receipt verification or completion logic']};
    fs.writeFileSync(path.join(root,'design-validation.json'),JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(root,'docs','validation.md'),`# التحقق من التصميم\n\nتاريخ التحقق: ${report.checkedAt}\n\n- OpenAPI: **${report.operations} عملية، ${report.paths} مسارًا، ${report.models} نموذج بيانات**. نجح فحص Swagger Parser للعقد والمراجع.\n- SQL: إنشاء **${report.tables} جدولًا** بنجاح في PostgreSQL مدمج مؤقت عبر PGlite.\n- خريطة الفرونت إند: **${report.frames} شاشة و${report.panels} لوحات** تطابق manifest وتعريف Panel الفعليين.\n- **${report.checks} فحصًا نجح**. التفاصيل الآلية في \`design-validation.json\`.\n\n## ما اختُبر\n\n${passed.map(name=>`- ${name}`).join('\n')}\n\n## الحدود\n\nهذه فحوص تصميم وعقد وقيود بيانات، وليست اختبارات HTTP لسيرفر منفذ. لم تُختبر مصادقة فعلية أو شراء أو رفع فيديو أو push أو صدور شهادة من خدمة حقيقية. لم تُختبر معاملات متعددة الاتصالات أو load/production PostgreSQL. أنشأ fixture سجل شهادة لاختبار uniqueness فقط؛ تحقق أهلية إصدارها مسؤولية service قبل INSERT. لا يعني نجاح العقد أن كل قواعد الأمان أو العمل أصبحت مطبقة.\n\nهذه فحوص مرجع التصميم؛ اختبارات الفرونت إند تخص العرض المحلي، وليست دليلًا على ربطه بالباك إند. راجع docs/reorganization.md في جذر المشروع لنتائج إعادة التنظيم اللاحقة.\n`);
    console.log(JSON.stringify({operations:report.operations,tables:report.tables,checks:report.checks,frames:report.frames,panels:report.panels}));
  } finally {await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
