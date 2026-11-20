# Local Android execution backend

The runner is intentionally a local companion service. It binds to `127.0.0.1` by default and only exposes a fixed Gradle build task for an existing project folder beneath `backend/projects`.

## Start

1. Install a supported JDK (17), Android SDK platform/build tools, and Gradle.
2. Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`.
3. Copy `runner/.env.example` to your local environment and generate a token with at least 32 characters.
4. From `backend/runner`, export the variables and run `npm start`.

The service exposes an unauthenticated `GET /health` endpoint and a token-protected `POST /build` endpoint. The build endpoint accepts only a project ID and always runs `:app:assembleDebug`; it does not accept arbitrary shell commands or Gradle arguments.

## Important boundaries

- Keep the runner bound to loopback. Do not expose it directly to the public internet.
- Keep the bearer token private; never put it in client-side Next.js code.
- The initial runner builds a checked-in sample project. It does not yet synchronize Monaco edits into the Android project, install APKs, stream emulator frames, or provide live Compose preview.
- A later authenticated local bridge will connect workspace files to the runner and stream build/device status.
