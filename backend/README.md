# Local Android preview runner

Split Kotlin Studio is a browser IDE, but real Jetpack Compose rendering requires Android's runtime. The local runner compiles the current editor buffer, installs the debug app on a connected Android emulator/device, launches it, and captures the actual device screen for the browser preview.

This is a device-backed preview loop, not Android Studio's in-process Layoutlib preview. The editor detects public/internal zero-argument `@Composable` functions and supported `@PreviewParameter` functions. Workspace files are restored from the local runner when no browser-local draft exists; edits are kept in browser storage and synchronized to the runner on Preview. The preview-discovery parser has Node test coverage in CI. Choose one function for an individual preview, or choose **All screens** to capture each detected function separately and display the results as independent gallery cards (up to 8 screens per run). A refresh takes time because the app must compile and launch. After the first manual Preview, Auto refresh debounces edits and reruns the selected screen.

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

1. Browser sends `MainActivity.kt` and the other open Kotlin buffers to the Next.js server route.
2. The server forwards the source files and selected preview target to the authenticated loopback runner.
3. The runner validates filenames/packages, writes changed files into the fixed starter package, and generates a separate preview Activity.
4. Gradle reuses its daemon and build cache to compile only what changed where possible.
5. ADB installs the APK only when it changed, then launches each selected target.
6. ADB captures PNG screenshots; the browser displays independent cards or a selected device frame.
7. Browser taps/swipes are translated to ADB input commands, followed by a refreshed screenshot.

## Security and limitations

- The runner binds to loopback and accepts a fixed project ID plus validated Kotlin source files (maximum 10 files and 1 MB combined), not arbitrary shell commands.
- The runner token is server-side only. Do not expose it through a `NEXT_PUBLIC_*` variable.
- Keep the runner private; do not expose port 4317 to the public internet.
- The runner discovers zero-argument composables and `@Preview` composables. A single-parameter `@PreviewParameter(Provider::class)` is rendered as up to five provider values in a vertically scrollable screen; more complex parameter combinations are reported as unsupported. Up to 10 Kotlin files in the starter package can be edited together (1 MB combined source limit). The browser can forward taps and swipes to the connected device and receives a fresh screenshot after each gesture. Gradle daemon reuse and the build cache reduce repeat-build overhead, but every source change still triggers a Gradle build and Activity relaunch; this is not Android Studio's in-process recomposition. The workspace currently supports Kotlin source files only and does not yet provide language-server diagnostics.
- The Next.js server and local runner must run on the same computer. A remotely hosted website cannot reach your computer's localhost through its server-side API route.
