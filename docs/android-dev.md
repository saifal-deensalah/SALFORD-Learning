# تشغيل Android على Windows

المشروع `C:\Projects\CSCApp`، والواجهة `frontend` هي React Native CLI، وليست Expo. تطبيق Android هو `com.cscapp` ونشاطه `.MainActivity`. ملف المنافذ المشترك `frontend/src/services/local-config.json`: Metro8082، backend3000، ولوحة الكمبيوتر5173.

## أمر التشغيل اليومي

```powershell
cd C:\Projects\CSCApp
npm run android:dev
```

يعمل نفس الأمر من `frontend`. لا تشغّل Metro أو محاكيًا إضافيًا يدويًا. يكتشف المشغّل اسم Pixel8 والـserial، ينتظر boot_completed=1، ويتحقق من عملية Metro ومسارها واستماعها على loopback. يتحقق من `/status` ثم تحميل bundle فعلًا، ويضبط adb reverse، ويفتح Debug. يعالج عنوان bundler قديم من قائمة React Native نفسها، دون مسح بيانات التطبيق. يتعامل بحذر مع جهاز offline ولا يقتل adb أو يمسح AVD؛ إذا لم يستطع تحديد الجهاز بأمان يتوقف بتفسير واضح.

يسمح أمر فتح Android بما يصل إلى60ثانية قبل الإبلاغ عن فشل؛ نجاح تحميل bundle وحده لا يكفي، إذ ينتظر اتصال التطبيق المثبت بـMetro أيضًا. تحقق التشغيل المتكرر وFast Refresh الفعلي موثّق في [تقرير Android](android-runtime-review.md).

إذا كانت العملية على8082 ليست Metro الخاص بهذا المشروع، يتوقف ولا يقتلها. إذا ثبت أن Metro الخاص بالمشروع عالق، يعيد تشغيله وحده دون حذف الكاش. يستعمل قفلًا لمنع تشغيل نسختين من المشغّل بالتزامن. بعد انقطاع قسري، تحقق أولًا أن PID الموجود في `frontend/artifacts/android-dev/launcher.lock` لم يعد يعمل قبل التعامل مع القفل؛ لا تحذف بيانات المشروع.

المشغّل يستخدم JDK17 من JAVA_HOME إذا كان مناسبًا، أو من JDKs المثبتة في `.gradle/jdks` أو `.jdks`. لا يغير JAVA_HOME العام ولا يحتاج إعادة تثبيت Java. إذا لم يجد JDK17، يعطي خطأ بدل استخدام إصدار آخر بصمت. SDK من ANDROID_HOME/ANDROID_SDK_ROOT أو `android/local.properties`.

## متى يحتاج بناء؟

- TS/TSX/JS/JSX العادية: احفظ الملف؛ Fast Refresh يحدث الواجهة دون Android build.
- Android/Gradle/Manifest/Kotlin/Java/C++ والموارد أو مكتبات Native: يعيد المشغّل بناء Debug وتثبيته عند تغيّر بصمتها.
- إذا لم يكن التطبيق مثبتًا أو لم تطابق نسخة Debug المصدر/الـAPK، ينفذ بناءً وتثبيتًا. لا ينفذ uninstall ولا يمسح app data.
- استثناء مقصود: ملفات مواصفات Codegen، إن أضيفت، يمكن أن تتطلب بناء Native رغم أنها TypeScript.

يحفظ المشغّل البصمة محليًا في `artifacts/android-dev/native-state.json`، ويتحقق من هوية التطبيق ونسخة APK. إعادة البناء الصريحة، عند الحاجة فقط:

```powershell
npm run android:dev -- --rebuild
```

`native.cjs` يقبل `--port 8082` مرة واحدة ويزيل التكرار المتطابق، ويرفض بورتًا متعارضًا. Gradle يقرأ نفس الملف المشترك، بما في ذلك البناء من Android Studio؛ لا يعود تلقائيًا إلى8081 أو8083.

## السيرفر ولوحة الكمبيوتر

المشغّل **لا يبدأ backend ولا يقرأ ملفاته السرية ولا يفتح قاعدة البيانات**. يفحص health المحلي فقط. إذا أبلغ أن السيرفر غير جاهز، شغّله من Terminal آخر في جذر CSCApp:

```powershell
npm run start:backend
```

إذا عدّلت كود backend، ابنِه أولًا بـ`npm run build:backend`. قاعدة البيانات المحلية وإعداداتها لم تتغير ضمن إصلاح Android. لوحة الكمبيوتر اختيارية بأمر `npm run start:admin`، ولا يحتاجها تطبيق الموبايل.

## الإيقاف والسجلات

```powershell
npm run android:dev -- --stop
```

يوقف Metro الموثق لهذا المشروع فقط، ويترك backend والمحاكي دون تغيير. أغلق نافذة المحاكي بنفسك، وأوقف backend/Vite من Terminal كل خدمة بـCtrl+C. لا تقتل جميع عمليات node أو Java.

`artifacts/android-dev/last-run.json` يسجل الجهاز وMetro ونتيجة البناء. سجل Metro الجديد تحت نفس المجلد؛ عند إعادة استخدام Metro شغّلته بنفسك، راجع Terminal الأصلي له. تقرير التشخيص والاختبار في `artifacts/android-runtime/`؛ هذه الملفات مستثناة من Git ومن TypeScript.

فحوص المشغّل دون بناء Android:

```powershell
node --test frontend/scripts/dev-android.test.cjs
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:ci
```

لا تحتاج `gradlew clean` أو reset-cache عند كل تشغيل. لا يستخدم هذا المشغّل Expo أو أي مشروع آخر.
