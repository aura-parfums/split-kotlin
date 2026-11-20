# Product roadmap

## Milestone 1 — IDE shell
- [x] Dark split workspace layout
- [x] Monaco editor configured for Kotlin syntax
- [x] Project explorer shell
- [x] Device-frame workspace placeholder
- [x] Terminal / Problems panel

## Milestone 2 — Local build foundation
- [x] Starter Android app using Jetpack Compose
- [x] Local runner bound to loopback by default
- [x] Token-protected, fixed-task Gradle build endpoint
- [x] Next.js server-side proxy; runner token stays server-side
- [x] Workspace build action and Gradle output panel

## Milestone 3 — Real editor-to-project synchronization
- [ ] Persist editor buffers to files under a sandboxed project directory
- [ ] Read the project tree from the backend instead of hard-coded UI data
- [ ] Add file creation, rename, and delete with path validation
- [ ] Build the exact saved project state, not the checked-in starter snapshot

## Milestone 4 — Device execution and preview
- [ ] Detect installed Android SDKs and available ADB devices
- [ ] Install the generated APK on a selected emulator/device
- [ ] Stream emulator frames into the preview panel
- [ ] Add logcat and device lifecycle controls
- [ ] Implement debounced build/install workflow

## Milestone 5 — Kotlin developer experience
- [ ] Kotlin language server / diagnostics integration
- [ ] Compose-aware completion and navigation
- [ ] Build variants, dependency management, and Gradle task explorer
- [ ] Export APK and project archive

## Important truth in product UI

A browser-rendered phone frame is not a Compose preview. The preview remains explicitly labeled as a placeholder until a real emulator/device frame stream is connected. Likewise, the current Build APK action compiles the checked-in `hello-compose` starter project; it does not yet compile unsaved Monaco editor changes.
