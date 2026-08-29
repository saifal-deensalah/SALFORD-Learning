# فحص تشغيل Android — 2026-08-28

## الحالة الحالية

**نجح القبول الفعلي لتشغيل Android وFast Refresh.** بعد موافقة المستخدم، نجح `adb -s emulator-5554 shell am force-stop com.cscapp`، ثم فُتح التطبيق المثبت وظهرت شاشة الدخول واتصل JavaScript بـMetro. نجح `npm run android:dev` مرتين متتاليتين دون بناء أو تثبيت أو Reload، وبقي نفس Metro ونفس المحاكي. ظهر نص TSX مؤقت ثم اختفى بواسطة Fast Refresh على APK الصحيح، وأُعيد الملف بايتًا ببايت. هذا تحقق لبيئة تشغيل Android، وليس ادعاءً باختبار كل وظائف المشروع.

## البيئة التي فُحصت

| البند | القيمة الفعلية |
| --- | --- |
| المشروع | `C:\Projects\CSCApp` |
| الواجهة | `C:\Projects\CSCApp\frontend`، React Native CLI 0.87.1 |
| Git branch / remote | لا يوجد `.git` في الجذر أو frontend؛ أوامر Git أعادت not a git repository |
| Node / npm | 24.19.0 / 11.17.0 |
| Java في المشغّل | Temurin17.0.20.1؛ JAVA_HOME العام كان Android Studio JBR25.0.2 ولم أغيّره |
| Gradle | 9.4.1؛ تحقق --version أن Launcher وDaemon يستخدمان JDK17 عند تشغيل البيئة المعدة |
| SDK | `C:\Users\salma\AppData\Local\Android\Sdk` |
| ADB | 1.0.41، platform-tools37.0.1 |
| المحاكي | `Pixel_8`، serial `emulator-5554`، Android API35 |
| التطبيق | `com.cscapp/.MainActivity`، Debug |
| Metro | `127.0.0.1:8082`؛ root في status header يطابق frontend |

## ما أثبته التشخيص

1. APK المثبت قبل الإصلاح طابق SHA256 لملف Debug الموجود بالمشروع، لكنه احتوى `react_native_dev_server_port=8083` حسب aapt2. إعداد المشروع المشترك هو8082، والعنوان المحفوظ في Dev Menu كان `localhost:8082`. عدم توحيد منفذ البناء كان مثبتًا، وليس افتراضًا بأن المشروع يستخدم8081.
2. عملية Metro السابقة أجابت عن status لكنها لم ترجع bundle خلال45ثانية، وبقي التطبيق في التحميل. بعد إعادة تشغيل هذه العملية الموثقة فقط، ظهر خطأ cache: `Unable to deserialize cloned data`، ثم نجح Metro بإعادة فهرسة الملفات تلقائيًا. رجع bundle200 بحجم يقارب9.5MB. لم أستخدم reset-cache أو clean ولم أحذف ملفات cache.
3. بعد إعادة البناء، توقفت خدمة ADB عن الرد حتى على devices. تحققت من executable وCommandLine وPID، وأعدت تشغيل خدمة ADB المحددة فقط. Pixel8 نفسه لم يُعد تشغيله أو مسح بياناته، وعاد إلى device وboot_completed=1.
4. انقطاع اتصال bundle ترك عملية التطبيق الجديدة في حالة `ReactContext is not ready`؛ سجل EOF يطابق انقطاع الاتصال أثناء التحميل. Reload من القائمة ومن broadcast لم يخرج هذه العملية من الحالة العالقة. أُعيد تشغيل عملية التطبيق فقط بعد الموافقة الصريحة، دون مسح بيانات أو إعادة تثبيت، وحُلّ التعليق.
5. بعد الفتح الأول، كانت الواجهة وJavaScript تعملان، لكن مهلة أمر ADB في المشغّل (15ثانية) انتهت أثناء فتح Android. زيدت مهلة `am start -W` فقط إلى60ثانية، ثم نجح المشغّل مرتين حتى READY؛ لم تُخفَ أخطاء ADB ولم يُعتبر timeout نجاحًا.

## الإصلاحات

- `frontend/scripts/native.cjs`: منع بورت متعارض، إزالة تكرار --port المتطابق، وتثبيت cwd على frontend.
- `frontend/android/app/build.gradle`: منفذ Native من local-config.json، مع رفض override مختلف. **الـAPK الجديد يحتوي8082** حسب aapt2.
- `frontend/scripts/dev-android.cjs`: اكتشاف Pixel8، انتظار جاهزيته، اختيار JDK17، التحقق من هوية Metro وbundle الفعلي، منع التكرار، reverse، فحص Debug، بصمة Native لتجنب البناء غير اللازم، وفحص الاتصال. مهلة فتح Android60ثانية. إيقاف Metro محصور بالعملية الموثقة لهذا المشروع. لا يشغّل backend أو migrations.
- root وfrontend `package.json`: أمر `android:dev`.
- `frontend/tsconfig.json` و`jest.config.js` و`metro.config.js`: استبعاد artifacts المولدة والنسخ الاحتياطية من الفحص والفهرسة، لتجنب تجميع ملفات الاختبار أو تصادم package names.
- `frontend/scripts/dev-android.test.cjs`: اختبارات البصمة وتمرير المنفذ والتحقق من ملكية Metro.
- README في الجذر وfrontend و`docs/android-dev.md`: أوامر التشغيل والإيقاف ومتى يلزم rebuild.

