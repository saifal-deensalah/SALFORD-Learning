# التحقق من التصميم

تاريخ التحقق: 2026-08-29T00:20:13.875Z

- OpenAPI: **67 عملية، 61 مسارًا، 59 نموذج بيانات**. نجح فحص Swagger Parser للعقد والمراجع.
- SQL: إنشاء **33 جدولًا** بنجاح في PostgreSQL مدمج مؤقت عبر PGlite.
- خريطة الفرونت إند: **18 شاشة و9 لوحات** تطابق manifest وتعريف Panel الفعليين.
- **26 فحصًا نجح**. التفاصيل الآلية في `design-validation.json`.

## ما اختُبر

- OpenAPI 3.0.3 schema, local references and operation definitions
- Unique operation identifiers
- All 18 actual Figma frames map to existing API operations or explicit local-only behavior
- Every current frontend panel is covered
- Contract declares private/admin access and provider authentication boundaries
- Path parameters, conditional checkout and server-owned completion contract
- Full SQL reference migration executes in embedded PostgreSQL
- Case-insensitive email uniqueness
- Unknown user role rejected
- Same social subject cannot bind two users
- Published pointer cannot reference another course
- Chapter positions are unique per version
- A lesson must belong to its chapter version
- Non-positive duration rejected
- Enrollment cannot point to another course version
- Duplicate user enrollment per version rejected
- Progress beyond 100 percent rejected
- Incomplete course cannot be marked completed by schema update
- Lesson progress cannot use another user enrollment
- Duplicate bookmark cannot be inserted
- Negative monetary amount rejected
- Verification provider must match product provider
- One purchase evidence cannot bind two accounts
- Duplicate provider webhook identity rejected
- Duplicate playback sequence rejected
- Certificate issuance is unique per enrollment

## الحدود

هذه فحوص تصميم وعقد وقيود بيانات، وليست اختبارات HTTP لسيرفر منفذ. لم تُختبر مصادقة فعلية أو شراء أو رفع فيديو أو push أو صدور شهادة من خدمة حقيقية. لم تُختبر معاملات متعددة الاتصالات أو load/production PostgreSQL. أنشأ fixture سجل شهادة لاختبار uniqueness فقط؛ تحقق أهلية إصدارها مسؤولية service قبل INSERT. لا يعني نجاح العقد أن كل قواعد الأمان أو العمل أصبحت مطبقة.

هذه فحوص مرجع التصميم؛ اختبارات الفرونت إند تخص العرض المحلي، وليست دليلًا على ربطه بالباك إند. راجع docs/reorganization.md في جذر المشروع لنتائج إعادة التنظيم اللاحقة.
