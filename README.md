# Split Kotlin Studio

A browser-based Kotlin + Jetpack Compose workspace with a split editor and Android screen preview.

## Product direction

- Monaco Kotlin editor on the left.
- Actual Android Runtime screen capture on the right.
- Discover zero-argument and supported parameterized Compose previews; capture each as an independent preview card (up to 8 per run).
- Edit up to 10 Kotlin files in the same starter package.
- Restore local runner files on startup and keep an automatic browser-local draft.
- Forward taps and swipes from the preview image to the connected Android device.
- Debounced preview refresh after the first successful render.
- Project explorer and build/diagnostic output.

## Current implementation

The preview uses a local companion runner: it writes all open Kotlin source buffers into a starter Android project, compiles it with Gradle, installs it on a connected emulator/device, launches a generated preview Activity for the selected composable, and captures the device screen for the browser.

This is a real Android screen, not an HTML approximation. The runner discovers `@Preview` functions and supports one `@PreviewParameter` provider for a single parameter. Tap or swipe on the preview to interact with the device. Gradle daemon reuse, build cache, unchanged-source detection, and APK install skipping reduce repeat work. Changed files use Gradle's incremental compilation where possible, but the preview Activity still relaunches; this is not Android Studio's instant in-process Layoutlib preview.

## Local development

See [backend/README.md](backend/README.md) for JDK, Android SDK, Gradle, ADB, runner-token, emulator, and startup requirements.

## Stack

- Next.js + TypeScript
- Monaco Editor
- Kotlin + Jetpack Compose
- Android SDK, Gradle, and ADB
- Local authenticated Node.js preview runner
