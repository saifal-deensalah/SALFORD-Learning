# Verification — 27 August 2026

Latest relocation/refactor check: **29 frontend tests passed** and Android rebuilt successfully from `frontend/android`. The earlier 27-test baseline below is preserved for context. See [reorganization verification](../../docs/reorganization.md) for the new paths, checks and remaining warnings.

## Executed

- `npm run typecheck`: passed with no TypeScript errors.
- `npm run lint -- --quiet`: passed with no ESLint errors.
- `npm run test:ci -- --silent`: **27 tests passed**, including rendering each of the 18 frames, onboarding, form validation, test checkout, native-video event handling, persistence sanitization and empty search results.
- Android `gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64`: **BUILD SUCCESSFUL**. Installed and launched the APK on the running Android 15 emulator (1080×2400, 420 dpi).
- Native screen inspection: all 17 non-splash frame routes were confirmed in the Android accessibility tree; splash was also rendered and captured. Screenshots live in `artifacts/screenshots/`.
- Actual device interaction checks passed: onboarding → login; validation and explicit demo login; search → save → details; video playback → completion → certificate; plan → test payment → success → courses; saved bookmark restored after stopping and restarting the app process.
- Native Home carousel swipe passed: the second course moved left from x=670 to x=465 after a horizontal swipe. Recorded in `artifacts/carousel-check.json`.

`artifacts/flow-checks.json` records the device flow results. The runner was resumed during verification to account for emulator rendering/startup delays. The checks use only fabricated credentials and the explicitly allowed test card; no real authentication, payment or sharing was performed.

## Visual checks and fixes

Compared locally reconstructed Figma references against native screenshots. Fixed intrinsic image sizing, thin zero-width vector strokes, alpha-mask rendering on Android, and text-path overhead. Reused the actual source images, vectors, mixed typography runs, colors and dimensions. Inputs and dynamic data are native controls. Home carousels use native horizontal scrolling.

Inspected the final 18-frame contact sheet in `artifacts/android-contact-sheet.png`, including the onboarding illustrations, course images and the payment-success seal. The capture runner waits after confirming each screen to avoid capturing the preceding route.

The native screenshots contain the device's real status and navigation bars. The original design includes an iOS status bar and fixed 390×844 frames. Safe-area spacing and floating-menu placement adapt to the device. Screen content can also differ after interaction (saved courses, entered values, selected plan, completed lessons).

## Not verified / not implemented as a live service

- **100% pixel equality is not certified.** The reference renderer reads the supplied local Figma data; it is not an independent Figma export. Figma blur effects, crop transforms and font-size accessibility behavior need further cross-device review if strict pixel matching is required.
- iOS files and font registration are present, but Xcode compilation and device testing require macOS and were not performed here.
- No external backend, OAuth provider, real payment gateway, push-notification service or certificate authority is configured. The app labels these flows as demonstrations; it does not claim a real login, charge, reset email or accredited completion.
- The bundled silent 18-second video is an original demonstration, not the missing course content.
- The debug APK is for x86_64 and requires Metro. Production signing, ARM release builds and store delivery were not requested or verified.

The native build reports dependency deprecations for the current Android Gradle APIs and a Kotlin/KSP version warning. They did not prevent compilation. Review these before a production release or dependency upgrade.
