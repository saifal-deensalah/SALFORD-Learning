# تحليل الفرونت إند وربطه بالسيرفر

## ما تأكد من الكود

| الدليل | الموجود الآن | المطلوب فعليًا |
|---|---|---|
| `src/App.tsx` — `authenticate` | يتحقق من الشكل ثم Alert ويدخل Home؛ لا طلب شبكة | حسابات، جلسات، أخطاء وتحميل، تحقق البريد، واستعادة جلسة عند التشغيل |
| `src/App.tsx` — `profile` و`form` | اسم وبريد في ذاكرة الجلسة؛ لا حفظ عند إغلاق التطبيق | `/me`، تعديل اسم، تغيير بريد بتحقق مستقل، وعدم حفظ كلمة المرور |
| `src/data/courses.ts` | 7 دورات ثابتة، لا chapters/lessons ولا أسعار فعلية | catalog + category + instructor + course version + chapters + lessons |
| `src/App.tsx` — `dynamicSearch` | يستخدم مصفوفة الدورات فقط عندما يوجد نص أو filter؛ النتائج الافتراضية مرسومة في التصميم | ربط كل القوائم بالـAPI، حتى البحث الفارغ وHome وMy Courses |
| `src/App.tsx` — `currentCourse` | fallback باسم `ui-ux` غير موجود في قائمة الدورات | route يحمل UUID حقيقيًا للدورة ودرسًا محددًا؛ منع fallback وهمي |
| `src/App.tsx` — `chosenCourse` | يغير عنوان التفاصيل فقط؛ بعض الوصف والأعداد والدروس تبقى ثابتة | تعبئة وصف/صور/عدد الفصول والدروس والمدد والاسم من بيانات نفس الدورة |
| `src/state/useLearningState.ts` | مفتاح AsyncStorage واحد `salford.learning.v1`؛ bookmarks/history/progress/plan | بيانات حسابية من السيرفر وcache مفصول بـuserId؛ مسحها عند الخروج |
| `src/components/LessonPlayer.tsx` | فيديو محلي واحد 18 ثانية؛ آخر موضع محول إلى نسبة على مستوى الدورة | رابط HLS مؤقت، duration وresumePosition لكل lesson، session وheartbeats |
| `src/App.tsx` — `onComplete` | إنهاء عينة واحدة يجعل الدورة 100% وينشئ إتاحة شهادة محلية | إكمال الدروس المطلوبة ثم إصدار شهادة مرة واحدة من السيرفر |
| `src/App.tsx` — `renderCourseRow` | Share لنص تجريبي | PDF صادر من worker ورابط تحقق اختياري بإذن المستخدم |
| `src/App.tsx` — payment handlers | فحص test card ثم `setState({plan})` والانتقال مباشرة لنجاح | تحقق شراء لدى المزوّد، حالة pending ثم اشتراك معتمد من السيرفر |
| `src/App.tsx` — notifications | نص مولّد حسب الخطة وSwitch محلي | Inbox، حالة قراءة، تفضيل حسابي، token لكل جهاز وإذن نظام التشغيل |
| `src/design/screens.json` | عقد مرئي ثابت مبني من Figma | يبقى مرجعًا للمظهر فقط؛ لا يكون مصدر الأسعار أو المحتوى أو الصلاحيات |

لم تظهر مكتبة HTTP أو `fetch` أو عنوان API في ملفات التطبيق التي فُحصت. تخزين التعلم الحالي **لا يثبت هوية صاحبه أو استحقاقه**؛ لا يُرفع إلى الإنتاج كاشتراكات أو شهادات أو تقدم موثوق.

## خريطة الشاشات

جميع المسارات التالية مسبوقة بـ`/v1`. المصادقة مطلوبة إلا حيث يوضح العقد خلاف ذلك.

