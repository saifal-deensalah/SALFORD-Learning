# اتصال تطبيق الموبايل بالسيرفر

[الدليل المفصل بالعربية: جميع العمليات الـ78، الأمثلة، التشغيل، والخدمات غير المهيأة](../../docs/api-guide-ar.md).

العنوان الأساسي في `frontend/src/services/api.ts`. كل المسارات التالية تبدأ بـ `/v1`.

المنافذ مشتركة في `frontend/src/services/local-config.json`. لوحة الكمبيوتر الاختيارية تستخدم نفس العقد عبر Vite على5173، والموبايل عبر3000. [التشغيل المحلي والاختبارات الآمنة](../../docs/local-run.md).

| الواجهة | API |
|---|---|
| الدخول والتسجيل والاسترجاع | /auth/login، /auth/register، /auth/password/reset-requests |
| تحديث الجلسة والخروج | /auth/refresh، /auth/logout |
| بوابة الطالب/الأدمن | user.role في نتيجة جلسة الدخول |
| الرئيسية والبحث | /home، /categories، /courses |
| التفاصيل والمنهج | /courses/{id}، /courses/{id}/curriculum?versionId=… |
| التسجيل والمكتبة | POST /courses/{id}/enrollments مع Idempotency-Key، /me/courses، /me/history |
| المحفوظات | /me/bookmarks وPUT/DELETE /me/bookmarks/{id} |
| تقدم الدروس | /me/enrollments/{id}/progress |
| تشغيل الفيديو | POST /lessons/{id}/playback-sessions، POST /playback-sessions/{id}/events |
| الملف والإعدادات | GET/PATCH /me، GET/PATCH /me/settings |
| الشهادات | /me/certificates، /me/certificates/{id}/download |
| الإشعارات | /me/notifications، PUT /me/notifications/{id}/read |
| الدفع الوهمي الواحد | /billing/demo-plans، POST /billing/demo-purchases |
| الاشتراكات | /me/subscriptions |
| الأدمن الأصلي | /admin/overview، /catalog، /users، /plans، /directory، /audit، /demo-payments تحت /admin |
| تحرير ونشر المحتوى | /admin/courses، /{id}/draft، /{id}/publish، /{id}/archive |
| رفع ملفات الهاتف | /admin/assets/upload-sessions → PUT raw bytes إلى الرابط الموقع → /admin/assets/{id}/complete |

لا توجد صفحة موقع على /admin/. إنتاجيًا يبقى تحقق الدور ومفتاح بوابة الإدارة على السيرفر؛ لا يُشحن مفتاح سرّي مع التطبيق.
تعديلات الدورات المنشورة تُحفظ كنسخة جديدة، ويستكمل الطالب نسخته السابقة من خلال enrollment.courseVersionId.
التقدم والشهادة وحالة الاشتراك لا تُستنتج من بيانات AsyncStorage أو انتهاء الفيديو؛ السيرفر صاحب القرار.

