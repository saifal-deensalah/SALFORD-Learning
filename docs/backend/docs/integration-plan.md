# خطة ربط React Native بالباك إند

هذه خطة تنفيذ لاحقة. لم تُستبدل المحاكاة في هذه المهمة، ولم يُشغّل NestJS أو يُربط حساب متجر/دفع.

## 1. ترتيب التنفيذ

| المرحلة | الباك إند | الفرونت إند | معيار الخروج |
|---|---|---|---|
| 1 — الأساس | Nest modules، DB migrations، DTOs، errors، guards، env، health، request logs | API client، token store آمن، AuthProvider، حالة loading/error | login/session isolation واختبارات 401 تعمل على جهازين |
| 2 — الحساب | email login/register/verify/reset، Google/Apple، rotation، ملف وإعدادات وحذف | استبدال Alert demo، links verification/reset، SDK الدخول، إعادة مصادقة | مستخدم جديد يتحقق ثم يسجل الدخول؛ القديم لا يرى بيانات حساب آخر |
| 3 — المحتوى | admin upload/publish + catalog/categories/curriculum | dynamic course components وربط Home/Search/Details | الصور والعناوين والأعداد تتغير من السيرفر دون تعديل التصميم |
| 4 — التعلم | enrollment، media grants، heartbeats، progress، bookmarks/history | route courseId/lessonId، مشغّل شبكة، resume، user cache | دورة حقيقية بدروس متعددة تستأنف على جهاز آخر ولا يساوي seek إكمالًا |
| 5 — التجارة | منتجات متاجر sandbox، verification/webhooks/reconciliation، entitlements | Store SDK، purchase/restore/manage، pending/error/success | دفع sandbox معتمد يفتح المحتوى؛ refund/expiry يغلقه |
| 6 — الإكمال | PDF worker، notifications/push، deletion workers، audits | تحميل ومشاركة شهادة، inbox/device permission، حالات الفشل | شهادة واحدة بعد كل الدروس، إشعار مرة واحدة، وحذف آمن للحساب |
| 7 — الاستعداد للإطلاق | backups/restore، monitoring، admin protection، provider credentials الإنتاجية | إزالة demo وtest card والروابط التجريبية وإخفاء الميزات غير المنفذة | اختبارات Android/iOS وسياسات المتاجر ومراجعة المحتوى والخصوصية |

تجربة تعليم مجانية يمكن تشغيلها بعد المرحلة4؛ مدفوعات الإنتاج لا تُفعل قبل المرحلة5 ومراجعة التوزيع. لعمل تجريبي دون حسابات متاجر استخدم fake provider داخل بيئة اختبار الباك إند فقط مع منع تفعيله في production، ولا تسمِّ حالته دفعًا حقيقيًا.

## 2. التعديلات داخل المشروع الحالي

| الملف | التغيير المطلوب |
|---|---|
| `src/App.tsx` | استخراج شاشات/خطافات حسب المجال لتقليل الملف الكبير؛ handlers تستدعي services بدل setState لحقائق الحساب |
| `src/data/courses.ts` | إبقاء fixtures للاختبارات فقط؛ نقل types إلى domain models؛ إزالة validateDemoPayment من مسار الإنتاج |
| `src/state/useLearningState.ts` | فصل device preferences عن server state؛ cache باسم userId؛ عدم اعتبار cache مصدر وصول/شهادة |
| `src/components/LessonPlayer.tsx` | props: lessonId/streamUrl/resumeSeconds/sessionId؛ heartbeats/pause/seek/end؛ expiry/retry؛ لا تحويل نسبة الدورة إلى seek |
| `src/components/DesignScene.tsx` ومواضع replacements | استخدام native dynamic Text/Image وقوائم لدورات غير محدودة بدل ربط كل عقدة ببيانات demo |
| Android / iOS | OAuth وStore Billing وsecure token storage وpush وverified links؛ صلاحيات وbundle/package config |
| الاختبارات | نقل حالات local demo إلى fixtures؛ إضافة HTTP mocks واختبارات API contract وdevice sandbox |

هيكل عميل مقترح:

```text
src/
  api/client.ts             # baseURL, JSON, requestId, timeout, typed errors
  api/contracts.ts          # generated or reviewed types from backendCSC/contracts/openapi.json
  api/auth.ts
  api/catalog.ts
  api/learning.ts
  api/billing.ts
  api/profile.ts
  auth/AuthProvider.tsx
  auth/tokenStore.ts        # Keychain / Keystore, never AsyncStorage tokens
  hooks/useHome.ts
  hooks/useCourses.ts
  hooks/useEnrollment.ts
  hooks/useBookmarks.ts
  hooks/useSubscriptions.ts
  billing/storeAdapter.ts
  notifications/deviceRegistration.ts
```

على Android emulator العنوان المقترح `http://10.0.2.2:3000/v1`. مع `adb reverse tcp:3000 tcp:3000` يمكن استخدام `http://localhost:3000/v1`. العنوان لا يعمل قبل تنفيذ وتشغيل السيرفر. Cleartext إن احتجته يُسمح في debug فقط؛ الإنتاج HTTPS. جهاز حقيقي يحتاج IP متاحًا أو بيئة staging آمنة.

## 3. تدفق HTTP وحالات الواجهة

- يحمل API client access token بالذاكرة. عند401 بسبب expiry يشغّل refresh واحدًا تشاركه الطلبات المنتظرة، ثم يعيد الطلب مرة. فشل refresh يمسح الجلسة ويعود للدخول؛ لا يخلط token قديمًا مع حساب جديد.
- timeout مقترح15 ثانية للطلبات العادية؛ لا ينتظر طلب API رفع فيديو طويل. ألغِ البحث السابق عند تغير النص مع debounce300ms، وارفض الاستجابة القديمة إذا تغير query/filter.
- retries تلقائية لـGET فقط على أخطاء مؤقتة. PUT/DELETE idempotent يمكن إعادة إرسالها. POST شراء/enrollment/delete يحتفظ بنفس Idempotency-Key عند retry، ولا ينشئ key جديدة لكل ضغط مكرر.
- عند logout، ألغِ الطلبات قيد التنفيذ وامسح cache المرتبط بالحساب. device token يلغي ربطه قبل إنهاء session عندما تسمح الشبكة. السيرفر يلغي إرسال push لأجهزة الجلسات المنتهية؛ فشل الشبكة لا يبقي بيانات المستخدم ظاهرة محليًا.
- bookmark يمكن optimistic update مع rollback عند الخطأ. الاشتراك والشهادة ونسبة الإكمال لا تستخدم optimistic success. عرض progress محلي مؤقت إن لزم واضح حتى يرد السيرفر.
- لكل قائمة: initial loading، retry، empty، pull-to-refresh، pagination. لكل عملية: disabled submit أثناء الطلب ورسالة فشل آمنة. لا يُظهر frontend نص SQL أو stack trace.
- التطبيق لا يطلب API لكل حركة UI: فتح menu وskip onboarding وإخفاء كلمة المرور محلي، بينما profile/catalog/access حسابي.
- وحّد التحقق من كلمة المرور والحد الأعلى للحقل مع العقد (12–128 المقترحة) بدل شرط8 والحد الافتراضي100 في الواجهة الحالية. لا تقص كلمة المرور أو تعدلها تلقائيًا.

## 4. أمثلة ربط

