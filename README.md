# CSCApp — التشغيل المحلي

تطبيق React Native CLI للطالب والأدمن، وNestJS محلي مع قاعدة **PostgreSQL مدمجة عبر PGlite، schema `public`**. السيرفر وقاعدة البيانات والملفات على جهازك؛ Supabase غير مستخدم في الإعداد الحالي. توجد أيضًا لوحة React للكمبيوتر تعمل محليًا عبر Vite.

[نتيجة تفعيل القاعدة المحلية](docs/embedded-local-check.md) · [المراجعة السابقة قبل تغيير وضع DB](docs/final-local-review.md) · [دليل التشغيل](docs/local-run.md) · [خريطة APIs واللغات](docs/api-guide-ar.md)

```text
CSCApp/
  frontend/          # React Native: الطالب + الأدمن على الموبايل
  backendCSC/        # السيرفر الوحيد؛ الاتصال والأسرار والملفات المحلية
  admin-dashboard/  # لوحة كمبيوتر اختيارية، تستخدم نفس API والصلاحيات
  docs/             # أدلة التشغيل وتقارير الفحص ومرجع التصميم السابق
```

## المتطلبات

Node.js **22.13+**، npm، Java **17**، Android Studio وAndroid SDK ومحاكي Android. إعداد iOS يحتاج macOS وXcode وCocoaPods؛ لم يُختبر على Windows. تحتاج إنترنت لتثبيت التبعيات وأدوات Android أول مرة؛ قاعدة البيانات والمحتوى التجريبي المحلي لا يحتاجان Supabase أو Docker أو تثبيت PostgreSQL منفصل. البريد والوسائط محليان والدفع **تجريبي فقط**؛ Google/Apple وPush غير مفعّلة.

## تشغيل Android اليومي على Windows

من Terminal داخل VS Code:

```powershell
cd C:\Projects\CSCApp
npm run android:dev
```

الأمر يكتشف **Pixel_8** والـserial الفعلي، يعيد استخدام المحاكي وMetro إن كانا يعملان، يضبط `adb reverse` على8082، ويختار JDK17 للعملية فقط. يفحص تحميل JavaScript، وليس `/status` وحده. يبني ويثبت Debug إذا تغيّر Native أو لم توجد نسخة مطابقة؛ التشغيل المعتاد يتجاوز البناء. **لا تشغّل Metro أو محاكيًا ثانيًا بجانبه.**

تعديلات **TS/TSX/JS/JSX** تظهر عبر **Fast Refresh** بمجرد الحفظ، ولا تحتاج إعادة تشغيل هذا الأمر أو Android rebuild. تغييرات `android/` وGradle وManifest والمكتبات الأصلية تتطلب بناء؛ يكتشفها المشغّل. لا تستخدم `gradlew clean` أو `--reset-cache` كخطوة تشغيل عادية.

الـbackend مستقل؛ إذا لم يكن شغّالًا، افتح Terminal آخر من الجذر ونفّذ `npm run start:backend` (وبناء backend فقط إذا غيّرت كوده). مشغّل Android لا يغيّر قاعدة البيانات ولا يشغّل migrations أو backend تلقائيًا. لوحة الكمبيوتر اختيارية: `npm run start:admin`.

Metro الذي يشغّله الأمر يبقى في الخلفية. لإيقاف **Metro الخاص بهذا المشروع فقط**:

```powershell
npm run android:dev -- --stop
```

أغلق Pixel8 من نافذته عند الانتهاء. أوقف backend وVite بـ`Ctrl+C` من Terminal كل خدمة. السجلات وحالة آخر تشغيل في `frontend/artifacts/android-dev/`، والتفاصيل في [دليل Android](docs/android-dev.md).

## التشغيل اليدوي البديل والتثبيت

الأوامر التالية بديل للمشغّل اليومي؛ لا تجمع الطريقتين لتشغيل Metro أو المحاكي.

نفّذ كل مجموعة في Terminal منفصل، من `C:\Projects\CSCApp`. للتثبيت أول مرة أو بعد تغيير lockfiles:

```powershell
cd C:\Projects\CSCApp
npm run setup
```

**Terminal 1 — backend:**

```powershell
cd C:\Projects\CSCApp
npm run build:backend
npm run start:backend
```

**Terminal 2 — Metro:**

```powershell
cd C:\Projects\CSCApp
npm run start:frontend
```

**Terminal 3 — Android:** افتح محاكيًا من Android Studio أولًا.

```powershell
cd C:\Projects\CSCApp
npm run android -- --active-arch-only --no-packager
```

**Terminal 4 — لوحة الكمبيوتر، عند الحاجة:**

```powershell
cd C:\Projects\CSCApp
npm run start:admin
```

