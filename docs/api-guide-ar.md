# دليل ربط API ولغات CSCApp

مرجع لحالة المشروع بتاريخ 2026-08-28. قائمة العمليات أدناه مستخرجة من `backendCSC/contracts/openapi.json` ومراجعة مع كود السيرفر والموبايل. تم تحديث وصف قاعدة البيانات بعد تفعيل الوضع المحلي؛ خريطة HTTP لم تتغير.

## 1. مسار الاتصال

```text
React Native: واجهات الطالب والأدمن
React/Vite: لوحة الكمبيوتر المحلية الاختيارية
    ↓ src/services/api.ts: HTTP + JSON + Bearer JWT
NestJS: التحقق من الجلسة والصلاحيات والمدخلات ومنطق العمل
    ↓ PGlite: PostgreSQL مدمجة داخل عملية Node.js
backendCSC/.local/local-app/postgres / schema public
```

الموبايل يتصل بـNestJS فقط. لا يحتاج Supabase API key أو كلمة مرور قاعدة البيانات. الحسابات والجلسات في جداول التطبيق داخل `public` في القاعدة المحلية. اتصال Supabase السابق غير مفعّل، ولم تُنقل بياناته إلى القاعدة الحالية.

**78 عملية JSON موثقة** لا تعني 78 شاشة ولا أن كل عملية لها زر بالموبايل: بعضها للإدارة أو لفحوص التشغيل، وبعضها تكامل غير مهيأ أو دفع حقيقي معطل. توجد أيضًا مسارات ملفات وصفحات مساعدة خارج هذا العدد.

## 2. العناوين وملفات الربط

