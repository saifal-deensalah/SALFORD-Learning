# Figma student UI restoration

## Provenance

The `canvas.fig` member of the original `.fig.zip` and `frontend/design/source/canvas.fig`
both have SHA-256 `8755BC886BAA810BA600FCD7C8CCE326DD75E51CD9277C2C1A528209E835F4B9`.
The runtime scene graph is generated in `frontend/src/design/screens.json`; it is not a
hand-redrawn approximation.

## Routing and ownership

- No session: `LearningApp` renders Figma splash, onboarding, login and sign-up.
- `student`: `StudentApp` renders Figma student presentation with the existing API/session logic.
- `admin`: `AdminApp` remains unchanged and owns the mobile administration experience.

`useData` now lives in `frontend/src/services/useData.ts` so server loading, error and reload
behavior is independent from either the old generic widgets or the Figma presentation.

## Screen map

| Figma frame | Connected student experience |
| --- | --- |
| `37`, `47`, `420`, `561`, `804` | Splash, welcome and the three onboarding screens |
| `818`, `894`, `985` | Login, login error and registration with the real auth API |
| `1066` Home | `/home`, real user, trending/popular/continue learning |
| `1189` Search course | `/categories`, `/courses`, query and category filters |
| `1345` Course details | `/courses/:id`, curriculum and enrollment before protected playback |
| `1479` My courses | `/me/courses` and `/me/history`, real progress |
| `1824` Profile | `/me`, settings, subscriptions, saved/history/certificates |
| `1874`, `1951`, `2086` | Existing server-priced demo subscription/payment flow |
| `2231` Course playing | Playback grants, video and server-confirmed progress |
| `2314` Navigation | Figma radial navigation; no second bottom navigation |

Notifications, saved courses, history, certificates, and detailed settings have no dedicated
frames in the supplied Figma file. They use the same palette, typography, rounded cards and
header language rather than inventing a second navigation system.

All values in the authenticated student path are loaded through `frontend/src/services/api.ts`.
The student components do not import `frontend/src/data/courses.ts`; that file is retained only
for the unauthenticated Figma development/gallery path. The local PostgreSQL database currently
contains seven records created by `backendCSC/src/seed.ts`, including sample course names and an
18-second sample video. They are real database/API records, but they remain demonstration content
until an administrator replaces them with licensed course material. Billing is also configured as
local demo billing; it stores server-side records but does not charge real money.

Seeded course covers are copied byte-for-byte from the supplied Figma archive into
`backendCSC/assets/course-covers`. They are uploaded as normal media assets and returned by the
course API. The live local database was migrated through the admin upload/draft/publish endpoints;
the authenticated UI does not select cover placeholders by title.

## Exactness limit

The supplied Figma document uses Clash Display (multiple weights) and Montserrat. Only
`Montserrat-Medium.ttf` is present in the Android project. Static SVG text and shapes therefore
retain the exact decoded Figma geometry, while dynamic API text uses the bundled Montserrat font
and synthetic weight. Literal pixel-for-pixel typography requires adding the licensed Clash
Display font files and their exact weights; they were not downloaded or substituted without a
license.

## Admin

Mobile admin is `frontend/src/admin/AdminApp.tsx`; desktop admin is
`admin-dashboard/src/App.tsx`. Both require an authenticated user whose exact role is `admin`.
The local seed stores private demo credentials in
`backendCSC/.local/local-app/demo-accounts.json`. Read that local file to log in; do not copy its
password into documentation or source control.