لم تُعدّل ملفات backend أو APIs أو قاعدة البيانات، ولم تُشغّل migrations. تعديل TSX التجريبي أُرجع بايتًا ببايت؛ لا تغيير دائم في UI أو business logic. النسخ السابقة من الملفات المعدلة محفوظة في `frontend/artifacts/android-runtime/source-backup`.

## نتائج الاختبارات

| الاختبار | النتيجة |
| --- | --- |
| البناء والتثبيت | نجح Debug مرة واحدة، 4m57s، 181 مهمة، 32نفذت و149up-to-date؛ install Success |
| منفذ APK الجديد |8082 مؤكد بواسطة aapt2 |
| اختبارات الواجهة |54/54، أربع مجموعات |
| فحوص المشغّل |3/3؛ تشمل تجاهل TSX ومخرجات build، اكتشاف Native، رفض بورت مخالف وعملية Metro غريبة |
| TypeScript |نجح |
| ESLint |0أخطاء،17تحذيرًا سابقًا؛ لم أغير UI لإزالتها |
| Fast Refresh قبل البناء |النص المؤقت ظهر ثم اختفى عند الاستعادة؛ نفس AndroidPID، بلا إعادة تشغيل JavaScript أو reload أو build |
| عدم إعادة البناء |نجاحان متتاليان حتى READY؛ rebuilt=false وreloadRequested=false في كليهما، وبصمة APK ووقت تثبيته لم يتغيرا |
| عدم التكرار |محاكي واحد PID6016 وMetro واحد PID21808 قبل وبعد التكرار؛ لا مستمع على8081 أو8083 |
| التشغيل المتزامن |رفض المشغّل الثاني بالقفل أثناء عمل الأول؛ لم يبدأ Metro أو محاكيًا ثانيًا؛ أزيل القفل عند انتهاء الأول |
| backend / لوحة الكمبيوتر |بقيا يعملان على3000 و5173 دون إعادة تشغيلهما؛ health=200 |
| فتح التطبيق بعد تثبيت APK الجديد |نجح؛ شاشة Login ظاهرة، inspector يعرض com.cscapp، وسجل ReactNativeJS يؤكد Running CSCApp |
| تحميل JavaScript |bundle فعلي9,496,146بايت؛ connected=true وMetro reused=true في كلا التشغيلين |
| Fast Refresh النهائي على APK الجديد |نجح ظهور النص المؤقت واختفاؤه، وبقي AndroidPID28082 وعدد مرات بدء JavaScript ثابتًا؛ دون Reload أو build أو install |
| استعادة المصدر |App.tsx مطابق للنسخة السابقة بايتًا ببايت؛ لا تغيير UI دائم |

سجلات وأدلة الاختبارات في `frontend/artifacts/android-runtime`، وسجلات Metro الجديد في `frontend/artifacts/android-dev`. ظهرت أيضًا تحذيرات Gradle API قديمة وتحذير export داخلي من React Native؛ البناء نجح ولم تُحدّث dependencies خارج نطاق الإصلاح.

أدلة التحقق النهائي في `frontend/artifacts/android-runtime`: `launcher-final-first.json` و`launcher-final-repeat.json` و`launcher-idempotence.json` و`fast-refresh-final.json`، مع صور ظهور النص واستعادة شاشة الدخول. تم الإبقاء على سجلات المحاولات الفاشلة السابقة لتوثيق التشخيص.

## حدود الاختبار

لم يُختبر عمدًا إغلاق المحاكي وفتحه من الصفر، أو تخريب عنوان Metro المحفوظ لإجبار مسار إصلاحه. لم نغيّر بيانات المستخدم أو نختبر تسجيل الدخول والدفع ضمن مهمة بيئة Android. بقي backend وVite الموجودان يعملان كما كانا؛ لا اتصال بـSupabase ولا تغيير بقاعدة البيانات ضمن هذه المهمة.

## أمر الاستخدام اليومي

```powershell
cd C:\Projects\CSCApp
npm run android:dev
```

إذا لم يكن backend يعمل، شغّله من Terminal آخر بـ`npm run start:backend`. المشغّل لا يفتحه تلقائيًا التزامًا بنطاق عدم تشغيل migrations. [الدليل التفصيلي](android-dev.md).
