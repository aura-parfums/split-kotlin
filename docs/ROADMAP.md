# Product roadmap

## Milestone 1 — IDE shell
- [x] Dark split workspace layout
- [x] Monaco editor configured for Kotlin syntax
- [x] Project explorer shell
- [x] Device-frame workspace placeholder
- [x] Terminal / Problems panel

## Milestone 2 — Real Compose screen preview foundation
- [x] Starter Android app using Jetpack Compose
- [x] Local runner bound to loopback by default
- [x] Token-protected fixed-project preview endpoint
- [x] Synchronize current MainActivity.kt editor buffer to starter project
- [x] Compile and install to first connected Android device
- [x] Capture actual device screen and display it in the browser
- [x] Discover zero-argument `@Composable` functions in the editor buffer
- [x] Select a screen and render it through a generated preview Activity
- [x] Debounced Auto refresh after the first successful manual preview

## Milestone 3 — Android Studio-style preview experience
- [x] Discover `@Preview` composables and support one `@PreviewParameter` provider per function
- [x] Show discovered screens as independent cards in a preview gallery
- [ ] Preview parameter sets, themes, font scales, and device configurations
- [x] Reuse Gradle daemon and build cache for faster repeat builds
- [x] Forward taps and swipes from browser preview to emulator
- [ ] Support multiple Activities / navigation destinations
- [ ] Device selector and orientation controls

## Milestone 4 — Full project workspace
- [ ] Read project tree from backend instead of hard-coded UI data
- [x] Open and edit up to 10 Kotlin source files in one preview workspace
- [ ] Open and save XML/Gradle files
- [ ] Create, rename, and delete files with path validation
- [ ] Persist project files and user projects
- [ ] Kotlin language server, diagnostics, completion, and navigation

## Important technical distinction

The current preview is a real screenshot from Android Runtime, not a fake HTML rendering. It currently recompiles and relaunches the starter app to refresh, so it is slower than Android Studio's native Compose Preview. It supports multiple Kotlin source files, discovered `@Preview` functions, and one `@PreviewParameter` provider per function; full preview configuration matrices and non-Kotlin project files remain future work.
