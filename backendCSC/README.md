# backendCSC — SALFORD API

السيرفر الوحيد للمشروع: **NestJS + TypeScript + PostgreSQL مدمجة عبر PGlite**، مع78 عملية JSON موثقة في `contracts/openapi.json`. الحسابات والجلسات في schema `public` محليًا. اتصال Supabase السابق غير مفعّل. الموبايل ولوحة الكمبيوتر يتصلان بهذا السيرفر فقط.

## التشغيل الحالي

من Terminal داخل VS Code:

```powershell
cd C:\Projects\CSCApp\backendCSC
npm run build
npm start
```

للإيقاف `Ctrl+C`. التطوير دون بناء مسبق: `npm run dev` (ليس watcher). من الجذر توجد aliases موثقة في [README](../README.md). لا تشغّل عمليتين على3000.

- API: `http://127.0.0.1:3000/v1`، [Swagger](http://127.0.0.1:3000/docs/)، [Health](http://127.0.0.1:3000/v1/health/ready).
- المنفذ الافتراضي من `../frontend/src/services/local-config.json`؛ HOST يبقى loopback.
- الوضع الحالي `DB_MODE=embedded` في `.env`، و`.env.local` بلا اتصال خارجي. الأولوية: بيئة العملية ثم `.env` ثم `.env.local`، دون استبدال الموجود.
- لا تعدّل ملفات الأسرار أو تشغّل migrate/seed/transfer على Supabase الحالية.
- لوحة الكمبيوتر تعمل منفصلة على5173؛ `/admin/` على هذا السيرفر يعيد404. `/v1/admin/*` يخدم الموبايل والكمبيوتر بصلاحية admin.
- قاعدة البيانات في `.local/local-app/postgres/`؛ تشغيل السيرفر ينشئ مخطط القاعدة المدمجة ويطبق الملفات الناقصة من `database/` فقط. التهيئة الحالية تمت على مجلد جديد، ولم تمس `.local/postgres` القديمة.
- حسابات التطوير الخاصة في `.local/local-app/demo-accounts.json`؛ لا تطبع الملف أو تنشره. `npm run seed` يضيف بيانات demo محلية عند التهيئة فقط؛ أوقف API أولًا وتحقق من البيئة. لا تحتاج تشغيله الآن.
- البريد محفوظ محليًا في `.local/local-app/mail/`؛ لا يخرج بريد إلى المستخدم. افتح رابط أحدث رسالة على الكمبيوتر وأكد الإجراء.
- الصور والفيديو والشهادات في `.local/local-app/storage/`؛ لا تعرض هذا المجلد كـstatic hosting.
- العامل يبدأ مع السيرفر المحلي لمعالجة البريد/الفيديو/PDF والمهام القائمة. لا يلزم تشغيل `npm run worker` معه.

## الوظائف والحالة

| المجال | الحالة الفعلية |
| --- | --- |
| Auth | بريد/كلمة مرور، Argon2id، access JWT، refresh rotation/replay، logout/all، تحقق البريد واستعادة كلمة المرور |
| Profile | الاسم والتفضيلات من API؛ تغيير البريد وحذف الحساب موجودان في API دون شاشة موبايل مستقلة لهما |
| Catalog | Home والبحث والفلاتر والصفحات والتفاصيل والمنهج والمحفوظات وتسجيل الدورات |
| Learning | تقدم مرتبط بملكية التسجيل ونسخة المنهج، جلسات HLS وروابط مؤقتة، منع إكمال الدرس بمجرد seek/onEnd |
| Media | رفع أدمن مقيد بالنوع والحجم وchecksum؛ معالجة FFmpeg وملفات خاصة |
| Billing | **دفع وهمي فقط** من الموبايل؛ تسعير من السيرفر ومنع تكرار، سجل عرض للأدمن؛ الدفع الحقيقي/webhooks مرفوضة409 |
| Certificates | PDF بعد إكمال الدروس المطلوبة؛ تحميل خاص، والتحقق العام يحتاج opt-in |
| Notifications | Inbox وحالة القراءة من DB؛ Push الخارجي وتكامله الأصلي بالموبايل غير مفعّلين |
| Admin | إدارة المحتوى والطلاب والخطط والملفات وسجل النشاط؛ التحقق من الدور في backend |
| External providers | Google login متكامل أصلياً على Android ويحتاج OAuth Client IDs من مالك المشروع؛ Apple يحتاج تكاملاً وإعداداً. لا جلسة اجتماعية وهمية. SMTP وS3 وFCM خيارات غير مفعّلة محليًا |

الدورات الحالية مواد demo:7دورات ودرسان لكل دورة بفيديو تجريبي18ثانية، وليست مناهج فعلية. وجود مكتبات دفع خارجي في dependencies لا يفعّلها؛ الوضع العادي لا يقبل سوى الدفع الوهمي. اختبارات provider-test تستخدم verifier مصطنعًا في قاعدة الاختبار ولا تثبت نجاح مزود خارجي.

## الاختبارات الآمنة

من هذا المجلد:

```powershell
npm run typecheck
npm test
npm run build
npm run check:contract
npm run check:local
```

- `npm test`:31 اختبارًا حاليًا، منها HTTP على قاعدة PGlite معزولة، وتجربة78عملية بعقدها بما فيها الرفض المتوقع. ليست تغطية نجاح لكل خدمة خارجية.
- `check:local`: أوقف السيرفر أولًا؛ يبدأ API من البيئة الفعلية ثم يغلقه تلقائيًا. يفحص التخزين المحلي وloopback وhealth/Swagger والأسرار، ويرفض الاتصال الخارجي. `npm run check:local -- --demo-auth` يضيف اختبار دخول demo والصلاحيات والخروج، ويكتب جلساته المحلية فقط. التقرير `test-results/embedded-local.json`.
- واجهات الموبايل/المتصفح والكتابة التجريبية: [طريقة تشغيل السيرفر المعزول](../docs/local-run.md). `node scripts/auth-payment-smoke.mjs --sandbox` يرفض السيرفر العادي قبل أي كتابة.
- `npm audit --omit=dev` لفحص تبعيات السيرفر. لا تستخدم audit fix --force دون مراجعة التوافق.
- نتائج التحويل الحالي في [تقرير القاعدة المحلية](../docs/embedded-local-check.md) وملفات `test-results/embedded-*.json`. [المراجعة السابقة](../docs/final-local-review.md) و`runtime-smoke.json` يوثقان إعداد Supabase السابق، وليسا فحص الاتصال الحالي.

## هيكلة الملفات

`src/app.ts` يربط العقد بالـcontrollers والتحقق والصلاحيات، `core.ts` للإعدادات/SQL والمعاملات، `auth.ts` للحساب، `catalog.ts` للمحتوى، `learning.ts` للمشاهدة، `media.ts` للملفات، `billing.ts` للاشتراكات والدفع، `notifications.ts` للإشعارات والشهادات، `jobs.ts` للعامل، و`account-pages.ts` لنماذج البريد المحلية. `database/` و`supabase/migrations/` سجل المخطط القائم؛ لا تنفذها على السحابة أثناء الفحص.

الاستعلامات تستخدم معاملات SQL وparameter binding، ومعرف الطالب من JWT. عزل الطلاب يفرضه NestJS؛ القاعدة المدمجة داخل عملية السيرفر، بلا منفذ PostgreSQL أو Supabase Data API. سياسات RLS السحابية السابقة لم تتغير، ولا تحتاج البيئة المحلية anon/service_role.

## حدود التشغيل

الجلسات في ذاكرة العملاء فقط. إعدادات Docker/Redis/S3/SMTP موجودة كخيارات في التوثيق السابق، ولم تُشغّل في هذه المراجعة ولا تلزم السيناريو المحلي الحالي. حافظ على `.local` و`APP_SECRET` والنسخ الاحتياطية؛ تغيير السر بلا خطة يؤثر في البيانات المشفرة. لا تحذف القاعدة لحل مشكلة قفل، ولا تنشر ملفات البيئة.

[Supabase](docs/supabase.md) · [الدفع الوهمي](docs/demo-payment.md) · [API واللغات](../docs/api-guide-ar.md)

## سياسة التسجيل المحلية

`LOCAL_EMAIL_AUTH=true` مخصص لـdevelopment + embedded + loopback فقط، ويُرفض في production. الإعداد في `.env` له الأولوية على `.env.local`؛ أعد بناء backend وإعادة تشغيله لتطبيق التعديل. لا تحتاج تغيير إعدادات Supabase.

`POST /v1/auth/register` يرجع202 و`emailVerificationRequired=false` بعد إنشاء حساب حقيقي بدون email outbox. ينفّذ الموبايل بعدها login بكلمة السر. الإيميل المكرر محليًا يعيد409 `EMAIL_ALREADY_REGISTERED`. الحسابات القديمة غير المفعلة لا تُعدّل، ويظل التحقق من Argon2id وحالة active والجلسات والأدوار مفروضًا. عند غياب الإعداد أو false، يبقى سلوك البريد الأصلي كما هو.

اختبار فعلي اختياري للقاعدة المحلية الحالية من جذر CSCApp، **بعد إيقاف backend بـCtrl+C**:

```powershell
npm run build:backend
npm --prefix backendCSC run check:local-auth
npm run start:backend
```

الفحص يرفض قاعدة خارجية، ولا يشغّل migrations أو seed أو worker. ينشئ حسابي اختبار محليين مخصصين ويتركهما، ويختبر HTTP على البورت الفعلي وإعادة تشغيل عملية backend واستمرار الحساب ثم يوقف عملياته. بيانات الاختبار الخاصة وتقريره تحت `.local/auth-review/<id>/` المستبعد من Git. لا تطبع أو تنشر `accounts.json`. لا تشغّله إذا كنت لا تريد إضافة حسابات اختبار. [حالة الاختبارات الفعلية](../docs/local-auth-review.md).