هذه payloads توضيحية توافق العقد؛ UUIDs أدناه أمثلة لا بيانات موجودة:

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "learner@example.com",
  "password": "example-password-not-a-real-secret",
  "installationId": "f9689d9c-eb2b-42b0-a2cf-ab9f5de07fd5",
  "rememberMe": true
}
```

الاستجابة Session تضم user وaccess/refresh وتاريخي الانتهاء. لا تُحفظ password، ولا يرسل signup حقل confirm. بعد التسجيل يتحقق البريد ثم login؛ بعد Google/Apple تُستخدم جلسة التطبيق نفسها، وليس provider ID token كـBearer دائم.

```http
GET /v1/courses?q=figma&sort=relevance&limit=20
Authorization: Bearer <accessToken>
```

ترجع كل بطاقة `id/slug/title/coverUrl/instructor/category/accessType/lessonCount/durationSeconds/saved/canAccess`؛ لا يستنتج التطبيق هوية صورة من hash Figma. لا يوجد سعر شراء منفرد في v1: تستبدل `$250` بـFree أو Included in subscription حسب النوع، إلى أن يقرر المالك إضافة one-time purchases.

```http
POST /v1/playback-sessions/17d84ac8-186b-4b46-b7df-f26082b7be46/events
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "events": [{
    "eventId": "4e58c665-dbe4-4c56-b00b-aa4d4c2d25ca",
    "sequence": 1,
    "kind": "heartbeat",
    "positionSeconds": 15,
    "playbackRate": 1
  }]
}
```

ترجع النسبة المعتمدة من السيرفر. nextSequence يساعد على الاستئناف داخل session؛ عند session expiry يبدأ الجديد من resume المعتمد. v1 لا يمنح تقدمًا متأخرًا من عينة offline قديمة؛ cache القراءة ممكن، لكن الوصول لفيديو محمي يتطلب grant سارية.

## 5. ترحيل البيانات التجريبية

1. احتفظ بـonboarded كإعداد جهاز؛ أزل أي سلوك يتخطى auth اعتمادًا عليه.
2. لا تنقل `plan` أو `progress` أو `history` أو شهادات demo إلى حساب حقيقي؛ ليس فيها إثبات حساب/شراء/مشاهدة.
3. لا تنقل اسم Muhammad Ahmed أو بريده أو test card إلى سجلات الإنتاج. يتحدد الاسم من التسجيل/المزوّد أو تعديل المستخدم.
4. Favorites القديمة يمكن إعادة اختيارها يدويًا؛ لا حاجة إلى import API في v1. إذا طُلب import لاحقًا يكون بموافقة المستخدم ولمعرفات catalog موجودة فقط؛ لا يسمح بأي امتياز مالي.
5. أسعـار ومزايا خطة الإنتاج تُحمّل من catalog/provider. offline access وVIP/premium support لا تظهر إلا بخدمة فعلية وسياسة دعم واضحة.

## 6. اختبارات القبول المطلوبة للباك إند التنفيذي

هذه اختبارات **مطلوبة لاحقًا**؛ ليست نتائج تنفيذ HTTP لهذه المهمة.

| المجال | حالات قبول أساسية |
|---|---|
| Auth | بريد مكرر لا يتسرب عبر register/reset؛ password خاطئة؛ token expired؛ rotation replay؛ invalid signature/aud/nonce؛ إعادة استخدام reset token؛ logout-all |
| Ownership | الطالبA لا يقرأ أو يعدل progress/bookmark/certificate/subscription/notification/session للطالبB حتى لو عرف UUID |
| Admin | student لا ينشر دورة ولا يرفع media؛ role في register مرفوض؛ audit لكل publish/plan change |
| Catalog | نتائج افتراضية وfilters/empty/pagination؛ لا drafts؛ counts/duration متسقة مع نفس version؛ عنوان وصورة فعليان |
| Learning | نسختان لدورة لا تختلطان؛ seek للنهاية لا يكمل؛ event مكرر لا يضاعف؛ batch out-of-order يُرفض بوضوح؛ resume متعدد الأجهزة |
| Billing | pending لا يفتح؛ evidence لحساب آخر مرفوض؛ receipt مزور/منتج خاطئ/sandbox في production مرفوض؛ webhook مكرر أو معكوس الترتيب؛ expiry/refund/restore |
| Resilience | DB commit ثم Redis outage لا يضيع outbox؛ provider timeout يبقى pending؛ certificate worker retry لا يكرر PDF/notification؛ Signed URL expired يعاد طلبه |
| Privacy | logs لا تحتوي password/token/PAN/CVV؛ refresh ليس في AsyncStorage؛ public verify يحترم opt-in؛ logout ينظف cache/token |
| Deletion | session لا تعمل بعد الطلب؛ push ينقطع؛ worker يحذف/يجهّل حسب السياسة؛ الإدارة المالية الضرورية لا تضيع |

يضاف E2E على Android وiOS sandbox: register→verify→login→search→enroll→play multiple lessons→certificate، وpurchase→verify→play→cancel/expire→access denied. بعدها فقط يمكن وصف المشروع بأنه مربوط بالكامل.
