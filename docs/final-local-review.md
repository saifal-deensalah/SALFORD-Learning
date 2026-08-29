# المراجعة النهائية للاستخدام المحلي — 28 أغسطس 2026

## النطاق وحفظ الملفات

المراجعة شملت frontend وbackendCSC وadmin-dashboard وعقد API والتوثيق والتبعيات. لا توجد .git في نسخة الجذر أو التطبيقات الثلاثة؛ فشل git status بسبب غياب المستودع، وليس لأن التعديلات نظيفة. لم أستخدم reset أو أحذف ملفات للتنظيف. حُفظت100 نسخة مصدر/إعداد/توثيق مع بصمات SHA-256 قبل الإصلاحات في `backendCSC/.local/review-backup-1787912772655`. قائمة الفروق المتاحة في `backendCSC/test-results/review-file-changes.json`.

لم أغيّر .env.local أو كلمات المرور أو APP_SECRET أو جداول/سياسات Supabase، ولم أشغّل عليها migrations/seed أو أنشئ مستخدم اختبار فيها. كل التسجيلات والدفعات والتعديلات التفاعلية حدثت في قواعد PGlite محلية منفصلة تحت .local/review-sandboxes. بعض التقارير القديمة في docs وtest-results تاريخية ولا تمثل هذه المراجعة.

## الإصلاحات

| التغيير | الملفات الرئيسية |
| --- | --- |
| مصدر عام واحد لمنافذ API3000 وMetro8082 والأدمن5173، وربط الخدمات بـloopback | frontend/src/services/local-config.json، frontend/scripts/native.cjs، frontend/metro.config.js، frontend/package.json، backendCSC/src/core.ts، admin-dashboard/vite.config.ts، package.json |
| حماية جلسة لوحة الكمبيوتر من استجابة قديمة بعد الخروج، refresh مشترك، وعدم مسح الجلسة لمجرد انقطاع الشبكة، وفحص شكل الرد | admin-dashboard/src/api.ts، backendCSC/test/api.test.ts |
| إعادة ضبط pagination عند تغيير البحث/التصفية/المراجعة | admin-dashboard/src/ui.tsx |
| تحويل روابط الوسائط المحلية فقط، وترك الروابط الخارجية الموقعة كما هي | frontend/src/services/api.ts، admin-dashboard/src/api.ts، frontend/__tests__/api.test.ts |
| حالة تحميل واضحة للدخول والتسجيل، ورسائل صريحة بأن البريد محلي | frontend/src/App.tsx، frontend/src/panels/LearningPanels.tsx، frontend/src/learning/StudentApp.tsx |
| جرس الإشعارات داخل مسار الاشتراك يفتح Inbox الحقيقي بدل لوحة العرض المحلية | frontend/src/App.tsx، frontend/src/learning/StudentApp.tsx، frontend/__tests__/App.test.tsx |
| إصلاح فقد تقدم مشاهدة بسبب تفاوت وصول heartbeat: رصيد زمني مكتسب محدود، لا يمنح وقتًا من الجهاز أو بسبب هامش التفاوت | backendCSC/src/learning.ts، backendCSC/test/api.test.ts |
| جعل check:local قراءة فقط؛ الأداة القديمة كانت تكتب جلسات/rate limits | backendCSC/scripts/smoke.mjs |
| سيرفر QA معزول وفحص هوية يمنع أداة التسجيل/الدفع من استهداف السيرفر العادي | backendCSC/scripts/review-server.mjs، backendCSC/scripts/auth-payment-smoke.mjs |
| عدم نسخ مثال embedded فوق Supabase، وتوثيق أولوية البيئة، واستثناء ملفاتها | backendCSC/.env.example، ملفات .gitignore للتطبيقات |
| إعادة تشغيل لوحة الكمبيوتر الموجودة عبر Vite دون إزالة إدارة الموبايل أو إضافة دفع للأدمن | package.json، admin-dashboard/tsconfig.json، admin-dashboard/README.md |
| أدلة تشغيل مطابقة للأوامر والأدوار والخدمات الحالية | README.md، docs/local-run.md، docs/api-guide-ar.md، READMEs التطبيقات، backendCSC/docs/supabase.md، frontend-connection.md، verification.md |

