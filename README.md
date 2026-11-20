# Split Kotlin Studio

A browser-based Kotlin + Jetpack Compose workspace with a split editor and Android screen preview.

## Product direction

- Monaco Kotlin editor on the left.
- Actual Android Runtime screen capture on the right.
- Detect and select zero-argument `@Composable` functions from the open source file.
- Debounced preview refresh after the first successful render.
- Project explorer and build/diagnostic output.

## Current implementation

The preview uses a local companion runner: it writes the current editor buffer into a starter Android project, compiles it with Gradle, installs it on a connected emulator/device, launches a generated preview Activity for the selected composable, and captures the device screen for the browser.

This is a real Android screen, not an HTML approximation. It is not yet Android Studio's instant Layoutlib preview: each refresh recompiles/relaunches the app. Parameterized composables, a full `@Preview` configuration gallery, touch forwarding, and a multi-file project workspace remain future work.

## Local development

See [backend/README.md](backend/README.md) for JDK, Android SDK, Gradle, ADB, runner-token, emulator, and startup requirements.

## Stack

- Next.js + TypeScript
- Monaco Editor
- Kotlin + Jetpack Compose
- Android SDK, Gradle, and ADB
- Local authenticated Node.js preview runner
