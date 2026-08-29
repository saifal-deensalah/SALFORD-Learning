# تفعيل الخدمات والنشر

> التشغيل الحالي embedded محلي، وليس Supabase. [إعداد Supabase السابق](supabase.md) مرجع غير مستخدم محليًا. خطوات Google Play/Apple IAP/Stripe أدناه مرجع تاريخي للمزوّدين المعزولين؛ الدفع الحقيقي معطّل ولا يفعّله أي متغير بيئة. [الدفع الوهمي الحالي](demo-payment.md).

## اختيار البيئة

| الإعداد | محلي | إنتاج |
|---|---|---|
| DB_MODE | embedded أو postgres | postgres إلزامي |
| LOCAL_EMAIL_AUTH | true فقط مع development + embedded + loopback؛ false افتراضيًا | true مرفوض |
| MAIL_MODE | local أو smtp | smtp إلزامي |
| STORAGE_MODE | local أو s3 | s3 إلزامي |
| REDIS_URL | اختياري؛ outbox processor داخلي | مطلوب |
| PUBLIC_API_ORIGIN | localhost | HTTPS إلزامي |
| BILLING_ENVIRONMENT | sandbox | production إلزامي |
| APP_SECRET | يُولد محليًا إن غاب | سر عشوائي من مدير الأسرار |

**لا تفعّل production بمجرد تغيير NODE_ENV.** جهّز قواعد البيانات والصلاحيات والنسخ الاحتياطية والشبكة الخاصة والمزودين أولًا، ثم شغّل migrations بعملية نشر مخصصة. `node dist/cli.js migrate` متاح في الصورة المبنية. حساب migrations منفصل عن حساب API محدود الصلاحيات. تشغيل API في production لا يطبق migrations تلقائيًا.

## البريد

عند `LOCAL_EMAIL_AUTH=true` لا يُشترط إثبات البريد للتسجيل أو استخدام الحساب المحلي، ولا تُنشأ رسالة تفعيل عند التسجيل. لا تُعدّل `email_verified_at` للحسابات الجديدة أو القديمة؛ الاستجابة تفصل الحالة الحقيقية `emailVerified` عن السياسة `emailVerificationRequired`. إعادة إرسال التفعيل في هذا الوضع لا تنشئ رسالة. استعادة كلمة السر وتغيير البريد يحتفظان بمسارهما الآمن؛ `MAIL_MODE=local` يحفظ الرسالة محليًا ولا يوصل بريدًا حقيقيًا. لا يُستخدم هذا الإعداد مع Supabase.

ضع SMTP_URL وSMTP_FROM موثّقًا لدى مزود البريد، وAUTH_LINK_ORIGIN لنطاق الـHTTPS الذي يعرض `/auth/action`. الرسائل تحتوي token أحادية الاستخدام مدتها30 دقيقة. لا تفعّل logs خامة للبريد. روابط GET تعرض تأكيدًا فقط؛ الاستهلاك يحصل عند POST، حتى لا يستهلكها email preview scanner.

## Google وApple للدخول

Google: عرّف معرفات التطبيقات في GOOGLE_CLIENT_IDS مفصولة بفاصلة. React Native يحتاج SDK حقيقيًا يدعم nonce وربط كل تسجيل بـ`POST /auth/social/challenges`. السيرفر يتحقق من JWT keys وissuer/audience/expiry والـnonce، ثم يصدر session خاصة بالتطبيق.

Apple: APPLE_CLIENT_ID/TEAM_ID/KEY_ID/KEY_FILE، والـSDK يرسل idToken وauthorizationCode. يستبدل الكود على خادم Apple ويحفظ refresh token مشفرًا لاستخدام الإلغاء عند حذف الحساب. عند تعارض البريد مع حساب موجود يرجع ACCOUNT_LINK_REQUIRED بدل ربط هوية تلقائيًا؛ واجهة ربط حسابات متقدمة غير موجودة في v1.

لا يوجد نجاح OAuth مزيف خارج اختبارات الباك إند. اجمع bundle IDs وAndroid signing fingerprints الصحيحة عند إعداد المشروع. إعداد App Links/Universal Links في التطبيق والنطاق خطوة منفصلة عن هذا السيرفر.

## Google Play Billing

1. أنشئ products/base plans في Play Console.
2. أعط حساب الخدمة صلاحية Android Publisher المطلوبة وضع GOOGLE_APPLICATION_CREDENTIALS وGOOGLE_PACKAGE_NAME.
3. اربط كل plan بمُعرّف المتجر وbasePlanId عبر admin product mapping.
4. أرسل accountBindingId من `/billing/options` كـobfuscatedAccountId في SDK، ثم purchaseToken إلى `/billing/purchases/verify`.
5. اربط Pub/Sub push بـ`/v1/webhooks/google` مع OIDC. عرّف GOOGLE_PUBSUB_AUDIENCE وGOOGLE_PUBSUB_SERVICE_EMAIL.
6. اختبر pending/acknowledgement/renewal/expiry/refund/restore بحسابات اختبار المتجر قبل الإنتاج.

Google Pay الموجود في التصميم ليس بديلًا عن Google Play Billing. لا يرسل العميل price أو userId أو نسبة وصول لتفعيل الاشتراك.

## Apple In-App Purchase