| الاستخدام | العنوان الحالي |
| --- | --- |
| API من الكمبيوتر | `http://127.0.0.1:3000/v1` |
| API من محاكي Android المعتاد | `http://10.0.2.2:3000/v1` |
| API من iOS Simulator على نفس جهاز الباك إند | `http://127.0.0.1:3000/v1` |
| Swagger من الكمبيوتر | [فتح Swagger](http://127.0.0.1:3000/docs/) |
| عقد JSON في التطوير | [OpenAPI](http://127.0.0.1:3000/openapi.json) |
| Metro | المنفذ `8082`؛ حزم JavaScript وليس بيانات التطبيق |

`API_ORIGIN` في [api.ts](../frontend/src/services/api.ts) لا يحتوي `/v1`. الدالة `api()` تضيفه تلقائيًا؛ مرّر `/courses` وليس `/v1/courses`.

المنافذ العامة مصدرها `frontend/src/services/local-config.json`؛ لا أسرار فيه. لوحة الكمبيوتر تعمل بـ`npm run start:admin` على `http://127.0.0.1:5173/admin/` وتستخدم proxy `/v1` إلى backend على3000. المسار `/admin/` على3000 غير مستخدم. [أوامر التشغيل والفحص الحالية](local-run.md).

| الملف | المسؤولية |
| --- | --- |
| [frontend/src/services/api.ts](../frontend/src/services/api.ts) | عنوان السيرفر، الطلبات، tokens، refresh، تسجيل الدخول والخروج، روابط الوسائط |
| [frontend/src/App.tsx](../frontend/src/App.tsx) | التسجيل والدخول واختيار واجهة الطالب أو الأدمن |
| [frontend/src/components/DemoCheckout.tsx](../frontend/src/components/DemoCheckout.tsx) | الدفع الوهمي والتحقق من النتيجة |
| [frontend/src/learning/StudentApp.tsx](../frontend/src/learning/StudentApp.tsx) | شاشات بيانات الطالب |
| [frontend/src/learning/Playback.tsx](../frontend/src/learning/Playback.tsx) | جلسة الفيديو وأحداث المشاهدة |
| [frontend/src/admin/](../frontend/src/admin/) | الإدارة والتحرير والرفع |
| [backendCSC/src/app.ts](../backendCSC/src/app.ts) | تعريف المسارات من العقد، validation، فحص الجلسة والدور، توزيع handlers |
| [backendCSC/src/core.ts](../backendCSC/src/core.ts) | الإعدادات، اتصال PostgreSQL، المعاملات ومنع التكرار |
| [backendCSC/contracts/openapi.json](../backendCSC/contracts/openapi.json) | تفاصيل request/response وأنواعها لكل عملية |
| [backendCSC/.env.example](../backendCSC/.env.example) | أسماء الإعدادات دون أسرار |

## 3. التشغيل والربط المحلي

من `C:\Projects\CSCApp`، إذا كانت التبعيات غير مثبتة فقط: `npm run setup`.

Terminal للسيرفر، إذا لم يكن يعمل أصلًا:

```powershell
npm run build:backend
npm run start:backend
```

Terminal منفصل لـMetro:

```powershell
npm run start:frontend
```

Terminal ثالث لبناء وتشغيل Android:

```powershell
npm run android -- --active-arch-only --no-packager
```

اختبر جاهزية السيرفر:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/v1/health/ready
```

فتح التطبيق وحده لا يشغّل الباك إند. لا تبدأ سيرفرًا ثانيًا على المنفذ نفسه. لا تشغّل `npx react-native run-android` من الجذر؛ CLI موجود داخل `frontend` والأمر في الجذر يوجّه إليه.

### هاتف Android حقيقي

الخيار المحلي عبر USB: فعّل USB debugging، تحقق من `adb devices`، ثم استخدم معرّف جهازك إن وُجد أكثر من جهاز:

```powershell
adb -s YOUR_DEVICE_ID reverse tcp:3000 tcp:3000
adb -s YOUR_DEVICE_ID reverse tcp:8082 tcp:8082
```

في هذا الوضع اجعل `API_ORIGIN` للهاتف `http://127.0.0.1:3000` وأعد تحميل التطبيق. هذا يعمل فقط بوجود تحويل ADB؛ `127.0.0.1` على الهاتف وحده يعني الهاتف نفسه.

بديل Wi-Fi: الهاتف والكمبيوتر على شبكة خاصة موثوقة واحدة؛ اجعل `API_ORIGIN` عنوان IPv4 للكمبيوتر مثل `http://192.168.1.20:3000`، وفي إعدادات الباك إند استخدم `HOST=0.0.0.0` و`PUBLIC_API_ORIGIN` بعنوان الكمبيوتر. اسمح بالمنفذ 3000 في جدار الحماية للشبكة الخاصة فقط، ثم أعد تشغيل الباك إند. عنوان المثال ليس عنوان جهازك الفعلي. استخدم HTTPS عند النشر خارج التطوير المحلي.

## 4. اتصال الباك إند بالقاعدة المحلية

الوضع الفعلي `DB_MODE=embedded` في `backendCSC/.env`؛ الأولوية بيئة العملية ثم .env ثم .env.local. قاعدة PGlite في `backendCSC/.local/local-app/postgres`، schema `public`، مع بريد وملفات محلية. لا تحتاج DATABASE_URL أو مفاتيح Supabase. إعدادات الاتصال السحابي محفوظة خارج المشروع وغير محمّلة. [التخزين والتهيئة والفحص](local-run.md).

## 5. قاعدة استدعاء API

- `GET` قراءة، `POST` إنشاء أو تنفيذ إجراء، `PATCH` تعديل جزئي، `PUT` حفظ/استبدال المورد بحسب المسار، `DELETE` حذف الربط أو طلب حذف الحساب.
- `{courseId}` وغيره متغير تستبدله بالـUUID الحقيقي القادم من السيرفر؛ لا ترسل الأقواس.
- Body بصيغة JSON مع `Content-Type: application/json`، ما عدا رفع الملف الذي يرسل bytes.
- المسارات الخاصة تحتاج `Authorization: Bearer ACCESS_TOKEN`؛ الدالة `api()` تضيفه تلقائيًا.
- `api()` تستخرج `data` من الرد. لا تستخدم `result.data` مرة ثانية في الموبايل.
- الجلسة الحالية في الذاكرة؛ إغلاق عملية التطبيق يتطلب دخولًا جديدًا. لا تخزن tokens في AsyncStorage.
- عند 401 تحاول طبقة الاتصال refresh مرة مشتركة للطلبات المتزامنة، ثم تعيد الطلب. فشل التجديد بسبب جلسة مرفوضة يُخرج المستخدم.
- الطلبات الموسومة `Idempotency-Key` تحتاج UUID ثابتًا **لنفس المحاولة المنطقية وإعاداتها**. لا تولّد مفتاحًا مختلفًا لكل إعادة شبكة. تغيير البيانات مع المفتاح نفسه يسبب 409.

شكل نجاح JSON:

```json
{ "data": { "id": "..." } }
```

شكل الخطأ:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Please log in again.", "requestId": "..." } }
```

الرد 204 بلا Body. 202 يعني قبول الطلب للمعالجة وليس إنشاء جلسة أو وصول البريد. في القوائم استخدم `cursor` و`limit` عندما يدعمهما المسار؛ لا تفترض `page=1`. قيود الحقول والأجسام المتداخلة موجودة في Swagger.

## 6. أمثلة ربط من شاشة داخل frontend/src

```ts
import {api, signIn, signOut, requestId} from './services/api';
import type {Course, Enrollment} from './learning/types';

// التسجيل لا يسجل الدخول تلقائيًا؛ كلمة المرور 12–128 حرفًا.
await api('/auth/register', 'POST', {
  name: 'Student',
  email: 'student@example.com',
  password: 'ExamplePassword123!', // مثال فقط؛ استخدم إدخال المستخدم
});

// signIn يتولى installationId وحفظ الجلسة داخل طبقة الاتصال.
const user = await signIn(emailFromForm, passwordFromForm);
// user.role يحدد student أو admin؛ لا تغيره محليًا.

const courses = await api<{items: Course[]; nextCursor: string | null}>(
  '/courses?q=design&sort=newest&limit=20',
);

await api(`/me/bookmarks/${courseId}`, 'PUT');

// احفظ هذا المفتاح إذا أعدت الطلب نفسه بسبب انقطاع الشبكة.
const enrollmentKey = requestId();
const enrollment = await api<Enrollment>(
  `/courses/${courseId}/enrollments`,
  'POST',
  undefined,
  enrollmentKey,
);

await signOut();
```

الأمثلة مقاطع توضيحية: `emailFromForm` و`passwordFromForm` و`courseId` تأتي من الشاشة. غيّر مسارات imports بحسب مكان الملف. عالج الأخطاء وأظهر loading وامنع ضغط الزر المتكرر؛ مثال الدفع الفعلي في DemoCheckout يقوم بذلك.

### تسلسل التسجيل والدخول

1. `POST /auth/register` بالبريد وكلمة المرور والاسم؛ الرد 202 لا يثبت وجود الحساب أو إنشاء جلسة.
2. افتح أحدث رسالة توثيق واضغط التأكيد، أو استهلك token عبر `POST /auth/email/verify`.
3. استدعِ `signIn()`، فتحصل طبقة الاتصال على tokens وuser.
4. يسمح الدخول بحساب غير موثق، لكن الدفع والتسجيل بالدورات والعمليات الحساسة تتطلب التوثيق حسب السيرفر.
5. استرجاع كلمة المرور: طلب الرابط ثم `POST /auth/password/reset` بـtoken وnewPassword؛ لا تستخدم كلمة المرور القديمة.

### تسلسل الدفع الوهمي

```ts
type DemoPlan = {id: string; code: string; name: string};
type DemoPayment = {id: string; status: 'succeeded' | 'failed' | 'refunded'};

const plans = await api<DemoPlan[]>('/billing/demo-plans');
const selectedPlan = plans.find(plan => plan.code === 'basic');
if (!selectedPlan) throw new Error('Plan unavailable');

const purchaseKey = requestId(); // احتفظ به لنفس عملية الدفع
const payment = await api<DemoPayment>(
  '/billing/demo-purchases',
  'POST',
  {planId: selectedPlan.id},
  purchaseKey,
);
if (payment.status === 'succeeded') {
  // هنا فقط اعرض رسالة النجاح، ثم حدّث /me/subscriptions.
}
```

لا ترسل السعر أو userId أو رقم البطاقة أو CVV؛ السيرفر يأخذ المستخدم من الجلسة والسعر من الخطة. نجاح الدفع لا يسجل الطالب بكل الدورات تلقائيًا؛ يسجل بالدورة عبر enroll عندما يختارها. الزائر يعود إلى خطته بعد الدخول، والبريد غير الموثق يعرض Resend.

### الفيديو والتقدم

اقرأ `/me/courses` للحصول على enrollment ونسخة المنهج. اقرأ curriculum باستخدام `versionId` الخاصة بالتسجيل، ثم ابدأ playback-session للدّرس مع `enrollmentId`. استخدم رابط HLS القادم من السيرفر عبر `mediaUrl()`، وأرسل events حقيقية مرتبة تشمل eventId وsequence وkind وpositionSeconds وplaybackRate.

لا ترسل completed أو progressPercent من الموبايل؛ السيرفر يحسبهما. لا تمنح أحداث seek وended وحدها إكمالًا. الرابط مؤقت؛ افتح جلسة جديدة عند انتهائه. التطبيق الحالي يطبق هذا في Playback.tsx.

### إدارة ورفع محتوى

يدخل الأدمن من Login نفسه؛ السيرفر يمنع حساب الطالب من `/admin/*`. في الإنتاج توجد بوابة إضافية `ADMIN_API_ENABLED` و`X-Admin-Key`؛ ليست بديلًا عن دور admin، ولا يُضمّن المفتاح داخل كود التطبيق أو يُنشر للعامة.

الرفع: `POST /admin/assets/upload-sessions` ببيانات الملف وبصمة SHA-256 → `PUT` لعنوان uploadUrl نفسه مع headers التي أعادها السيرفر وbytes الملف → `POST /admin/assets/{assetId}/complete` → تحقق من `GET /admin/assets/{assetId}` حتى ready. لا ترسل الملف بـapi() لأنها JSON، ولا ترسل Bearer إلى موقع تخزين خارجي. التنفيذ الحالي في [upload.ts](../frontend/src/admin/upload.ts).

إنشاء الدورة: create → حفظ draft → انتظار جاهزية الملفات → publish مع versionId. الأرشفة لا تحذف تقدم الطلاب. لا توجد API لتغيير دور الطالب إلى أدمن من الهاتف.

## 7. جميع العمليات الـ78

كل مسار في الجدول يضاف بعد `/v1`. النجمة `*` بجانب اسم الحقل تعني مطلوبًا. حقول Path مذكورة في المسار نفسه؛ أنواع الحقول والقيم المقبولة والأجسام المتداخلة والردود الكاملة في عقد OpenAPI. الصلاحية العامة لا تعني تجاوز rate limits أو توثيق الروابط.

### الحسابات والجلسات

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `POST /auth/register` | إنشاء حساب وإرسال رابط التوثيق؛ لا ينشئ جلسة دخول | عام | Body: `email*`، `password*`، `name` |
| `POST /auth/login` | الدخول وإرجاع accessToken وrefreshToken وبيانات المستخدم | عام | Body: `email*`، `password*`، `installationId*`، `rememberMe*` |
| `POST /auth/refresh` | تدوير refreshToken وتجديد accessToken | عام | Body: `refreshToken*`، `installationId*` |
| `POST /auth/logout` | إبطال جلسة الجهاز الحالية | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /auth/logout-all` | إبطال جميع جلسات الحساب | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /auth/email/verification-requests` | إرسال رابط توثيق جديد؛ يبطل الرابط السابق | عام | Body: `email*` |
| `POST /auth/email/verify` | استهلاك رابط توثيق البريد أو تغيير البريد | عام | Body: `token*` |
| `POST /auth/password/reset-requests` | طلب رابط استعادة دون كشف وجود الحساب | عام | Body: `email*` |
| `POST /auth/password/reset` | تغيير كلمة المرور وإبطال الجلسات | عام | Body: `token*`، `newPassword*` |
| `POST /auth/social/challenges` | إنشاء nonce قصير العمر لتسجيل Google أو Apple | عام؛ تسجيل اجتماعي غير مهيأ | Body: `provider*`، `installationId*` |
| `POST /auth/social/google` | التحقق من هوية Google وإصدار جلسة التطبيق | عام؛ تسجيل اجتماعي غير مهيأ | Body: `challengeId*`، `idToken*`، `authorizationCode`، `installationId*`، `rememberMe*`، `name` |
| `POST /auth/social/apple` | التحقق من هوية Apple وإصدار جلسة التطبيق | عام؛ تسجيل اجتماعي غير مهيأ | Body: JSON حسب العقد |

### الملف والإعدادات

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /me` | عرض بيانات الحساب الحالي | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `PATCH /me` | تعديل اسم الحساب | طالب / أدمن | Body: `name*` |
| `DELETE /me` | طلب حذف الحساب وإبطال جلساته؛ يحتاج دخولًا حديثًا | طالب / أدمن | Header: `Idempotency-Key*` |
| `POST /me/email-change` | توثيق بريد جديد قبل اعتماده | طالب / أدمن | Body: `newEmail*` |
| `GET /me/settings` | قراءة تفضيلات الإشعارات ومشاركة الشهادة | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `PATCH /me/settings` | تعديل التفضيلات | طالب / أدمن | Body: `learningNotifications`، `certificatePublic` |

### الكتالوج والبحث

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /home` | بيانات الرئيسية وملخص الطالب | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /categories` | قائمة التصنيفات النشطة | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /courses` | البحث والتصفية والترتيب في الدورات المنشورة | طالب / أدمن | Query: `cursor`، `limit`، `q`، `categoryId`، `sort` |
| `GET /courses/{courseId}` | تفاصيل الدورة وحالة الوصول | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /courses/{courseId}/curriculum` | فصول ودروس نسخة المنهج؛ بدون رابط فيديو | طالب / أدمن | Query: `versionId` |

### المحفوظات والمكتبة

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `PUT /me/bookmarks/{courseId}` | حفظ دورة في المفضلة | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `DELETE /me/bookmarks/{courseId}` | إزالة دورة من المفضلة | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /me/bookmarks` | عرض المحفوظات | طالب / أدمن | Query: `cursor`، `limit` |

### التسجيل والتعلّم والفيديو

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `POST /courses/{courseId}/enrollments` | التسجيل في نسخة الدورة؛ يتطلب بريدًا موثقًا ووصولًا صالحًا | طالب / أدمن | Header: `Idempotency-Key*` |
| `GET /me/courses` | عرض دوراتي وتقدمي المعتمد | طالب / أدمن | Query: `cursor`، `limit`، `status` |
| `GET /me/history` | الدورات التي درستها مؤخرًا | طالب / أدمن | Query: `cursor`، `limit` |
| `GET /me/enrollments/{enrollmentId}/progress` | تقدم التسجيل والدروس | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /lessons/{lessonId}/playback-sessions` | إنشاء جلسة تشغيل ورابط HLS مؤقت بعد فحص الوصول | طالب / أدمن | Body: `enrollmentId` |
| `POST /playback-sessions/{playbackSessionId}/events` | استقبال أحداث مشاهدة مرتبة وحساب التقدم في السيرفر | طالب / أدمن | Body: `events*` |

### الخطط والدفع

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /plans` | عرض الخطط النشطة؛ ربط منتجات المتاجر فارغ في وضع demo | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /billing/options` | قنوات الدفع المسموحة حسب إعداد السيرفر | طالب / أدمن | Query: `platform*` |
| `POST /billing/purchases/verify` | التحقق من شراء متجر أصلي — معطل حاليًا | طالب / أدمن؛ معطل 409 | Body: JSON حسب العقد<br>Header: `Idempotency-Key*` |
| `GET /billing/verifications/{verificationId}` | نتيجة تحقق شراء متجر — معطل حاليًا | طالب / أدمن؛ معطل 409 | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /me/subscriptions` | حالة اشتراكات الحساب؛ من الدفعات الوهمية حاليًا | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /me/subscriptions/{subscriptionId}/management-session` | فتح إدارة اشتراك لدى مزود حقيقي — معطل حاليًا | طالب / أدمن؛ معطل 409 | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /billing/checkout-sessions` | إنشاء صفحة دفع خارجي — معطل حاليًا | طالب / أدمن؛ معطل 409 | Body: `productId*`<br>Header: `Idempotency-Key*` |
| `GET /billing/checkout-sessions/{checkoutId}` | قراءة حالة دفع خارجي — معطل حاليًا | طالب / أدمن؛ معطل 409 | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /billing/demo-plans` | خطط الدفع الوهمي وأسعارها ومدتها | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /billing/demo-purchases` | إنشاء اشتراك وهمي ناجح دون إرسال بيانات بطاقة | طالب / أدمن | Body: `planId*`<br>Header: `Idempotency-Key*` |

### الشهادات

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /me/certificates` | الشهادات التي أصدرها السيرفر | طالب / أدمن | Query: `cursor`، `limit` |
| `GET /me/certificates/{certificateId}/download` | إصدار رابط PDF قصير العمر لشهادة مملوكة | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /certificates/verify/{code}` | التحقق من شهادة قابلة للمشاركة بمعلومات عامة محدودة | عام | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |

### الإشعارات والأجهزة

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /me/notifications` | صندوق إشعارات الحساب | طالب / أدمن | Query: `cursor`، `limit`، `unreadOnly` |
| `PUT /me/notifications/{notificationId}/read` | تمييز إشعار مملوك كمقروء | طالب / أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `PUT /me/devices/{installationId}` | ربط pushToken بالجهاز؛ يلزم تكامل Push في الموبايل والمزود | طالب / أدمن؛ Push يحتاج تكاملًا إضافيًا | Body: `installationId*`، `platform*`، `pushToken*`، `permission*` |
| `DELETE /me/devices/{installationId}` | إزالة ربط جهاز الحساب | طالب / أدمن؛ Push يحتاج تكاملًا إضافيًا | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |

### الإدارة على الموبايل

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `POST /admin/categories` | إنشاء تصنيف | أدمن | Body: `slug*`، `name*` |
| `PATCH /admin/categories/{categoryId}` | تعديل تصنيف أو إخفاؤه | أدمن | Body: `name*`، `active*` |
| `POST /admin/instructors` | إنشاء ملف مدرس | أدمن | Body: `name*`، `bio*` |
| `PATCH /admin/instructors/{instructorId}` | تعديل ملف مدرس | أدمن | Body: `name*`، `bio*` |
| `POST /admin/assets/upload-sessions` | رابط رفع محدود بالنوع والحجم وبصمة الملف | أدمن | Body: `kind*`، `mimeType*`، `byteSize*`، `checksumSha256*` |
| `POST /admin/assets/{assetId}/complete` | التحقق من الملف وبدء المعالجة | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /admin/assets/{assetId}` | قراءة حالة معالجة الملف | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /admin/courses` | قائمة دورات تشمل المسودات والمؤرشف | أدمن | Query: `cursor`، `limit` |
| `POST /admin/courses` | إنشاء دورة بمسودة | أدمن | Body: `slug*`، `title*`، `categoryId*`، `instructorId*`، `accessType*`، `certificateEnabled*` |
| `PUT /admin/courses/{courseId}/draft` | استبدال مسودة المنهج غير المنشورة | أدمن | Body: `title*`، `description*`، `coverAssetId*`، `categoryId*`، `instructorId*`، `accessType*`، `certificateEnabled*`، `featuredRank*`، `chapters*` |
| `POST /admin/courses/{courseId}/publish` | نشر نسخة مكتملة وقابلة للتشغيل | أدمن | Body: `versionId*` |
| `POST /admin/courses/{courseId}/archive` | إخفاء الدورة من الاستكشاف دون حذف تقدم الطلاب | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `POST /admin/plans` | إنشاء خطة | أدمن | Body: `code*`، `name*`، `features*`، `certificateEnabled*`، `courseIds*`، `active*`، `amountMinor` |
| `GET /admin/plans` | قائمة الخطط للإدارة | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `PUT /admin/plans/{planId}` | تعديل بيانات الخطة وتغطيتها | أدمن | Body: `code*`، `name*`، `features*`، `certificateEnabled*`، `courseIds*`، `active*`، `amountMinor` |
| `POST /admin/plans/{planId}/products` | ربط منتج مزود دفع بخطة — معطل حاليًا | أدمن؛ معطل 409 | Body: `provider*`، `environment*`، `productId*`، `offerId*`، `interval*`، `active*` |
| `GET /admin/overview` | إحصائيات الطلاب والدورات والتسجيلات والدفع الوهمي | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /admin/directory` | قوائم التصنيفات والمدرسين والملفات لمحرر الأدمن | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /admin/catalog` | كتالوج الإدارة مع البحث والحالة | أدمن | Query: `cursor`، `limit`، `q`، `status` |
| `GET /admin/courses/{courseId}` | تفاصيل دورة للإدارة ومسودتها | أدمن | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /admin/users` | قائمة المستخدمين والبحث | أدمن | Query: `cursor`، `limit`، `q` |
| `PATCH /admin/users/{userId}` | تفعيل أو تعليق مستخدم؛ لا يمنح دور أدمن | أدمن | Body: `status*` |
| `GET /admin/audit` | سجل إجراءات الإدارة | أدمن | Query: `cursor`، `limit` |
| `GET /admin/demo-payments` | عرض سجل الدفعات الوهمية | أدمن | Query: `cursor`، `limit`، `q`، `status` |

### إشعارات مزودي الدفع المعطلة

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `POST /webhooks/apple` | استقبال إشعار دفع Apple — معطل حاليًا | مزود بتوقيع؛ معطل 409 | Body: `signedPayload*` |
| `POST /webhooks/google` | استقبال إشعار دفع Google — معطل حاليًا | مزود بتوقيع؛ معطل 409 | Body: `message*`، `subscription*` |
| `POST /webhooks/stripe` | استقبال إشعار دفع Stripe — معطل حاليًا | مزود بتوقيع؛ معطل 409 | Body: JSON حسب العقد<br>Header: `Stripe-Signature*` |

### صحة السيرفر

| الطلب | الوظيفة | الصلاحية والحالة | المدخلات |
| --- | --- | --- | --- |
| `GET /health/live` | هل عملية السيرفر تعمل؟ | عام للفحص | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |
| `GET /health/ready` | هل قاعدة البيانات والاعتماديات المطلوبة جاهزة؟ | عام للفحص | لا يوجد Body؛ المعرفات ضمن المسار إن وجدت |

## 8. مسارات إضافية للملفات والصفحات

هذه ليست ضمن العمليات الـ78 في عقد JSON:

| المسار | الاستخدام |
| --- | --- |
| `PUT /v1/media/uploads/{assetId}` | رفع bytes محليًا باستخدام التوقيع والصلاحية في الرابط الذي أصدره السيرفر؛ لا تنشئه يدويًا |
| `GET /v1/media/stream/{sessionId}/{file}` | قائمة HLS وقطع الفيديو برابط موقع مؤقت |
| `GET /v1/media/images/{assetId}` | غلاف جاهز لدورة منشورة |
| `GET /v1/media/certificates/{certificateId}` | تنزيل PDF بتوقيع مؤقت |
| `GET /auth/action` و`POST /auth/action` | صفحة تأكيد البريد/استعادة كلمة المرور من رابط الرسالة؛ ليست لوحة إدارة |
| `GET /billing/return` | صفحة عودة فقط؛ لا تؤكد نجاح دفع |
| `/docs/` و`GET /openapi.json` | توثيق التطوير؛ غير مفعّل في production |

لا تبنِ روابط الوسائط الخاصة بنفسك أو تحفظها كرابط دائم؛ استخدم الرابط الذي أعاده السيرفر دون تغيير query signature.

## 9. ما يعمل وما يحتاج إعدادًا

| الخدمة | الحالة الحالية وما يلزم |
| --- | --- |
| NestJS ←→ PGlite PostgreSQL المحلية | مربوط؛ 36 جدولًا في public |
| Email/password login | مربوط، والجلسات من NestJS |
| توثيق البريد واستعادة كلمة المرور | المنطق يعمل، لكن MAIL_MODE=local؛ رسائل JSON في backendCSC/.local/local-app/mail. للإرسال الخارجي يلزم MAIL_MODE=smtp وSMTP_URL وSMTP_FROM وعنوان AUTH_LINK_ORIGIN يصل إليه المستخدم. أعد تشغيل السيرفر؛ لا تكشف بيانات SMTP |
| Google/Apple login | مسارات الباك إند موجودة؛ يلزم إعداد مزود الهوية وتكامل تسجيله الأصلي في الموبايل وتسلسل challenge/token. تعبئة env وحدها لا تكفي |
| الدفع | وهمي فقط؛ مسارات الدفع الحقيقي وwebhooks مرفوضة في التشغيل المعتاد. لا يوجد مفتاح env لتشغيل دفع حقيقي |
| الإشعارات داخل التطبيق | من قاعدة البيانات عبر /me/notifications |
| إشعارات Push خارج التطبيق | تحتاج تسجيل token وصلاحية الإشعارات في الهاتف وتكامل FCM/APNs؛ لم يُجهز تكامل Push الأصلي في الموبايل |
| الصور والفيديو والشهادات | ملفات محلية خاصة بالسيرفر؛ Supabase Storage غير مربوط. إعداد S3 المتوافق موجود كخيار منفصل في الباك إند |
| المهام الخلفية | عامل داخل عملية السيرفر في التطوير؛ إعداد إنتاج التطبيق يتطلب Redis مع بقية الاعتماديات |

وجود مكتبات Stripe وApple وGoogle في package.json لا يعني أن الدفع الحقيقي مفعّل. وجود Supabase لا يعني أن API أو الملفات أو البريد صاروا مستضافين عليه.

### تجربة Swagger أو Postman

1. شغّل الباك إند وافتح Swagger على الكمبيوتر.
2. نفّذ `/auth/login` بـemail وpassword وinstallationId بصيغة UUID وrememberMe=false.
3. من الرد خذ accessToken: في Swagger Authorize ألصق قيمة token فقط؛ في Postman اختر Bearer Token. لا تستخدم refreshToken مكانه.
4. اختر endpoint، املأ Path/Query/Body كما في العقد. لعمليات الدفع/enroll/الحذف التي تطلبه ضع Idempotency-Key.
5. إن ظهر 401 جدّد الجلسة أو أعد الدخول؛ 403 يعني دورًا/توثيقًا/وصولًا غير كافٍ؛ 422 مدخلات غير مطابقة؛ 409 تعارض أو ميزة معطلة بحسب error.code؛ 429 حد طلبات؛ 503 اعتماد خارجي غير جاهز.
6. سجّل الخروج من جلسة الاختبار، ولا تنشر tokens أو كلمات المرور مع لقطات الشاشة.

## 10. اللغات والتقنيات المستخدمة

| اللغة أو صيغة الكود | مكان الاستخدام |
| --- | --- |
| TypeScript — .ts/.tsx | اللغة الأساسية: واجهات الموبايل والمنطق والباك إند والاختبارات. TSX هو TypeScript مع صياغة JSX وليس لغة منفصلة |
| JavaScript — .js/.cjs/.mjs | إعداد Metro/Babel/Jest، أدوات استخراج Figma، فحوص ونقل البيانات؛ TypeScript يتحول إليه عند البناء |
| SQL وكتل PL/pgSQL | PostgreSQL: الجداول والعلاقات والفهارس والمهاجرات والسياسات والاستعلامات |
| Kotlin — .kt | MainActivity وMainApplication في Android |
| Swift — .swift | AppDelegate لتطبيق iOS |
| Groovy — .gradle | إعداد بناء Android عبر Gradle |
| Ruby | Podfile لإعداد مكتبات iOS عبر CocoaPods |
| Shell وWindows Batch | أغلفة تشغيل Gradle: gradlew وgradlew.bat |
| HTML | صفحة توثيق البريد واستعادة كلمة المرور الصغيرة التي يولدها الباك إند |
| XML / SVG | AndroidManifest وملفات iOS والتصميم والرسومات |
| JSON / YAML / TOML / Markdown | عقود API والحزم وCompose وSupabase والتوثيق؛ صيغ بيانات وإعدادات وليست لغات منطق التطبيق |

React وReact Native وNestJS أطر/مكتبات، Node.js بيئة تشغيل، Supabase خدمة، PostgreSQL محرك قاعدة بيانات، JWT صيغة token؛ ليست لغات برمجة. تنسيق React Native مكتوب بكائنات TypeScript وStyleSheet، وليس صفحات HTML/CSS.

مجلد admin-dashboard يحتوي لوحة React اختيارية للكمبيوتر، أُعيد تشغيلها محليًا ضمن المراجعة الحالية. يستخدم TypeScript/TSX وHTML وCSS مع Vite، ويشارك API مع إدارة الموبايل. لا تُحسب ملفات node_modules وكود المكتبات المولّد كلغات كتب بها منطق هذا المشروع. لا يعتمد كود التطبيق الأساسي الحالي على Python أو PHP أو Java.

[تقرير التحقق السابق](supabase-auth-payment-checks.md) · [دليل Supabase](../backendCSC/docs/supabase.md)