| الشاشة / frame | القراءة | الكتابة والسلوك |
|---|---|---|
| Splash 37 | محاولة refresh ثم `GET /me` عند وجود جلسة | لا يرسل طلبًا إذا لا يوجد token؛ onboarding محلي |
| Welcome 47 + OB1 420 + OB2 561 + OB3 804 | لا API مطلوب | حفظ اكتمال onboarding على الجهاز فقط |
| Login 818 | — | `POST /auth/login`، `POST /auth/social/challenges`، Google/Apple، reset requests |
| Google chooser 894 | SDK المزود | `POST /auth/social/google` بعد تسجيل حقيقي؛ شكل اختيار الحساب يتحكم به المزود |
| Sign up 985 | — | `POST /auth/register` ثم verify/resend؛ تأكيد كلمة المرور يفحص محليًا ولا يرسل |
| Home 1066 | `GET /home` | bookmark أو فتح دورة؛ كل قسم يعرض بيانات فعلية |
| Search 1189 | `GET /categories`، `GET /courses?q=&categoryId=&cursor=` | حفظ/إزالة bookmark، عرض empty/loading/error |
| Course details 1345 | `GET /courses/{id}` و`/curriculum` | `POST /courses/{id}/enrollments` قبل دراسة محتوى كامل |
| My courses 1479 | `GET /me/courses` | استئناف nextLessonId؛ لا تظهر نسبة 75% ثابتة لمستخدم جديد |
| Profile 1824 | `GET /me` | الوصول للسجل والشهادات والإعدادات وتعديل الملف |
| Plans 1874 | `GET /plans` و`GET /billing/options` | اختيار product مطابق للمنصة؛ السعر من المزوّد، وليس Figma |
| Payment 1951 | إعداد المزوّد وproduct | native store SDK ثم `POST /billing/purchases/verify`؛ external checkout فقط عند السماح |
| Success 2086 | polling لـverification + `GET /me/subscriptions` | تُعرض فقط بعد التحقق؛ حالات pending/failed/canceled ليست success |
| Course playing 2231 | curriculum + progress + playback session | heartbeats وpause/seek/end؛ السيرفر يحسب الإكمال |
| Home navigation 2314 | نفس Home، ثم API اللوحة المفتوحة | فتح/إغلاق القائمة لا يحتاج endpoint مستقلًا |

## اللوحات الإضافية وحالات الإنتاج

| الوظيفة | APIs |
|---|---|
| Bookmarks | GET `/me/bookmarks`، PUT/DELETE `/me/bookmarks/{courseId}` |
| History | GET `/me/history` من نشاط دروس موثق ومفصول حسب الحساب |
| Certificates | GET `/me/certificates`، GET download، public verify عند opt-in |
| Settings | GET/PATCH `/me/settings`، GET subscriptions، management-session |
| Notifications | GET `/me/notifications`، PUT read، PUT/DELETE device token |
| Edit profile | PATCH `/me` للاسم؛ POST `/me/email-change` لبريد جديد بعد إعادة مصادقة حديثة |
| Forgot password | POST reset-requests ثم شاشة جديدة لاستقبال الرابط وإرسال reset |
| Log out | إزالة device binding ثم POST logout، ومسح Secure Storage وcache محليًا حتى إن انقطع الاتصال |
| Delete account | DELETE `/me` بمصادقة حديثة؛ UI تأكيد وتنبيه لإدارة الاشتراك في المتجر |
| Restore purchase | استعلام المشتريات من SDK ثم verify لكل دليل؛ ليس تعديلًا محليًا للخطة |

التحقق من البريد، إتمام reset، إعادة المصادقة، الحذف، restore purchase وحالات تعذر الشبكة تحتاج UI إضافيًا بنفس أسلوب المشروع؛ لا يوجد لها frame كامل في الملف الأصلي. Dev gallery محلي فقط ولا يحتاج خدمة. لا توجد شاشات chat/reviews/quizzes/live classes؛ لم تُضف لها APIs افتراضية.

## ترتيب المخاطر عند الربط

1. **الاشتراك والشهادة لا يقررهما العميل**: لا endpoint من نوع `setPlan` أو `completeCourse(100)`.
2. **عزل الحسابات**: مفتاح AsyncStorage الحالي مشترك بين الدخول والخروج؛ الإنتاج يحتاج cache scoped إلى userId وإلغاء طلبات الحساب السابق.
3. **الدرس ليس الدورة**: آخر موضع مشاهدة قد يتراجع عند إعادة مشاهدة جزء، بينما التغطية المكتملة لا تتراجع. يلزم فصل resume عن completion.
4. **الدفع في المتاجر**: لا تُنقل بيانات Card/CVV من النموذج الحالي للسيرفر. Native billing أو hosted SDK يغيّر الجزء الحساس من الشاشة.
5. **الواجهات الثابتة تحتاج تحويلًا**: توفير API وحده لا يجعل الصور والأوصاف والدروس والأسعار المرسومة داخل SVG ديناميكية. تُستبدل مواضعها ببيانات ومكونات قابلة لإعادة الاستخدام مع الحفاظ على التصميم.
