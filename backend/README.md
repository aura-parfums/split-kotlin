# Local Android preview runner

Split Kotlin Studio is a browser IDE, but real Jetpack Compose rendering requires Android's runtime. The local runner compiles the current editor buffer, installs the debug app on a connected Android emulator/device, launches it, and captures the actual device screen for the browser preview.

This is a device-backed preview loop, not Android Studio's in-process Layoutlib preview. The editor detects zero-argument `@Composable` functions and provides a screen selector. Choose one function for an individual preview, or choose **All screens** to render every detected function in a vertically scrollable Android preview host. A refresh takes time because the app must compile and launch. After the first manual Preview, Auto refresh debounces edits and reruns the selected screen.

## Requirements

- JDK 17
- Android SDK with Platform 35 and Build Tools installed
- Gradle 8.11.1 installed and available on PATH (for Android Gradle Plugin 8.9.2)
- Android Emulator running, or an Android phone connected with USB debugging enabled
- ADB available through `ANDROID_HOME/platform-tools` or PATH

## Run locally

From the repository root, install web dependencies:

```bash
npm install
```

Generate one secret and use the same value for both processes:

```bash
export RUNNER_TOKEN="$(openssl rand -hex 32)"
export RUNNER_PORT=4317
export RUNNER_HOST=127.0.0.1
export WORKSPACE_ORIGIN=http://localhost:3000
export ANDROID_HOME="$HOME/Android/Sdk"
export RUNNER_URL=http://127.0.0.1:4317
```

Terminal 1 — start the runner from its directory:

```bash
cd backend/runner
npm start
```

Terminal 2 — from the repository root, start the web IDE with the same environment:

```bash
npm run dev
```

Open `http://localhost:3000`, start an emulator (or connect a USB-debugging-enabled Android phone), then press **Preview**. Once the first preview succeeds, Auto refresh will re-render after edits settle.

## Preview pipeline

1. Browser sends the current `MainActivity.kt` buffer to the Next.js server route.
2. The server forwards it to the authenticated loopback runner.
3. The runner writes only to the fixed starter source path.
4. Gradle compiles the Compose app.
5. ADB installs and launches it on the first available device.
6. ADB captures a PNG screenshot; the browser displays that real Android frame.

## Security and limitations

- The runner binds to loopback and accepts a fixed project ID and source buffer, not arbitrary shell commands.
- The runner token is server-side only. Do not expose it through a `NEXT_PUBLIC_*` variable.
- Keep the runner private; do not expose port 4317 to the public internet.
- This initial version previews one Activity in the checked-in `hello-compose` project. It does not yet provide Android Studio's multi-@Preview gallery, instant in-process recomposition, touch forwarding, project/file management, or language-server diagnostics.
- The Next.js server and local runner must run on the same computer. A remotely hosted website cannot reach your computer's localhost through its server-side API route.
