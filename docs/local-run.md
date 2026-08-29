# التشغيل المحلي فقط

السيرفر وقاعدة PostgreSQL المدمجة وMetro ولوحة الكمبيوتر تعمل على جهازك. الوضع الفعلي **DB_MODE=embedded**؛ لا يوجد اتصال بـSupabase أو نشر أو tunnel. بعد تثبيت التبعيات والأدوات، يعمل المحتوى التجريبي المحلي دون خدمة قاعدة بيانات خارجية.

## المتطلبات والأوامر

Node.js 22.13+ وnpm، Java17 وAndroid Studio/SDK ومحاكي. افتح `C:\Projects\CSCApp` في VS Code. أوامر التثبيت والتشغيل الدقيقة لكل Terminal في [README](../README.md). `npm run setup` يثبت التطبيقات الثلاثة عبر `npm ci` وlockfile الخاص بكل تطبيق.

| الخدمة | العنوان |
| --- | --- |
| NestJS على الكمبيوتر | `http://127.0.0.1:3000/v1` |
| NestJS من محاكي Android | `http://10.0.2.2:3000/v1` |
| Metro | `http://127.0.0.1:8082` |
| لوحة الكمبيوتر | [Admin](http://127.0.0.1:5173/admin/) |
| Swagger | [API docs](http://127.0.0.1:3000/docs/) |
| الجاهزية | [ready](http://127.0.0.1:3000/v1/health/ready) |

الأصل المشترك للمنافذ هو `frontend/src/services/local-config.json`. `api.ts` يختار `10.0.2.2` للمحاكي و`127.0.0.1` لـiOS؛ Vite يستخدم `/v1` مع proxy محلي. backend يقرأ نفس المنفذ افتراضيًا مع بقاء overrides البيئة. لا تضع8082 مكان منفذ API، ولا توافق على منفذ بديل تلقائيًا. أعد تشغيل الخدمات بعد تغيير الإعداد المشترك.

backend وMetro وVite مربوطون بـ`127.0.0.1`، وليس `0.0.0.0`. المتصفح وAndroid Emulator يصلان إليهم محليًا. `Ctrl+C` يوقف كل خدمة من Terminal الخاص بها. لا تحذف البيانات أو lockfiles لحل تعارض المنافذ؛ افحص الخدمة القائمة أولًا.

## الإعدادات والأسرار والتخزين

`backendCSC/src/core.ts` يقرأ `.env` ثم `.env.local` باستخدام `process.loadEnvFile`، دون استبدال الموجود. الأولوية: **بيئة العملية > .env > .env.local**. الوضع المحلي الفعلي مضبوط في `backendCSC/.env`:

```dotenv
NODE_ENV=development
DB_MODE=embedded
DATABASE_URL=
DATABASE_SCHEMA=public
HOST=127.0.0.1
DATA_DIR=C:/Projects/CSCApp/backendCSC/.local/local-app
MAIL_MODE=local
STORAGE_MODE=local
REDIS_URL=
IN_PROCESS_WORKER=true
```

لا توجد أسرار Supabase في الملفات المحمّلة؛ `.env.local` يحتوي تعليقات فقط. أزل أي override قديم في Terminal أو إعدادات تشغيل VS Code قبل التشغيل؛ متغيرات العملية أعلى أولوية. لا تنسخ `.env.example` فوق ملفاتك. استخدم مسارًا مطلقًا لـDATA_DIR؛ المسار النسبي يُفسر نسبة إلى مجلد عمل العملية.

| البيانات | المسار داخل backendCSC |
| --- | --- |
| قاعدة PGlite الحالية | `.local/local-app/postgres` |
| سر الجلسات والتشفير الدائم | `.local/local-app/secrets.json` |
| حسابا demo بكلمة مرور عشوائية | `.local/local-app/demo-accounts.json` |
| البريد المحلي، عند إنشاء رسالة | `.local/local-app/mail` |
| الصور والفيديو والشهادات | `.local/local-app/storage` |
| قفل التشغيل، أثناء فتح القاعدة فقط | `.local/local-app/postgres.lock` |

PGlite تشغّل PostgreSQL داخل عملية Node.js؛ لا تحتاج PostgreSQL/Docker/Redis منفصلة ولا تفتح منفذ5432. الافتراضي في الكود إن غاب DATA_DIR هو `.local/postgres`، لكن الإعداد الحالي اختار المجلد الجديد أعلاه حفاظًا على القاعدة القديمة. **لم تُنسخ بيانات Supabase ولا بيانات القاعدة القديمة**؛ المحتوى الحالي من ملفات demo المرفقة بالمشروع. حسابات وجلسات السحابة لا تنتقل؛ أغلق جلسة التطبيق القديمة وسجّل الدخول محليًا.

نُسخت إعدادات Supabase وشهادة TLS إلى مجلد خاص خارج المشروع. مساره في `backendCSC/.local/active-config-backup-path.txt`؛ ACL يسمح بحساب Windows الحالي وSYSTEM فقط. ملفات البيئة و`.local` مستثناة من Git. لا تحتاج anon أو service_role، ولا يجوز نشر ملفات الحسابات أو secrets أو نسخها للواجهات.

### كيف تمت التهيئة؟

`createRuntime` يفتح PGlite في DATA_DIR/postgres ثم يطبق ملفات `backendCSC/database/*.sql` غير المسجلة في `schema_migrations`، في الوضع embedded غير الإنتاجي فقط. اكتملت الملفات الخمسة على **مجلد جديد**. بعدها استُخدم seed الموجود لإنشاء حسابي demo و7دورات/14درسًا من ملفات المشروع، مع معالجة الفيديو محليًا. لا توجد عملية مسح أو استيراد من السحابة.

**لا تحتاج إعادة التهيئة الآن.** على تثبيت محلي جديد فقط، بعد التحقق من embedded ومسار جديد وأثناء توقف API:

```powershell
cd C:\Projects\CSCApp\backendCSC
npm run seed
```

seed لا يُشغّل تلقائيًا عند كل بدء، ولا يعيد ضبط البيانات. السيرفر يطبق المخطط المدمج تلقائيًا؛ لا تشغّل migrate/seed أثناء تشغيله لأن القاعدة تُفتح بعملية واحدة فقط. راجع أي ملفات SQL جديدة قبل تطبيقها على بيانات مهمة. إيقاف السيرفر يغلق القاعدة ويزيل قفل التشغيل فقط؛ لا يحذف البيانات. لا تحذف مجلد postgres أو secrets أو lockfiles كحل للأخطاء؛ تحقق من PID واطلب الموافقة قبل أي إجراء حذف.

## الفحص المحلي الفعلي

**أوقف backend أولًا** حتى لا يتعارض منفذ3000 أو قفل القاعدة، ثم من جذر المشروع:

```powershell
npm run build:backend
npm run check:local
# اختياري: اختبار دخول حسابي demo والصلاحيات والخروج:
npm --prefix backendCSC run check:local -- --demo-auth
```

الفحص يرفض أي وضع قاعدة خارجي أو عنوان استماع غير loopback قبل الاتصال. يقرأ القاعدة الموجودة، يتحقق من اكتمال المخطط، يغلقها ويعيد فتحها لإثبات استمرار البيانات، ويشغّل API الفعلي وhealth/Swagger ثم يغلقه تلقائيًا. لا ينشئ قاعدة ولا يشغّل seed أو العامل. التقرير `backendCSC/test-results/embedded-local.json`، وتقرير خيار demo-auth هو `embedded-local-auth.json`. هذا الخيار يضيف جلسات وعدادات محلية ثم يلغي جلساته؛ لا يغيّر كلمات المرور أو يشتري أو يحذف مستخدمين. لا يشغّل الفحص أي اتصال بـSupabase.

## اختبارات الكتابة المعزولة

`npm test` من الجذر يستخدم PGlite مؤقتة معزولة، حتى بوجود إعداد Supabase، ويختبر API حقيقية عبر HTTP. لا يحتاج موافقة لتعديل بيانات الاختبار المحلية. `npm run check:contract` يقارن العمليات الـ78 بالـhandlers. `npm run check:design` يشغّل26 فحصًا على مرجع التصميم القديم:67عملية/33جدولًا؛ هذه ليست أعداد النظام الحالي.

لاختبار الواجهات والتسجيل والدفع على بيانات آمنة:

1. أوقف backend العادي بـ`Ctrl+C`، وأغلق تطبيق الهاتف/جلسة لوحة الأدمن كي لا يعيدا استعمال جلسة القاعدة الأخرى.
2. ابنِ backend ثم شغّل السيرفر المعزول في Terminal:

```powershell
cd C:\Projects\CSCApp
npm run build:backend
cd backendCSC
node scripts/review-server.mjs
```

3. ينشئ مجلدًا جديدًا تحت `.local/review-sandboxes/` وبيانات demo محلية فقط، على نفس المنفذ3000. حسابا الاختبار فقط: `learner@salford.test` و`admin@salford.test`، وكلمة مرور fixture العامة `Local-review-test-2026!`. **هذه ليست بيانات حسابات Supabase الحالية.**
4. لاختبار التسجيل والتوثيق والدفع تلقائيًا، من Terminal آخر:

```powershell
cd C:\Projects\CSCApp\backendCSC
node scripts/auth-payment-smoke.mjs --sandbox
```

الأداة تتحقق من هوية السيرفر المعزول قبل أي طلب كتابة، وترفض تشغيلها على السيرفر العادي. التقرير `test-results/auth-payment-sandbox.json`. البريد التجريبي داخل مجلد ذلك الاختبار، وليس `.local/mail` العادي.
5. جرّب الموبايل ولوحة الكمبيوتر، ثم اخرج وأغلقهما. أوقف السيرفر المعزول، ثم نفّذ `npm run check:local` من الجذر وبعد انتهائه أعد `npm run start:backend`. لا تفتح عملية ثانية على نفس قاعدة PGlite.

لا تشغّل migrations/seed/أدوات النقل على Supabase الحالية دون موافقة. وجود scripts لها لا يعني أنها مطلوبة للتشغيل.

## البريد والدفع والخدمات الخارجية

البريد `local`: الرسائل JSON في `backendCSC/.local/local-app/mail`. افتح رابط **أحدث** رسالة على الكمبيوتر وأكد الإجراء؛ طلب الرابط بـGET لا يستهلكه. هذا لا يرسل بريدًا حقيقيًا. إعادة الإرسال تبطل الرابط السابق.

الدفع الوهمي في الموبايل فقط؛ استخدم **Fill test payment details**، ولا تدخل بطاقة حقيقية. يرسل التطبيق planId ومفتاح منع التكرار، ولا يرسل بيانات البطاقة. سجل الإدارة للعرض فقط. Google Pay/PayPal وGoogle/Apple login وPush خارج التطبيق غير مفعّلة؛ لا تعطي نجاحًا وهميًا. المتطلبات اللاحقة موضحة في [دليل APIs](api-guide-ar.md).

الصور والفيديو والشهادات على القرص المحلي الخاص بالباك إند. الإنترنت مطلوب لتنزيل التبعيات وأدوات Android أول مرة؛ التشغيل الحالي لا يعتمد على Supabase. يجب أن يبقى backend والكمبيوتر قيد التشغيل لوصول الموبايل؛ هذا ليس تخزينًا مستقلًا داخل الهاتف. لا تدل هذه الإعدادات على اختبار كل شاشة مع تعطيل شبكة الجهاز.

## هاتف Android حقيقي عبر USB

لم يُختبر على هاتف فعلي. فعّل USB debugging على جهاز موثوق، وخذ معرفه من `adb devices`:

```powershell
adb -s YOUR_DEVICE_ID reverse tcp:3000 tcp:3000
adb -s YOUR_DEVICE_ID reverse tcp:8082 tcp:8082
```

لجلسة USB غيّر فرع Android في `frontend/src/services/api.ts` من `10.0.2.2` إلى `127.0.0.1` وأعد تحميل التطبيق، وأعده للمحاكي لاحقًا. المنفذ يظل من `local-config.json`. إن احتاجت إعدادات مطور React Native عنوان Metro، استخدم `127.0.0.1:8082`. لا حاجة لفتح الشبكة أو جدار الحماية. `10.0.2.2` عنوان خاص بالمحاكي وليس الهاتف الحقيقي.