## الميزات وتتبّع الربط

**مكتملة ومختبرة** هنا تعني الأدلة المحددة في العمود الأخير، وليست ادعاء تجربة كل زر على كل جهاز أو نجاح خدمات خارجية. اختبارات API استخدمت HTTP وقاعدة فعلية معزولة، واختبارات React تستخدم mocks للشبكة.

| الميزة | مسار الواجهة → API → البيانات | الحالة والدليل |
| --- | --- | --- |
| Splash/Onboarding ومعرض Figma | واجهة محلية؛18إطارًا | مكتملة ومختبرة بالـrenderer؛ المعرض mock مقصود ولا يمنح جلسة |
| الدخول والخروج | Login → /auth/login، /auth/logout → users/auth_sessions | مكتملة ومختبرة API وReact؛ دخول طالب على Android وأدمن بالمتصفح؛ الخروج بالمتصفح |
| التسجيل والتحقق من البريد | Sign up/Profile → /auth/register، email verification → users/tokens/outbox | مكتملة ومختبرة API وReact؛ رسالة JSON محلية، لا بريد خارجي |
| استعادة كلمة السر | Forgot password → reset-requests/reset + /auth/action | مكتملة ومختبرة API، رابط أحادي الاستخدام وإبطال الجلسات؛ ليست تجربة SMTP |
| refresh والجلسات | عميل كل واجهة → /auth/refresh | مكتملة ومختبرة rotation/replay والخروج أثناء طلب سابق؛ الذاكرة فقط |
| صلاحيات الأدمن وعزل الطلاب | الدور في JWT → حارس backend وكل استعلام ملكية | مكتملة ومختبرة401/403/404، منع ترقية الدور بالتسجيل والوصول لتسجيل/شهادة/إشعار غير مملوك |
| Home والبحث والتصنيفات والتفاصيل | /home، /courses، /categories، curriculum → courses/versions/chapters/lessons | مكتملة ومختبرة API وReact؛ Home والتفاصيل على Android؛ بيانات فعلية من السيرفر |
| التسجيل في الدورة ومكتبتي | enrollments، /me/courses، /me/history | مكتملة ومختبرة API وAndroid؛ شراء الخطة يمنح وصولًا، والتسجيل في الدورة إجراء مستقل |
| المحفوظات | PUT/DELETE /me/bookmarks/{id} | مكتملة ومختبرة API وAndroid، وحماية الملكية/التكرار |
| الملف والإعدادات | GET/PATCH /me و/me/settings | مكتملة ومختبرة API وReact؛ عرض الملف على Android |
| تغيير البريد/حذف الحساب/الخروج من كل الجلسات | APIs حساب موجودة دون واجهات موبايل مستقلة | مكتملة ومختبرة كـAPI؛ لا أدّعي وجود أزرار لها ولم أضف شاشات جديدة |
| الخطط والدفع الوهمي | Profile → plans/checkout → /billing/demo-purchases → demo_payments/subscriptions | مكتملة ومختبرة API وReact وAndroid: شاشة نجاح ثم My courses، وظهور الدفعة نفسها في لوحة الكمبيوتر |
| منع تكرار الدفع والتحقق من البريد/السعر | Idempotency-Key + server plan price | مكتملة ومختبرة: زائر401، بريد غير موثق403، نجاح201، وعدم إنشاء اشتراك ثانٍ بالتكرار؛ لا إرسال بيانات بطاقة |
| الفيديو والتقدم والاستكمال | playback-sessions/events → playback_events/lesson_progress | مكتملة ومختبرة API وReact؛ بعد إصلاح تفاوت التوقيت شاهدت الدرسين على Android:50% بعد الأول ثم100% وCompleted بعد الثاني |
| الشهادات | استيفاء المنهج → outbox/PDF → /me/certificates/download | مكتملة ومختبرة API وتحقق ترويسة PDF والملكية وopt-in؛ بعد إكمال الدورة على Android ظهرت الشهادة issued؛ تنزيل/عرض PDF على الجهاز يحتاج تجربة يدوية |
| الإشعارات داخل التطبيق | /me/notifications و/read → notifications | مكتملة ومختبرة API وReact؛ القائمة الفارغة على Android؛ الجرس في الاشتراك متصل بالـAPI |
| لوحة الكمبيوتر | صفحات React → /admin/* → المحتوى/الطلاب/الخطط/audit_logs | مكتملة ومختبرة: دخول خاطئ/صحيح، تحميل/فراغ/انقطاع، قوائم، حفظ/إعادة فتح مسودة، سجل نشاط، سجل دفعة Android، خروج |
| إدارة الموبايل | frontend/src/admin → نفس /admin/* | مكتملة ومختبرة React وAPI؛ لم تُجرّب جميع عمليات تحرير الأدمن على المحاكي في هذه الجولة |
| رفع الملفات ومعالجتها | upload-session → PUT موقع → complete → media_assets/jobs | مكتملة ومختبرة HTTP للنوع والحجم والتوقيع/checksum والمعالجة؛ اختيار/رفع ملف من جهاز حقيقي غير مختبر |
| Google/Apple login | مسارات موجودة لكنها تتطلب إعدادًا وتكاملًا أصليًا | اختيارية غير مفعّلة؛ لا جلسة demo بديلة؛ يلزم إعداد المزود وSDK/challenge/token واختبار حقيقي |
| Push Notifications | device tokens + FCM/APNs | اختيارية غير مفعّلة؛ يلزم permission/token وتكامل أصلي وإعداد مزود؛ Inbox لا يثبت Push |
| SMTP وS3/Supabase Storage | adapters اختيارية | غير مفعّلة؛ البريد والملفات محليان، ولا حسابات خارجية جديدة |
| الدفع الحقيقي/PayPal/Google Pay/webhooks | مرفوضة في التشغيل العادي | معطلة عمدًا؛ ليست نقصًا للتشغيل المحلي؛ لا دفع حقيقي ولا بوابة ثانية |
| المناهج النهائية والتطابق البصري100% | مواد demo ومعرض Figma | ناقصة كمحتوى نهائي؛7دورات نموذجية بفيديوهات18ثانية، ولم تُثبت مطابقة pixel لكل حالة |
| iOS والهاتف الحقيقي | نفس API، إعداد جهاز منفصل | مكتملة بالكود وغير مختبرة على أجهزة فعلية؛ Windows لا يختبر بناء iOS |

قائمة الـ78عملية كاملة في [دليل API](api-guide-ar.md) والعقد الجاري `backendCSC/contracts/openapi.json`. التطوير المحلي لا يحتاج تجاوز بوابة production: دور admin يفرضه backend في كل الأوضاع، وADMIN_API_ENABLED/X-Admin-Key إضافيان في production فقط. لم أغيّر الحماية لتشغيل المسارات.

## نتائج الاختبارات الفعلية

| الفحص | النتيجة |
| --- | --- |
| npm run typecheck | نجاح التطبيقات الثلاثة؛ وأعيد typecheck للباك إند بعد إصلاح المشاهدة |
| npm run lint |0أخطاء،17تحذيرًا قائمة تخص inline styles/no-void/no-shadow |
| اختبارات frontend |54/54 ناجحة،4مجموعات؛ تشمل التحميل/الفشل/الفراغ وعدم الرجوع إلى mock، والدفع والجلسات والإشعارات |
| اختبارات backend |31/31 ناجحة بعد إصلاح تفاوت توقيت المشاهدة، تشمل HTTP ومعالجة ملفات/PDF |
| npm run check:contract |78/78 لها handlers |
| تغطية HTTP |78/78عملية جرى طلبها؛ بعض النتائج رفض متوقع أو provider-test مصطنع، لا نجاح مزود خارجي |
| npm run build:backend وbuild:admin | ناجحان؛ بناء الأدمن22module |
| Android | build/install نجحا،182task، ثم تشغيل واختبار واجهة فعلية على Pixel8/API35 |
| auth-payment-smoke --sandbox |19فحصًا ناجحًا على القاعدة المحلية المعزولة |
| حاجز منع الكتابة على Supabase | بعد إعادة backend العادي رفضت أداة sandbox هوية السيرفر قبل login أو أي كتابة، كما هو مطلوب |
| check:design |26فحصًا ناجحًا على **مرجع قديم**67عملية/33جدولًا/18إطارًا؛ ليس عقد النظام الحالي |
| npm audit --omit=dev | backend0، admin0؛ frontend8تحذيرات high مرتبطة بتبعية image-size في Metro |
| Supabase Security Advisor | لا lints في الفحص، ولا تغيير سياسات |
| check:local بعد إعادة السيرفر العادي | نجاح:36جدولًا في csc،7دورات،csc_backend،health وSwagger200،مسح90ملفًا دون تطابق أسرار،TLS1.3 وشهادة موثقة إلى Session pooler |

حالات الرفض المختبرة تشمل مدخلات خاطئة، role escalation، جلسة منتهية/معاد استعمالها، بيانات مستخدم آخر، توقيع وسائط مزور، رفع غير صالح، وصول مدفوع غير مستحق، دفع غير موثق وتكرار الطلب. التحميل/الفشل والبيانات الفارغة مختبرة React، واختُبرت واجهة لوحة الكمبيوتر عند إيقاف API وواجهة Android مع retry.

أول اختبار regression جديد لجرس الاشتراك فشل بسبب اختيار testID لشاشة الدفع بدل الخطط؛ صُحح الاختبار ثم نجحت54/54. مشكلة مشاهدة Android كانت في الكود فعلًا وليست فشل اختبار شكلي: فرق وصول~0.7ثانية كان يهدر فترة15ثانية كاملة. الإصلاح لا ينشئ وقت مشاهدة: لا يحتسب أكثر من زمن السيرفر، يحتفظ بحد أقصى ثانيتين مكتسبتين بين heartbeats، ويصفّر الرصيد عند seek/pause/end. اختبار الطلبات السريعة يثبت أنها لا تولّد وقتًا.

## اتصال Supabase وأمان البيانات

الفحص عبر اتصال backend الحالي وSELECT فقط، مع health/live وhealth/ready وSwagger. معلومات التحقق الآمنة: PostgreSQL، schema csc، حساب csc_backend،36جدولًا و7دورات. TLS مع rejectUnauthorized والتحقق من CA؛ لا طباعة للرابط أو كلمة المرور.

تفصيل TLS: socket العميل إلى Supabase Session pooler أثبت encrypted=true وauthorized=true وTLSv1.3. قيمة pg_stat_ssl من PostgreSQL كانت false للاتصال خلف الوسيط؛ هذا ليس قياسًا لاتصال جهازك إلى pooler. Supavisor وسيط بين العميل وقاعدة البيانات وفق [توثيق Supabase](https://supabase.com/docs/guides/troubleshooting/monitor-supavisor-postgres-connections). لذلك صححت فحصي الأول الذي خلط الوصلتين، وأبقيت نتيجة الوصلة الداخلية ظاهرة باسم postgres_side_tls دون تغيير أي إعداد سحابي. لا أدّعي TLS متصلًا بلا إنهاء من جهازك حتى محرك PostgreSQL.

عند التسليم أُوقف تطبيق QA والسيرفر المعزول وأُغلقت جلسة المتصفح الاختبارية، وأُعيد backend العادي إلى Supabase. backend3000 وMetro8082 وVite5173 مربوطون بالـloopback فقط.

فحص كتالوج الصلاحيات أكد RLS وFORCE RLS على36/36جدولًا. أدوار anon/authenticated/service_role لا تملك USAGE على csc؛ حساب csc_backend ليس superuser ولا يملك createdb/createrole/bypassrls. **هذا لا يجعل RLS عزلًا بين طلاب التطبيق**: الدور الموثوق يصل للبيانات، وNestJS يفرض الملكية. لا تستخدم وصول Data API مباشرًا من الواجهات. لم أغيّر سياسة تلقائيًا.

أولوية البيئة بقيت كما كانت: process > .env > .env.local. أُصلحت الأمثلة والتوثيق دون استبدال الإعداد الحالي. فحص تسرب الأسرار يبحث عن الأسرار الحالية في المصادر والإعدادات العامة والمخرجات النصية للواجهتين؛ ليس تدقيقًا جنائيًا لكل ملف binary أو تاريخ Git غير موجود.

## المخاطر وما يحتاج منك

- لا موافقة مطلوبة لمتابعة الاستخدام المحلي العادي. **اختبار تسجيل/دفع/تحرير على Supabase نفسها يحتاج موافقتك**؛ اختبارات الكتابة هنا معزولة. وكذلك أي schema/RLS/migration/حذف بيانات.
- تبعية image-size1.2.1 داخل Metro عليها تحذيرات DoS لمعالجة صيغ صور. npm audit يقترح تغييرًا كبيرًا في حزم React Native؛ لم أطبّق force أو override لواجهة غير متوافقة. Metro محصور بالـloopback؛ لا تعالج assets مجهولة ولا تفتح خادم التطوير للشبكة. هذه مخاطرة قائمة، وليست تقرير أمان نظيفًا.
- الفيديو والملفات والبريد على جهازك؛ حذف .local يفقد ملفات وبيانات تشغيل مهمة. Supabase وحده لا يحتوي الملفات الأصلية.
- حفظ الجلسة في الذاكرة مقصود؛ إغلاق العملية/إعادة تحميل لوحة الأدمن يتطلب الدخول.
- المحاكي كان بطيئًا واحتاج إعادة تشغيل Metro. ظهرت تحذيرات تطوير/Fast Refresh؛ نجاح debug هنا لا يثبت كل جهاز أو حالة lifecycle.
- لم أختبر iOS، هاتفًا فعليًا، جميع نماذج أدمن الموبايل، اختيار الملفات الأصلي أو عرض PDF على الجهاز، أو SMTP/OAuth/Push/S3/دفعًا خارجيًا.
- لا يلزم anon/service_role أو نشر أو حساب مدفوع. لتفعيل خدمات خارجية لاحقًا تحتاج إعداداتها وتكاملاتها واختبارًا مستقلًا.

## قائمة تحقق يدوية قصيرة

يفضل تنفيذ الخطوات التي تكتب بيانات في [السيرفر المعزول](local-run.md)، وليس على Supabase دون موافقة:

1. شغّل backend وMetro وAndroid ولوحة الكمبيوتر في Terminals منفصلة كما في README.
2. جرّب كلمة سر خاطئة ثم صحيحة، والتسجيل وتوثيق أحدث رسالة محلية، ثم reset وتحقق من بطلان الجلسة القديمة.
3. ابحث عن دورة ونتيجة غير موجودة، احفظ دورة وسجّل فيها، وتأكد أن My courses لا تعرض غير المسجّل.
4. اشترِ خطة تجريبية باستخدام Fill test payment details؛ شاهد النجاح وسجلها في الأدمن. لا تدخل بطاقة حقيقية.
5. شاهد درسي دورة كاملة دون seek، ثم أعد الدخول وتأكد من التقدم والشهادة؛ جرّب تنزيل PDF ورفع ملف صغير من أدمن الموبايل.
6. أوقف backend: يجب أن تظهر رسالة خطأ/retry دون نجاح دفع أو بيانات demo بديلة. أعده ثم جرّب الخروج؛ الطالب لا يصل للإدارة.
7. بعد الاختبار أغلق جلسات QA وأوقف السيرفر المعزول، وأعد backend العادي وcheck:local.

## الحكم

**صالح للتجربة والاستخدام المحلي ضمن الميزات المفعّلة، مع الحدود أعلاه؛ ليس مشروعًا مكتملًا100% أو نسخة نشر.** الربط الأساسي والدفع الوهمي والصلاحيات يعملون بأدلة اختبار. الاعتماد النهائي على بيانات Supabase الفعلية يحتاج موافقة على اختبارات الكتابة فيها؛ الاختبار المعزول لا يثبت كل اختلاف محتوى في السحابة. اكتمال المحتوى وتجارب الأجهزة والخدمات الاختيارية وتحذير Metro أمور منفصلة موضحة، ولا أدّعي حلها بالبناء وحده.