افتح [لوحة الأدمن المحلية](http://127.0.0.1:5173/admin/). تحتاج حسابًا دوره `admin` في السيرفر؛ لا يوجد تحويل طالب إلى أدمن من الواجهة. تطبيق الموبايل يفتح الإدارة تلقائيًا لنفس الدور. **`http://127.0.0.1:3000/admin/` يعيد 404 عمدًا**؛ السيرفر لا يخدم موقع الإدارة. بناء `npm run build:admin` يفحص ويولّد الملفات، لكنه لا يشغّل Vite.

| الخدمة | المنفذ والعنوان |
| --- | --- |
| Backend على الكمبيوتر | `127.0.0.1:3000`؛ API تحت `/v1` |
| Backend من محاكي Android | `10.0.2.2:3000` |
| Metro | `127.0.0.1:8082` |
| لوحة الكمبيوتر | `127.0.0.1:5173/admin/`؛ proxy إلى backend |
| Swagger | [توثيق API](http://127.0.0.1:3000/docs/) |

المنافذ العامة في **`frontend/src/services/local-config.json`**؛ تقرؤها التطبيقات وأوامر التشغيل. لا تكرر العنوان في الشاشات. أي override لـ`PORT`/`PUBLIC_API_ORIGIN` في بيئة backend يجب أن يطابق هذا الملف. الهاتف الحقيقي عبر USB له إعداد منفصل في [دليل التشغيل](docs/local-run.md).

للإيقاف: `Ctrl+C` في Terminals الخاصة بالسيرفر وMetro وVite. أمر Android ينتهي بعد التثبيت؛ أغلق التطبيق/المحاكي من واجهته. لا تشغّل نسختين من الخدمة على نفس المنفذ، ولا تستخدم `npx react-native` من جذر المشروع؛ CLI مثبت داخل `frontend`.

## قاعدة البيانات والأسرار

### التسجيل والدخول المحلي

الإعداد الصريح `LOCAL_EMAIL_AUTH=true` في `backendCSC/.env` يعمل فقط مع `NODE_ENV=development` و`DB_MODE=embedded` وHOST على loopback. يرفض السيرفر الإعداد في production أو PostgreSQL الخارجي. يجب إعادة تشغيل backend بعد تغيير البيئة أو بناء الكود. الأولوية تبقى: بيئة العملية ثم `.env` ثم `.env.local`.

التسجيل يحفظ حسابًا فعليًا وكلمة سر مشفّرة بـArgon2id، دون رسالة تفعيل؛ التطبيق ينفّذ بعدها `/auth/login` الحقيقي. الحساب القديم غير المفعّل يدخل بكلمة سره دون تعديل حسابه أو ادعاء تفعيل إيميله. `emailVerified` يظل الحالة الحقيقية؛ `emailVerificationRequired=false` يوضح السياسة المحلية ويخفي طلبات التفعيل. كلمة السر والصلاحيات وحالة الحساب النشط ما زالت مطلوبة. التكرار محليًا يعيد409، ولا ينشئ حسابًا ثانيًا. Google/Apple معطّلان في الواجهة لأن ربط OAuth Native غير مهيأ.

مرجع الواجهة هو ملف Figma الأصلي وبياناته المفكوكة في `frontend/design/`. واجهة الضيف وواجهة الطالب بعد الدخول تستخدمان الآن عناصر التصميم نفسها؛ `StudentApp` يربط بطاقات وشاشات Figma ببيانات `/home` و`/courses` و`/me/*` الحقيقية. تبقى لوحة الأدمن مستقلة عن تصميم الطالب. [تفاصيل المصادقة وحدود الاختبار](docs/local-auth-review.md).

الوضع الفعلي في `backendCSC/.env`: `DB_MODE=embedded` و`HOST=127.0.0.1`. الأولوية: **بيئة العملية → `.env` → `.env.local`**؛ الموجود لا يُستبدل. `.env.local` لا يحتوي الآن إعدادات اتصال. `.env.example` مرجع فقط؛ لا تنسخه فوق إعدادك. لا تحتاج أي مفتاح Supabase.

القاعدة الحالية في `backendCSC/.local/local-app/postgres`، والسر والحسابات التجريبية والملفات داخل `backendCSC/.local/local-app`. تم تهيئتها من ملفات المشروع:36 جدولًا و7دورات تجريبية، دون نسخ بيانات Supabase. القاعدة القديمة `.local/postgres` محفوظة ولم تُعدّل. بيانات الدخول المحلية الخاصة في `backendCSC/.local/local-app/demo-accounts.json`؛ افتحها بنفسك ولا تنشرها. سجّل خروجًا من جلسات القاعدة السابقة ثم ادخل بالحسابات المحلية.

حُفظت إعدادات Supabase خارج المشروع بصلاحيات خاصة؛ مسار النسخة في `.local/active-config-backup-path.txt`. لا تشغّل أدوات النقل أو تعِد إعداد السحابة أثناء العمل المحلي. ملفات البيئة و`.local` مستثناة من Git؛ النسخة الحالية لا تحتوي `.git`. لا تحذف مجلد البيانات أو `secrets.json` أو lockfiles لحل الأخطاء. [تفاصيل التهيئة والتخزين](docs/local-run.md).

## الفحوص

من جذر المشروع:

```powershell
npm run typecheck
npm run lint
npm test
npm run build:backend
npm run build:admin
npm run check:contract
npm run check:local
```

**أوقف backend قبل `check:local`**؛ الفحص يشغّل API على3000 ويوقفه تلقائيًا، ويتحقق من القاعدة الفعلية واستمرار البيانات وloopback وhealth وSwagger وعدم تسرب السر. يرفض وضع PostgreSQL الخارجي قبل الاتصال. لا ينشئ قاعدة أو seed ولا يشغّل العامل. لاختبار دخول حسابات demo المحلية وصلاحياتها أيضًا: `npm --prefix backendCSC run check:local -- --demo-auth`؛ هذا يكتب جلسات اختبار محلية ثم يلغيها. `npm test` يستخدم قاعدة معزولة. `check:design` فحص اختياري لمرجع التصميم القديم.

الجلسات في الذاكرة فقط؛ إعادة فتح التطبيق أو تحميل لوحة الكمبيوتر تتطلب الدخول مجددًا. شاشات الحساب المتصل تستخدم بيانات السيرفر. معرض Figma ومواد الدورات التجريبية ليست محتوى تعليميًا نهائيًا ولا إثبات تطابق بصري 100%.

