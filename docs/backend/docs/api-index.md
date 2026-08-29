# API index

Proposed contract, not implemented endpoints. Prefix: `/v1`. Generated from `design-tools/build-contract.cjs`.

67 operations; 61 paths. All response/request models, validation and security are in `openapi.json`.

| Method | Path | Operation | Access | Phase |
|---|---|---|---|---|
| POST | `/auth/register` | Register with email; send verification email | public | core |
| POST | `/auth/login` | Create an authenticated device session | public | core |
| POST | `/auth/refresh` | Rotate a refresh token | public | core |
| POST | `/auth/logout` | Revoke the current session family | student, admin | core |
| POST | `/auth/logout-all` | Revoke all sessions for this user | student, admin | core |
| POST | `/auth/email/verification-requests` | Request verification email | public | core |
| POST | `/auth/email/verify` | Consume a one-time verification token | public | core |
| POST | `/auth/password/reset-requests` | Request password reset without account enumeration | public | core |
| POST | `/auth/password/reset` | Reset password and revoke all sessions | public | core |
| POST | `/auth/social/challenges` | Issue a short-lived nonce for native provider sign-in | public | core |
| POST | `/auth/social/google` | Verify google identity and issue app tokens | public | core |
| POST | `/auth/social/apple` | Verify apple identity and issue app tokens | public | core |
| GET | `/me` | Load current profile | student, admin | core |
| PATCH | `/me` | Update profile name | student, admin | core |
| DELETE | `/me` | Request account deletion and revoke sessions | student, admin | core |
| POST | `/me/email-change` | Verify a replacement email before changing it | student, admin | core |
| GET | `/me/settings` | Load notification and sharing preferences | student, admin | core |
| PATCH | `/me/settings` | Update account preferences | student, admin | core |
| GET | `/home` | Load home sections and user summary | student, admin | core |
| GET | `/categories` | List active filter categories | student, admin | core |
| GET | `/courses` | Search the live course catalog | student, admin | core |
| GET | `/courses/{courseId}` | Load course description and access state | student, admin | core |
| GET | `/courses/{courseId}/curriculum` | Load chapters and lessons for a version | student, admin | core |
| PUT | `/me/bookmarks/{courseId}` | Save a course idempotently | student, admin | core |
| DELETE | `/me/bookmarks/{courseId}` | Remove a saved course idempotently | student, admin | core |
| GET | `/me/bookmarks` | List saved course cards | student, admin | core |
| POST | `/courses/{courseId}/enrollments` | Enroll in the current published course version | student, admin | core |
| GET | `/me/courses` | List enrolled courses with authoritative progress | student, admin | core |
| GET | `/me/history` | List recently studied courses | student, admin | core |
| GET | `/me/enrollments/{enrollmentId}/progress` | Load course and per-lesson progress | student, admin | core |
| POST | `/lessons/{lessonId}/playback-sessions` | Authorize playback and issue short-lived HLS URL | student, admin | core |
| POST | `/playback-sessions/{playbackSessionId}/events` | Submit ordered playback heartbeats | student, admin | core |
| GET | `/plans` | Load active subscription plans and store product mappings | student, admin | core |
| GET | `/billing/options` | Load available purchase channels and account binding | student, admin | core |
| POST | `/billing/purchases/verify` | Queue verification of a native store purchase | student, admin | core |
| GET | `/billing/verifications/{verificationId}` | Poll verification result after purchase or restore | student, admin | core |
| GET | `/me/subscriptions` | Load authoritative subscription states | student, admin | core |
| POST | `/me/subscriptions/{subscriptionId}/management-session` | Open provider-managed cancellation or plan change | student, admin | core |
| POST | `/billing/checkout-sessions` | Create optional external hosted checkout | student, admin | conditional |
| GET | `/billing/checkout-sessions/{checkoutId}` | Poll verified hosted checkout state | student, admin | conditional |
| GET | `/me/certificates` | List server-issued course certificates | student, admin | core |
| GET | `/me/certificates/{certificateId}/download` | Issue a short-lived PDF download URL | student, admin | core |
| GET | `/certificates/verify/{code}` | Verify a shared certificate with minimal public information | public | core |
| GET | `/me/notifications` | Load inbox notifications | student, admin | core |
| PUT | `/me/notifications/{notificationId}/read` | Mark owned notification as read | student, admin | core |
| PUT | `/me/devices/{installationId}` | Upsert a device push token for this user | student, admin | core |
| DELETE | `/me/devices/{installationId}` | Remove this user device binding on logout | student, admin | core |
| POST | `/admin/categories` | Create a category | admin | admin |
| PATCH | `/admin/categories/{categoryId}` | Update or hide a category | admin | admin |
| POST | `/admin/instructors` | Create an instructor profile | admin | admin |
| PATCH | `/admin/instructors/{instructorId}` | Update an instructor profile | admin | admin |
| POST | `/admin/assets/upload-sessions` | Create a restricted direct upload URL | admin | admin |
| POST | `/admin/assets/{assetId}/complete` | Verify object and queue media processing | admin | admin |
| GET | `/admin/assets/{assetId}` | Poll video processing status | admin | admin |
| GET | `/admin/courses` | List catalog including drafts and archived courses | admin | admin |
| POST | `/admin/courses` | Create a draft course | admin | admin |
| PUT | `/admin/courses/{courseId}/draft` | Replace the unpublished curriculum draft | admin | admin |
| POST | `/admin/courses/{courseId}/publish` | Publish a complete and playable draft | admin | admin |
| POST | `/admin/courses/{courseId}/archive` | Remove course from discovery without deleting student records | admin | admin |
| POST | `/admin/plans` | Create an inactive plan or publish valid plan mapping | admin | admin |
| PUT | `/admin/plans/{planId}` | Update plan coverage and presentation | admin | admin |
| POST | `/admin/plans/{planId}/products` | Map an existing provider product to a plan | admin | admin |
| POST | `/webhooks/apple` | Receive verified apple billing events | provider | core |
| POST | `/webhooks/google` | Receive verified google billing events | provider | core |
| POST | `/webhooks/stripe` | Receive verified stripe billing events | provider | conditional |
| GET | `/health/live` | Check process liveness | probe | ops |
| GET | `/health/ready` | Check dependency readiness | probe | ops |
