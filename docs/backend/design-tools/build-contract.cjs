// Source for the proposed API contract. Does not implement any HTTP handlers.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ref = name => ({$ref: `#/components/schemas/${name}`});
const str = (extra = {}) => ({type: 'string', ...extra});
const uuid = () => str({format: 'uuid'});
const date = () => str({format: 'date-time'});
const bool = () => ({type: 'boolean'});
const int = (min = 0, max) => ({type: 'integer', minimum: min, ...(max === undefined ? {} : {maximum: max})});
const num = (min = 0, max) => ({type: 'number', minimum: min, ...(max === undefined ? {} : {maximum: max})});
const en = (...values) => str({enum: values});
const arr = (items, maxItems) => ({type: 'array', items, ...(maxItems ? {maxItems} : {})});
const obj = (properties, required = Object.keys(properties)) => ({type: 'object', additionalProperties: false, properties, ...(required.length ? {required} : {})});
const nullable = schema => ({...schema, nullable: true});
const email = () => str({format: 'email', maxLength: 254});
const secret = () => str({minLength: 1, maxLength: 16000, writeOnly: true});
const password = () => str({minLength: 12, maxLength: 128, writeOnly: true, description: 'Proposed policy; update the frontend 8-character demo validation.'});
const url = () => str({format: 'uri'});
const schemas = {
  Error: obj({error: obj({code: str(), message: str(), requestId: uuid(), fields: {type: 'object', additionalProperties: str()}}, ['code','message','requestId'])}),
  Accepted: obj({message: str({example: 'If eligible, you will receive an email.'})}),
  User: obj({id: uuid(), name: str(), email: email(), emailVerified: bool(), avatarUrl: nullable(url()), role: en('student','admin')}),
  Credentials: obj({email: email(), password: secret(), installationId: uuid(), rememberMe: bool()}),
  Registration: obj({email: email(), password: password(), name: str({maxLength: 100})}, ['email','password']),
  Session: obj({user: ref('User'), accessToken: str(), accessExpiresAt: date(), refreshToken: str(), refreshExpiresAt: date(), sessionId: uuid()}),
  Refresh: obj({refreshToken: secret(), installationId: uuid()}),
  SocialChallengeRequest: obj({provider: en('google','apple'), installationId: uuid()}),
  SocialChallenge: obj({challengeId: uuid(), nonce: str(), expiresAt: date()}),
  SocialLogin: obj({challengeId: uuid(), idToken: secret(), authorizationCode: secret(), installationId: uuid(), rememberMe: bool(), name: str({maxLength: 100})}, ['challengeId','idToken','installationId','rememberMe']),
  AppleSocialLogin: {allOf:[ref('SocialLogin'), {type:'object',required:['authorizationCode']}]},
  Settings: obj({learningNotifications: bool(), certificatePublic: bool()}),
  Category: obj({id: uuid(), slug: str(), name: str()}),
  Instructor: obj({id: uuid(), name: str(), bio: str(), avatarUrl: nullable(url())}),
  CourseSummary: obj({id: uuid(), slug: str(), title: str(), coverUrl: nullable(url()), instructor: ref('Instructor'), category: ref('Category'), accessType: en('free','subscription'), lessonCount: int(), durationSeconds: num(), saved: bool(), canAccess: bool()}),
  Lesson: obj({id: uuid(), title: str(), durationSeconds: num(), required: bool(), isPreview: bool(), sortOrder: int()}),
  Chapter: obj({id: uuid(), title: str(), sortOrder: int(), lessons: arr(ref('Lesson'))}),
  Curriculum: obj({courseId: uuid(), versionId: uuid(), chapters: arr(ref('Chapter'))}),
  CourseDetail: obj({course: ref('CourseSummary'), description: str(), publishedVersionId: uuid(), allowedPlanIds: arr(uuid()), accessReason: en('free','subscription','preview_only','subscription_required','unavailable')}),
  Enrollment: obj({id: uuid(), courseId: uuid(), courseVersionId: uuid(), progressPercent: num(0,100), completedAt: nullable(date()), lastActivityAt: nullable(date()), canAccess: bool()}),
  LibraryItem: obj({course: ref('CourseSummary'), enrollment: ref('Enrollment'), nextLessonId: nullable(uuid())}),
  LessonProgress: obj({lessonId: uuid(), lastPositionSeconds: num(), watchedSeconds: num(), completed: bool()}),
  CourseProgress: obj({enrollment: ref('Enrollment'), lessons: arr(ref('LessonProgress'))}),
  Playback: obj({playbackSessionId: uuid(), lessonId: uuid(), streamUrl: url(), expiresAt: date(), format: en('hls'), resumePositionSeconds: num(), durationSeconds: num(), heartbeatIntervalSeconds: int(5,60), progressAllowed: bool()}),
  PlaybackEvent: obj({eventId: uuid(), sequence: int(1), kind: en('heartbeat','pause','seek','ended'), positionSeconds: num(), playbackRate: num(0.5,2)}),
  PlaybackResult: obj({acceptedEventIds: arr(uuid()), lesson: ref('LessonProgress'), enrollment: nullable(obj({id: uuid(), progressPercent: num(0,100), completed: bool()})), nextSequence: int(1)}),
  Product: obj({id: uuid(), provider: en('apple','google','stripe'), productId: str(), offerId: str(), interval: en('month','year'), displayPrice: nullable(str()), currency: nullable(str()), amountMinor: nullable(int()), environment: en('sandbox','production')}),
  Plan: obj({id: uuid(), code: str(), name: str(), features: arr(str()), certificateEnabled: bool(), products: arr(ref('Product'))}),
  Subscription: obj({id: uuid(), planId: uuid(), provider: en('apple','google','stripe'), status: en('pending','active','grace','on_hold','expired','revoked'), periodEnd: date(), autoRenew: bool(), cancelAtPeriodEnd: bool(), accessActive: bool()}),
  BillingOptions: obj({methods: arr(en('apple_iap','google_play','external_checkout')), externalCheckoutEnabled: bool(), accountBindingId: str(), restoreSupported: bool()}),
  ApplePurchase: obj({provider: en('apple'), productId: uuid(), signedTransaction: secret()}),
  GooglePurchase: obj({provider: en('google'), productId: uuid(), purchaseToken: secret()}),
  PurchaseRequest: {oneOf: [ref('ApplePurchase'), ref('GooglePurchase')]},
  Verification: obj({id: uuid(), status: en('pending','verified','rejected'), subscriptionId: nullable(uuid()), failureCode: nullable(str())}),
  Checkout: obj({id: uuid(), status: en('pending','processing','succeeded','failed','expired'), checkoutUrl: nullable(url()), expiresAt: date(), subscriptionId: nullable(uuid())}),
  ManageBilling: obj({url: url(), expiresAt: nullable(date()), provider: en('apple','google','stripe')}),
  Certificate: obj({id: uuid(), courseId: uuid(), learnerName: str(), courseTitle: str(), status: en('generating','issued','failed','revoked'), issuedAt: nullable(date()), publicCode: nullable(str()), verificationUrl: nullable(url())}),
  Download: obj({url: url(), expiresAt: date()}),
  PublicCertificate: obj({valid: bool(), courseTitle: str(), learnerDisplayName: str(), issuedAt: date()}),
  Notification: obj({id: uuid(), kind: en('learning','billing','certificate','security'), title: str(), body: str(), createdAt: date(), readAt: nullable(date()), target: nullable(obj({type: en('course','certificate','subscription'), id: uuid()}))}),
  Device: obj({installationId: uuid(), platform: en('android','ios'), pushToken: secret(), permission: en('granted','denied','provisional')}),
  Home: obj({user: ref('User'), categories: arr(ref('Category')), trending: arr(ref('CourseSummary')), popular: arr(ref('CourseSummary')), continueLearning: arr(ref('LibraryItem')), unreadNotifications: int()}),
  UploadRequest: obj({kind: en('image','video'), mimeType: str(), byteSize: int(1), checksumSha256: str({pattern: '^[a-f0-9]{64}$'})}),
  Upload: obj({assetId: uuid(), uploadUrl: url(), expiresAt: date(), headers: {type: 'object', additionalProperties: str()}}),
  Asset: obj({id: uuid(), status: en('pending','uploaded','processing','ready','failed'), kind: en('image','video','certificate'), durationSeconds: nullable(num()), url: nullable(url())}),
  CourseCreate: obj({slug: str({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'}), title: str({minLength: 1,maxLength: 200}), categoryId: uuid(), instructorId: uuid(), accessType: en('free','subscription'), certificateEnabled: bool()}),
  LessonDraft: obj({title: str({minLength: 1,maxLength: 200}), description: str({maxLength: 10000}), mediaAssetId: uuid(), required: bool(), isPreview: bool()}),
  ChapterDraft: obj({title: str({minLength: 1,maxLength: 200}), lessons: arr(ref('LessonDraft'),200)}),
  CourseDraft: obj({title: str({minLength: 1,maxLength: 200}), description: str({maxLength: 20000}), coverAssetId: uuid(), categoryId: uuid(), instructorId: uuid(), accessType: en('free','subscription'), certificateEnabled: bool(), featuredRank: nullable(int()), chapters: arr(ref('ChapterDraft'),100)}),
  DraftResult: obj({courseId: uuid(), versionId: uuid(), status: en('draft','published','archived')}),
  PlanWrite: obj({code: str({minLength: 1,maxLength: 50}), name: str({minLength: 1,maxLength: 100}), features: arr(str({maxLength: 200}),30), certificateEnabled: bool(), courseIds: arr(uuid(),10000), active: bool()}),
  ProductWrite: obj({provider: en('apple','google','stripe'), environment: en('sandbox','production'), productId: str({maxLength: 255}), offerId: str({maxLength: 255}), interval: en('month','year'), active: bool()}),
  DeleteRequest: obj({status: en('pending','processing','completed','failed'), requestedAt: date()}),
  Health: obj({status: en('ok','degraded'), version: str()})
};
const page = name => {
  const model = `${name}Page`;
  schemas[model] = obj({items: arr(ref(name)), nextCursor: nullable(str())});
  return ref(model);
};
const pagination = [
  {name:'cursor', in:'query', schema:str(), description:'Opaque cursor bound to filters and stable sort; omit for first page.'},
  {name:'limit', in:'query', schema:{...int(1,100), default:20}}
];
const query = (name,schema,required=false) => ({name,in:'query',required,schema});
const body = schema => ({required:true, content:{'application/json':{schema}}});
const response = (schema,description='Success') => ({description, ...(schema ? {content:{'application/json':{schema:obj({data:schema})}}} : {})});
const errors = Object.fromEntries([400,401,403,404,409,422,429,503].map(code => [code,{$ref:'#/components/responses/ApiError'}]));
const paths = {};
function endpoint(method, route, operationId, tag, summary, output, options={}) {
  const parameters = [...(options.params || [])];
  for (const [,name] of route.matchAll(/\{([^}]+)\}/g)) {
    parameters.unshift({name,in:'path',required:true,schema:name==='code' ? str({minLength:24,maxLength:128}) : uuid()});
  }
  if (options.idempotent) parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:uuid(),description:'Same key + body returns original response; changed body returns 409. Minimum retention 24h.'});
  const operation = {
    operationId,tags:[tag],summary,description:options.description || summary,
    'x-phase':options.phase || 'core',
    'x-roles':options.roles || ['student','admin'],
    responses:{[options.status || (output ? 200 : 204)]:response(output),...errors},
    ...(parameters.length ? {parameters} : {}),
    ...(options.input ? {requestBody:body(options.input)} : {}),
    ...(options.public ? {security:[]} : {}),
    ...(options.recent ? {'x-requires-recent-authentication-seconds':300} : {})
  };
  paths[route] ||= {};
  paths[route][method] = operation;
}
const ep=endpoint;
const publicAuth={public:true,roles:['public']};
ep('post','/auth/register','register','Auth','Register with email; send verification email',ref('Accepted'),{...publicAuth,status:202,input:ref('Registration'),description:'Generic 202 for new and existing email addresses. Queue verification email via transactional outbox. Does not create an authenticated session.'});
ep('post','/auth/login','login','Auth','Create an authenticated device session',ref('Session'),{...publicAuth,input:ref('Credentials'),description:'Generic invalid-credentials response. Password hashing and rate limiting are server-side. Unverified users can browse, but cannot enroll or purchase.'});
ep('post','/auth/refresh','refreshSession','Auth','Rotate a refresh token',ref('Session'),{...publicAuth,input:ref('Refresh'),description:'Consume exactly once in a transaction; replay revokes the family. Client must serialize refresh requests. Refresh retains original auth_time.'});
ep('post','/auth/logout','logout','Auth','Revoke the current session family',null);
ep('post','/auth/logout-all','logoutAll','Auth','Revoke all sessions for this user',null,{recent:true});
ep('post','/auth/email/verification-requests','requestVerification','Auth','Request verification email',ref('Accepted'),{...publicAuth,status:202,input:obj({email:email()})});
ep('post','/auth/email/verify','verifyEmail','Auth','Consume a one-time verification token',ref('Accepted'),{...publicAuth,input:obj({token:secret()})});
ep('post','/auth/password/reset-requests','requestPasswordReset','Auth','Request password reset without account enumeration',ref('Accepted'),{...publicAuth,status:202,input:obj({email:email()})});
ep('post','/auth/password/reset','resetPassword','Auth','Reset password and revoke all sessions',ref('Accepted'),{...publicAuth,input:obj({token:secret(),newPassword:password()})});
ep('post','/auth/social/challenges','createSocialChallenge','Auth','Issue a short-lived nonce for native provider sign-in',ref('SocialChallenge'),{...publicAuth,status:201,input:ref('SocialChallengeRequest')});
for(const provider of ['google','apple']) ep('post',`/auth/social/${provider}`,`login${provider[0].toUpperCase()+provider.slice(1)}`,'Auth',`Verify ${provider} identity and issue app tokens`,ref('Session'),{...publicAuth,input:ref(provider==='apple'?'AppleSocialLogin':'SocialLogin'),description:'Verify signature, issuer, audience, expiry and challenge nonce on backend; consume nonce once. Apple authorizationCode is required by its adapter for server exchange/revocation. Do not automatically link accounts by matching email. A real native SDK replaces the Figma chooser.'});

ep('get','/me','getMe','Profile','Load current profile',ref('User'));
ep('patch','/me','updateMe','Profile','Update profile name',ref('User'),{input:obj({name:str({minLength:1,maxLength:100})})});
ep('post','/me/email-change','requestEmailChange','Profile','Verify a replacement email before changing it',ref('Accepted'),{status:202,recent:true,input:obj({newEmail:email()}),description:'Current email remains until a single-use change-email token is consumed at /auth/email/verify. Notify old address; reject duplicates safely; revoke old sessions on completion.'});
ep('get','/me/settings','getSettings','Profile','Load notification and sharing preferences',ref('Settings'));
ep('patch','/me/settings','updateSettings','Profile','Update account preferences',ref('Settings'),{input:{...obj({learningNotifications:bool(),certificatePublic:bool()},[]),minProperties:1}});
ep('delete','/me','deleteAccount','Profile','Request account deletion and revoke sessions',ref('DeleteRequest'),{status:202,recent:true,idempotent:true,description:'Reject unauthorized requests. Disable account immediately; enqueue anonymization and data erasure. Store billing management instructions before deletion; deleting an account does not automatically cancel an Apple/Google subscription.'});

ep('get','/home','getHome','Catalog','Load home sections and user summary',ref('Home'));
ep('get','/categories','listCategories','Catalog','List active filter categories',arr(ref('Category')));
ep('get','/courses','listCourses','Catalog','Search the live course catalog',page('CourseSummary'),{params:[...pagination,query('q',str({maxLength:100})),query('categoryId',uuid()),query('sort',en('relevance','popular','newest'))],description:'Combine title/instructor search with category. Return [] for empty matches. Stable tie-breaker id. Never return draft courses or protected stream URLs.'});
ep('get','/courses/{courseId}','getCourse','Catalog','Load course description and access state',ref('CourseDetail'));
ep('get','/courses/{courseId}/curriculum','getCurriculum','Catalog','Load chapters and lessons for a version',ref('Curriculum'),{params:[query('versionId',uuid())],description:'Defaults to published version. A non-current version requires an owned enrollment for that version. Metadata only, no video URL.'});

ep('put','/me/bookmarks/{courseId}','saveBookmark','Library','Save a course idempotently',null);
ep('delete','/me/bookmarks/{courseId}','removeBookmark','Library','Remove a saved course idempotently',null);
ep('get','/me/bookmarks','listBookmarks','Library','List saved course cards',page('CourseSummary'),{params:pagination});
ep('post','/courses/{courseId}/enrollments','enroll','Learning','Enroll in the current published course version',ref('Enrollment'),{status:201,idempotent:true,description:'Require verified email and free access or verified plan coverage; return existing enrollment for the same user and version. Bookmarking alone never enrolls or grants paid access.'});
ep('get','/me/courses','listMyCourses','Learning','List enrolled courses with authoritative progress',page('LibraryItem'),{params:[...pagination,query('status',en('in_progress','completed','all'))]});
ep('get','/me/history','getHistory','Learning','List recently studied courses',page('LibraryItem'),{params:pagination});
ep('get','/me/enrollments/{enrollmentId}/progress','getProgress','Learning','Load course and per-lesson progress',ref('CourseProgress'));
ep('post','/lessons/{lessonId}/playback-sessions','startPlayback','Learning','Authorize playback and issue short-lived HLS URL',ref('Playback'),{status:201,input:obj({enrollmentId:uuid()},[]),description:'Check ownership, course version, email verification and current entitlement. Preview without enrollment is allowed only for an isPreview lesson and cannot earn completion. Signed URL must authorize playlist AND segments. A new session also renews an expired stream URL.'});
ep('post','/playback-sessions/{playbackSessionId}/events','recordPlayback','Learning','Submit ordered playback heartbeats',ref('PlaybackResult'),{input:obj({events:{...arr(ref('PlaybackEvent'),20),minItems:1}}),description:'Owner only; dedupe eventId and session/sequence; same identity with changed payload =409. Client supplies position, never percentage/completed/watchedSeconds. Server merges validated watched intervals and computes aggregate progress. Seek/end alone cannot award a certificate. Expired session returns 409 PLAYBACK_SESSION_EXPIRED; no offline completion credit in v1.'});

ep('get','/plans','listPlans','Billing','Load active subscription plans and store product mappings',arr(ref('Plan')),{description:'No hardcoded $9.99 or $250. Display native store localized price from matched products; server price is authoritative only for enabled external checkout.'});
ep('get','/billing/options','getBillingOptions','Billing','Load available purchase channels and account binding',ref('BillingOptions'),{params:[query('platform',en('ios','android'),true)],description:'Platform is a UX hint, never proof that external checkout is permitted. Server deployment/storefront policy controls externalCheckoutEnabled; default false.'});
ep('post','/billing/purchases/verify','verifyPurchase','Billing','Queue verification of a native store purchase',ref('Verification'),{status:202,input:ref('PurchaseRequest'),idempotent:true,description:'Require verified account. Verify actual provider purchase/product/package/bundle/environment/account binding. Same evidence cannot belong to two users. Restore uses this same endpoint for each store-owned purchase.'});
ep('get','/billing/verifications/{verificationId}','getVerification','Billing','Poll verification result after purchase or restore',ref('Verification'));
ep('get','/me/subscriptions','getSubscriptions','Billing','Load authoritative subscription states',arr(ref('Subscription')));
ep('post','/me/subscriptions/{subscriptionId}/management-session','manageSubscription','Billing','Open provider-managed cancellation or plan change',ref('ManageBilling'),{description:'Apple/Google return allowlisted subscription-management links. Enabled external provider returns a short-lived customer portal URL. Do not promise cancellation until verified provider state arrives.'});
ep('post','/billing/checkout-sessions','createCheckout','Billing','Create optional external hosted checkout',ref('Checkout'),{phase:'conditional',status:201,input:obj({productId:uuid()}),idempotent:true,description:'Disabled unless deployment/distribution policy and merchant availability are approved. Return 403 CHANNEL_NOT_ALLOWED otherwise. Server controls amount, currency, customer and allowlisted return URLs. Never accept PAN/CVV or arbitrary redirect URLs.'});
ep('get','/billing/checkout-sessions/{checkoutId}','getCheckout','Billing','Poll verified hosted checkout state',ref('Checkout'),{phase:'conditional',description:'Only succeeded after provider verification and subscription transaction. Client redirect/success callback is not proof of payment.'});

ep('get','/me/certificates','listCertificates','Certificates','List server-issued course certificates',page('Certificate'),{params:pagination});
ep('get','/me/certificates/{certificateId}/download','downloadCertificate','Certificates','Issue a short-lived PDF download URL',ref('Download'),{description:'Owner only; 409 CERTIFICATE_NOT_READY while generating; revoked certificates cannot be downloaded.'});
ep('get','/certificates/verify/{code}','verifyCertificate','Certificates','Verify a shared certificate with minimal public information',ref('PublicCertificate'),{public:true,roles:['public'],description:'Random non-enumerable code; no email/user id. Sharing must be opted in. Private, missing or revoked codes return a generic 404. Never imply external accreditation.'});

ep('get','/me/notifications','listNotifications','Notifications','Load inbox notifications',page('Notification'),{params:[...pagination,query('unreadOnly',bool())]});
ep('put','/me/notifications/{notificationId}/read','readNotification','Notifications','Mark owned notification as read',null);
ep('put','/me/devices/{installationId}','registerDevice','Notifications','Upsert a device push token for this user',null,{input:ref('Device'),description:'Body installationId must equal path. Transfer token atomically on login; never let one token keep delivering two users private messages.'});
ep('delete','/me/devices/{installationId}','unregisterDevice','Notifications','Remove this user device binding on logout',null);

const admin={roles:['admin'],phase:'admin'};
ep('post','/admin/categories','createCategory','Admin','Create a category',ref('Category'),{...admin,status:201,input:obj({slug:str({maxLength:100}),name:str({maxLength:100})})});
ep('patch','/admin/categories/{categoryId}','updateCategory','Admin','Update or hide a category',ref('Category'),{...admin,input:obj({name:str({maxLength:100}),active:bool()})});
ep('post','/admin/instructors','createInstructor','Admin','Create an instructor profile',ref('Instructor'),{...admin,status:201,input:obj({name:str({maxLength:100}),bio:str({maxLength:5000})})});
ep('patch','/admin/instructors/{instructorId}','updateInstructor','Admin','Update an instructor profile',ref('Instructor'),{...admin,input:obj({name:str({maxLength:100}),bio:str({maxLength:5000})})});
ep('post','/admin/assets/upload-sessions','createUpload','Admin','Create a restricted direct upload URL',ref('Upload'),{...admin,status:201,input:ref('UploadRequest'),description:'Allowlisted MIME, size quotas, generated object key, expiry and checksum. Object storage upload must match policy. No remote-URL fetch/SSRF endpoint.'});
ep('post','/admin/assets/{assetId}/complete','completeUpload','Admin','Verify object and queue media processing',ref('Asset'),{...admin,status:202,description:'HEAD/checksum/MIME sniff and malware validation; do not trust the client completion flag. Only ready assets can be published.'});
ep('get','/admin/assets/{assetId}','getAsset','Admin','Poll video processing status',ref('Asset'),admin);
ep('get','/admin/courses','adminListCourses','Admin','List catalog including drafts and archived courses',page('DraftResult'),{...admin,params:pagination});
ep('post','/admin/courses','createCourse','Admin','Create a draft course',ref('DraftResult'),{...admin,status:201,input:ref('CourseCreate')});
ep('put','/admin/courses/{courseId}/draft','saveCourseDraft','Admin','Replace the unpublished curriculum draft',ref('DraftResult'),{...admin,input:ref('CourseDraft'),description:'Array order becomes sortOrder. Generate stable UUIDs for the new draft lessons. Never mutate a published version with enrolled students. Duration comes from verified media metadata.'});
ep('post','/admin/courses/{courseId}/publish','publishCourse','Admin','Publish a complete and playable draft',ref('DraftResult'),{...admin,input:obj({versionId:uuid()}),description:'Transaction locks course; require ready media, at least one required lesson, matching chapters, and valid plan coverage for subscription content. Set published pointer and freeze version.'});
ep('post','/admin/courses/{courseId}/archive','archiveCourse','Admin','Remove course from discovery without deleting student records',ref('DraftResult'),admin);
ep('post','/admin/plans','createPlan','Admin','Create an inactive plan or publish valid plan mapping',ref('Plan'),{...admin,status:201,input:ref('PlanWrite')});
ep('put','/admin/plans/{planId}','updatePlan','Admin','Update plan coverage and presentation',ref('Plan'),{...admin,input:ref('PlanWrite'),description:'Audit changes. Reject coverage/benefit changes with 409 when this plan has any active paid period; create a new plan/product for new terms. Never silently remove promised access during a paid period.'});
ep('post','/admin/plans/{planId}/products','mapProduct','Admin','Map an existing provider product to a plan',ref('Product'),{...admin,status:201,input:ref('ProductWrite'),description:'Validate provider product exists and matches environment and interval. Cannot invent a price in client requests. Plan cannot become active until required store product mappings exist.'});

for (const provider of ['apple','google','stripe']) {
  const route=`/webhooks/${provider}`;
  ep('post',route,`receive${provider[0].toUpperCase()+provider.slice(1)}Event`,'Webhooks',`Receive verified ${provider} billing events`,null,{public:true,roles:['provider'],phase:provider==='stripe'?'conditional':'core',status:204,description:'Not public-trusted: validate provider signature/authentication before durable inbox insert, deduplicate event, then acknowledge. Re-fetch provider state; process via retryable worker; do not trust delivery order.'});
  const op=paths[route].post;
  op['x-provider-authentication']=provider==='apple'?'Validate signedPayload JWS chain, environment and bundleId':provider==='google'?'Validate Pub/Sub OIDC bearer issuer, audience, service-account email; re-fetch purchase state':'Verify Stripe-Signature against raw bytes and timestamp';
  op.requestBody=body(provider==='apple'?obj({signedPayload:secret()}):provider==='google'?{...obj({message:{...obj({data:str(),messageId:str(),publishTime:date()},['data','messageId']),additionalProperties:true},subscription:str()}),additionalProperties:true}:{type:'object',additionalProperties:true,description:'Original Stripe event JSON. Preserve raw request bytes for verification.'});
  if(provider==='stripe') op.parameters=[{name:'Stripe-Signature',in:'header',required:true,schema:str()}];
  if(provider==='google') op.security=[{pubsubBearer:[]}];
}
ep('get','/health/live','liveness','Operations','Check process liveness',ref('Health'),{public:true,roles:['probe'],phase:'ops'});
ep('get','/health/ready','readiness','Operations','Check dependency readiness',ref('Health'),{public:true,roles:['probe'],phase:'ops',description:'Expose to infrastructure/private ingress only. 503 when required database/queue dependencies fail; never expose credentials or database internals.'});

const contract = {
  openapi:'3.0.3',
  info:{title:'SALFORD backend API — proposed contract',version:'1.0.0-design',description:'Design artifact only; no backend service is implemented. All paths are relative to /v1. UUIDs are server identifiers, never Figma node ids. Authenticated requests derive the user from the bearer token. See docs/architecture.md for invariants and conditional billing channels.'},
  servers:[{url:'https://api.example.com/v1',description:'Placeholder; replace before use'},{url:'http://10.0.2.2:3000/v1',description:'Proposed Android emulator development endpoint; no server is running'}],
  security:[{bearerAuth:[]}],
  tags:[...new Set(Object.values(paths).flatMap(p=>Object.values(p).flatMap(o=>o.tags)))].map(name=>({name})),
  paths,
  components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'},pubsubBearer:{type:'http',scheme:'bearer',bearerFormat:'Google OIDC JWT'}},schemas,responses:{ApiError:{description:'Structured error; 429 includes Retry-After. Ownership failures use 404; unauthenticated requests use 401.',headers:{'Retry-After':{schema:int(1),description:'Only for 429/temporary failures'}},content:{'application/json':{schema:ref('Error')}}}}}
};
fs.writeFileSync(path.join(root,'openapi.json'),JSON.stringify(contract,null,2)+'\n');
const operations=Object.entries(paths).flatMap(([route,methods])=>Object.entries(methods).map(([method,o])=>({method:method.toUpperCase(),route,...o})));
fs.writeFileSync(path.join(root,'docs','api-index.md'),`# API index\n\nProposed contract, not implemented endpoints. Prefix: \`/v1\`. Generated from \`design-tools/build-contract.cjs\`.\n\n${operations.length} operations; ${Object.keys(paths).length} paths. All response/request models, validation and security are in \`openapi.json\`.\n\n| Method | Path | Operation | Access | Phase |\n|---|---|---|---|---|\n`+operations.map(o=>`| ${o.method} | \`${o.route}\` | ${o.summary} | ${o['x-roles'].join(', ')} | ${o['x-phase']} |`).join('\n')+'\n');
console.log(`Generated ${operations.length} operations, ${Object.keys(schemas).length} schemas.`);
