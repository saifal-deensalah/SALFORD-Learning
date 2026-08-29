# تفعيل Sign in with Google في CSCApp

التكامل الحالي منفذ على Android باستخدام `@react-native-google-signin/google-signin`:

```text
زر Google داخل شاشة Login من Figma
  -> فحص Google Play Services
  -> نافذة Google الأصلية لاختيار/إضافة الحساب
  -> Google ID token
  -> POST /v1/auth/social/google
  -> تحقق Google الرسمي من التوقيع وissuer وaudience وexpiry
  -> مستخدم student وجلسة CSCApp حقيقية في قاعدة البيانات المحلية
```

## إعداد المشروع الحالي

- Android package name: `com.cscapp`
- Debug SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- Web OAuth Client ID: `175641500115-gjqvdqhnvs8gl579kfvg8il3l8r9ka1n.apps.googleusercontent.com`
- Metro: `8082`
- Backend: `3000`

الـWeb Client ID معرف عام ويستخدم في `GoogleSignin.configure`. لا يوضع Client Secret داخل React Native.

## إعداد Backend المحلي

ضع القيمة التالية في `backendCSC/.env` فقط، وهو ملف مستثنى من Git:

```dotenv
GOOGLE_CLIENT_ID=175641500115-gjqvdqhnvs8gl579kfvg8il3l8r9ka1n.apps.googleusercontent.com
```

بعد تغيير البيئة أعد تشغيل Backend. Migration رقم `003_google_identity_profile.sql` تطبق تلقائيًا عند تشغيل السيرفر المحلي، وتحفظ رابط صورة Google الموثوق في سجل هوية المزود.

## ما يجب أن يكون موجودًا في Google Cloud Console

1. OAuth Client من نوع Android بالقيمتين `com.cscapp` وSHA-1 أعلاه.
2. OAuth Client من نوع Web application بالمعرف أعلاه.
3. OAuth consent screen مكتملة.
4. إذا كانت حالة النشر **Testing**، يجب إضافة حساب العرض ضمن **Test users**.
5. لنسخة Release أنشئ Android OAuth Client إضافيًا ببصمة SHA-1 لشهادة النشر، من دون تغيير package name.

لا يحتاج هذا التكامل Firebase ولا `google-services.json`.

## التشغيل والاختبار

يحتاج تثبيت المكتبة إلى native rebuild مرة واحدة:

```powershell
cd C:\Projects\CSCApp\frontend
npm run android -- --no-packager
```

شغّل Metro الموجود على `8082` ولا تنشئ نسخة ثانية. يجب أن يحتوي الجهاز أو المحاكي على Google Play Services وحساب Google. بعد الضغط على زر Google، اختر الحساب؛ عند النجاح يحدّث نفس مخزن الجلسة المستخدم في دخول البريد، ثم يوجّه `SessionApp` المستخدم إلى `StudentApp`.

## قواعد الأمان المنفذة

- الخادم يتحقق من ID token عبر `google-auth-library` وبـWeb Client ID المحدد.
- الاسم والبريد والصورة تؤخذ من token الموثق، لا من الهاتف.
- يشترط `email_verified=true`.
- الحساب الجديد ينشأ دائمًا بدور `student`، ولا يقبل role من العميل.
- لا يحدث ربط تلقائي ببريد حساب كلمة مرور موجود؛ يعاد `ACCOUNT_LINK_REQUIRED`.
- تحفظ هوية Google بواسطة `provider + subject`، وتستخدم جلسات access/refresh نفسها في النظام الحالي.
- challenge قصيرة العمر وأحادية الاستخدام تمنع إعادة استعمال طلب المصادقة داخل التطبيق.
- لا تتم طباعة ID token أو refresh token ولا يوجد Client Secret في الواجهة.

ملاحظة: المكتبة المطلوبة تعتمد حاليًا على Google Sign-In API القديم في Android، ولذلك يظهر تحذير deprecation من Google أثناء التشغيل، لكنه لا يمنع التدفق الحالي. أي انتقال مستقبلي إلى Credential Manager يجب أن يكون تغييرًا مخططًا ومختبرًا، لا ترقية قسرية قبل التسليم.