ضع APPLE_BILLING_KEY_FILE/KEY_ID/ISSUER_ID وAPPLE_BUNDLE_ID، ومعرّف APPLE_APP_ID للإنتاج. نزّل شهادات جذور Apple الموثوقة من مصدر Apple الرسمي وحددها في APPLE_ROOT_CERT_FILES؛ لا تثق بشهادة يرسلها العميل. App Store Server Notifications إلى `/v1/webhooks/apple`.

الـSDK يرسل appAccountToken مطابقًا لـaccountBindingId، ويعيد signed transaction للتحقق. يستخدم السيرفر مكتبة Apple للتحقق من JWS ثم يستعلم عن الحالة الحالية للاشتراك. mapping لمنتج Apple إداري؛ صحة المنتج والشراء تؤكدها البيانات الموقعة قبل منح الوصول.

## Stripe — اختياري ومغلق افتراضيًا

لا تفعل EXTERNAL_CHECKOUT_ENABLED إلا بعد اعتماد قناة التوزيع وسياسة المتجر وبلد نشاطك. ضع STRIPE_SECRET_KEY وSTRIPE_WEBHOOK_SECRET، واربط Price ID متكررًا صحيحًا. يفتح checkout المستضاف، ولا تُستقبل أرقام البطاقات أو CVV في API.

Stripe success redirect لا يمنح اشتراكًا. webhook يعاد التحقق منه بالـraw bytes؛ ثم تُجلب حالة subscription الحالية. الإلغاء في نهاية الفترة يبقي الوصول حتى periodEnd. حالات refund تُراجع وفق نموذج المزود وسياسة النشاط؛ يجب اجتياز اختبارات مزود حقيقية قبل التشغيل المالي. PayPal ليس adapter منفذًا؛ إذا اخترته لاحقًا يضاف مزوّد مستقل بنفس آلية entitlement verification، ولا يُعرض زرّه كأنه جاهز.

## الفيديو والتخزين

استخدم bucket خاصًا. S3_REGION/BUCKET وcredentials من IAM role أو متغيرات AWS؛ endpoint اختياري لمزوّد متوافق. سياسة IAM تسمح فقط بمسارات التطبيق. الفيديو يُفحص حسب MIME/size/checksum، ثم FFmpeg ينتج HLS. playlist يتطلب grant مؤقتة، وsegments في S3 تعاد توجيهها بروابط موقعة قصيرة؛ لا يوجد bucket public.

للرفع من browser/admin client اضبط CORS للـbucket للسماح بـPUT والـContent-Type وx-amz-checksum-sha256 على النطاق الإداري فقط. لم يُختبر S3 فعليًا في هذه البيئة. CDN يمكن إضافته أمام التخزين؛ لا يدّعي هذا الإصدار نشر CloudFront أو DRM أو منع تسجيل الشاشة. أضف فحص malware وsandbox لعامل التحويل عند توسيع التحميل لمصادر غير موثوقة؛ الرفع الحالي محصور بالـadmin.

## Push notifications

ضع FCM_PROJECT_ID وحساب خدمة يدعم Firebase Messaging. Android يرسل FCM token؛ iOS يحتاج ربط APNs في Firebase ثم إرسال FCM token أيضًا، وليس APNs token مباشرة. يرسل السيرفر notificationId وإشعارًا عامًا دون بيانات شخصية على شاشة القفل. local preview تحت `.local/push` لا يعني تسليم push فعليًا.

## Redis والمهام

الـoutbox في PostgreSQL هو السجل الدائم. Redis/BullMQ وسيلة التنفيذ. كل job لها lease10 دقائق، retries بتأخير وحد10 محاولات، ثم تبقى بالسجل مع last_error_code. راقب هذه الحالات، عالج السبب ثم أعد جدولة الصف إداريًا؛ لا يوجد dashboard queues عام. يجب تشغيل worker واحد على الأقل عند IN_PROCESS_WORKER=false.

الانتهاء المحلي للاشتراك يُطبق حتى دون وصول webhook. reconciliation يعيد التحقق من أدلة شراء المتاجر واشتراكات Stripe المتأخرة كل ساعة تقريبًا، ويتابع checkout غير المكتمل دوريًا. يجب أيضًا مراقبة delivery وإعادة إرسال الحدث المتعثر من لوحة المزود. حفظ retry لا يعني ضمان exactly-once لإرسال البريد عبر SMTP؛ الآثار المالية والشهادات نفسها لها deduplication.

## Admin والتشغيل الآمن

Production يعطل admin APIs افتراضيًا. لتفعيلها: private admin gateway/SSO/MFA، ثم ADMIN_API_ENABLED=true وسر ADMIN_API_KEY مستقل لا يضمّن في تطبيق الطالب. أرسله كـX-Admin-Key مع Bearer لجلسة admin. دور admin لا يمكن طلبه عند signup؛ أنشئ أول admin إداريًا بعملية موثوقة.

Swagger ظاهر محليًا فقط. لا تُكشف PostgreSQL أو Redis للعامة. origin لا يعتمد على Host header الوارد. اضبط logging proxy بحيث لا يسجل query tokens الخاصة بصفحات البريد أو روابط الفيديو. احتفظ بـAPP_SECRET ونسخة DB/ملفات متوافقة، واختبر restore فعليًا. مراقبة ونسخ احتياطي وتجربة حمل ومراجعة صلاحيات البنية التحتية ما زالت مسؤولية إعداد النشر وليست خدمات أنشأتها هذه المهمة.
