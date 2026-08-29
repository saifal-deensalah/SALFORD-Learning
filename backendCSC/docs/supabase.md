# قاعدة Supabase والاتصال الفعلي

> **مرجع تاريخي، غير مفعّل منذ التحويل المحلي بتاريخ 2026-08-28.** الإعداد الحالي `DB_MODE=embedded` في `.env`، وقاعدة `public` داخل `.local/local-app/postgres`. حُفظت إعدادات Supabase خارج المشروع ولم يُتصل بالسحابة أثناء التحويل. لا تنفذ تعليمات استعادة الاتصال أدناه في الوضع المحلي. الدليل الحالي: [التشغيل المحلي](../../docs/local-run.md).

المشروع: **cscDatabase** (`izegpnsfoxoetsknisbq`)، PostgreSQL 17، مساحة الجداول **csc**.
الموبايل يتصل بـNestJS فقط. تسجيل الدخول وSign up والجلسات والصلاحيات تبقى لدى الباك إند، وبياناتها في `csc.users` و`csc.auth_sessions`؛ لا يوجد نظام حسابات ثانٍ في Supabase Auth.

## الوضع الحالي

- أُنشئت 36 جدولًا، تشمل الحسابات والجلسات والمحتوى والخطط والاشتراكات والدفع الوهمي والتعلّم والشهادات والإشعارات والمهام والسجلات.
- نُقل 134 سجلًا من القاعدة المحلية، مع مطابقة أعداد الصفوف قبل إتمام المعاملة. بقيت القاعدة الأصلية ونسخة JSON خاصة داخل `.local/` احتياطًا.
- أُلغيت جلسات الدخول المنقولة؛ يجب تسجيل الدخول مجددًا. الحسابات وكلمات مرورها والمحتوى والتقدم لم تُغيّر.
- `csc_backend` حساب اتصال خاص بالسيرفر، لا يملك إنشاء الجداول أو الأدوار ولا يتجاوز RLS. جميع الجداول محمية، و`anon` و`authenticated` و`service_role` لا تملك دخول مساحة `csc`.
- سياسات RLS تسمح لحساب السيرفر الموثوق فقط؛ عزل بيانات الطلاب وصلاحيات الأدمن ينفذه NestJS. ليست هذه سياسات وصول مباشر للموبايل.
- الاتصال عبر Session pooler مع TLS والتحقق من الشهادة واسم المضيف، وpool من 5 اتصالات.
- لم تُغيّر كلمة مرور `postgres` أو إعدادات حساب Supabase.

## التشغيل من جذر المشروع

```powershell
npm run build:backend
npm run start:backend
```

وفي terminal آخر، إذا لم يكن Metro شغّالًا:

```powershell
npm run start:frontend
```

ثم شغّل التطبيق من الجذر بـ:

```powershell
npm run android -- --active-arch-only --no-packager
```

لا تشغّل `npx react-native run-android` من الجذر؛ React Native CLI وتبعياته موجودة داخل `frontend`.

## الإعدادات والأسرار

`backendCSC/.env.local` يحتوي اتصال Supabase الخاص ويقرأه السيرفر تلقائيًا. **لا تنسخه إلى frontend ولا تنشره.**

أولوية التحميل: بيئة العملية ثم `.env` ثم `.env.local`؛ المتغير الموجود لا يُستبدل. لا تنسخ أمثلة إعداد قاعدة embedded إلى `.env` فوق إعداد Supabase. الاتصال PostgreSQL مباشر؛ لا يحتاج anon أو service_role.

```dotenv
DB_MODE=postgres
DATABASE_SCHEMA=csc
DATABASE_SSL=true
DATABASE_POOL_MAX=5
DATABASE_URL=postgresql://csc_backend.PROJECT_REF:PASSWORD@SESSION_POOLER_HOST:5432/postgres
DATABASE_CA_FILE=/absolute/path/to/supabase-ca.crt
```

المفاتيح وكلمة مرور حساب الاتصال والنسخ الاحتياطية في `.local/` مستثناة من Git. تغيير `APP_SECRET` دون خطة نقل يبطل الجلسات والبيانات المشفرة؛ بقي السر الحالي كما هو.

شهادة CA نُزلت عبر HTTPS من [مصدر Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)، وبصمة SHA-256:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
انظر [التحقق الكامل من TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## تغييرات الجداول

المهاجرات المنشورة موجودة في `supabase/migrations/`، وأرقامها مطابقة لسجل Supabase. لا تشغّل `npm run migrate` بحساب التطبيق على `csc`: الصلاحيات محدودة عمدًا. انشر المهاجرات بأداة Supabase أو بحساب نشر منفصل.

`scripts/build-supabase-migration.mjs` أنشأ المخطط الأول من `database/001..005`. لا تعِد إنشاء أو تطبيق المهاجرة الأولى على المشروع الحالي. `scripts/transfer-to-supabase.mjs` للنقل الأول فقط ويرفض الكتابة فوق جداول غير فارغة.

الاختبارات الآلية تفرض قاعدة embedded معزولة، حتى مع وجود `.env.local` لاتصال Supabase؛ لا تمس قاعدة السحابة.

## حدود البيئة

- هذه قاعدة سحابية مع باك إند تطوير محلي، وليست نشر إنتاج كاملًا.
- الفيديوهات والشهادات في التخزين المحلي الخاص بالسيرفر؛ نُقلت بياناتها وروابطها المرجعية، ولم تُرفع ملفاتها إلى Supabase Storage.
- البريد `MAIL_MODE=local` محفوظ في `.local/mail`. افتح **أحدث** رسالة بعد Resend؛ إعادة الإرسال تبطل الرابط السابق. يلزم SMTP حقيقي لإرسال البريد إلى المستخدمين.
- Google/Apple login غير مهيأين؛ استخدم البريد وكلمة المرور. زر Google لم يعد يفتح حسابًا تجريبيًا أو يمنح جلسة محلية.
- الدفع وهمي فقط. بيانات الاختبار لا تُخزن أو تُرسل للسيرفر.

## الفحص

`npm run check:local` من جذر المشروع يجري قراءة فقط: اتصال القاعدة وschema والحساب وhealth وSwagger ومسح الأسرار، دون تسجيل دخول أو كتابة بيانات اختبار. التقرير `test-results/runtime-smoke.json`.

أداة التسجيل والدفع الآن تتطلب `node scripts/auth-payment-smoke.mjs --sandbox` وسيرفر `scripts/review-server.mjs` المعزول، وتتحقق من هويته قبل الكتابة. التقرير `test-results/auth-payment-sandbox.json`. لا تستهدف Supabase؛ التقرير القديم `auth-payment-cloud.json` تاريخي وليس نتيجة هذه المراجعة. [تشغيل الاختبار المعزول](../../docs/local-run.md).

[المراجعة الحالية](../../docs/final-local-review.md) · [تقرير النقل والفحص السابق](../../docs/supabase-auth-payment-checks.md). لم تُعد المراجعة الحالية إنشاء المخطط أو نقل البيانات أو تعديل RLS.
