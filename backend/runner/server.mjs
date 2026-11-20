import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const HOST = process.env.RUNNER_HOST || "127.0.0.1";
const PORT = Number(process.env.RUNNER_PORT || 4317);
const TOKEN = process.env.RUNNER_TOKEN;
const ORIGIN = process.env.WORKSPACE_ORIGIN || "http://localhost:3000";
const PROJECTS_ROOT = resolve(process.cwd(), "../projects");

if (!TOKEN || TOKEN.length < 32) {
  console.error("RUNNER_TOKEN is required and must contain at least 32 characters.");
  process.exit(1);
}

mkdirSync(PROJECTS_ROOT, { recursive: true });

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  const supplied = req.headers.authorization || "";
  const expected = `Bearer ${TOKEN}`;
  if (supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function readJson(req, limit = 16 * 1024) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error("Request body too large.");
  }
  return body ? JSON.parse(body) : {};
}

function getProjectDir(projectId) {
  if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(projectId)) {
    throw new Error("Invalid project id.");
  }
  const candidate = resolve(PROJECTS_ROOT, projectId);
  if (!candidate.startsWith(PROJECTS_ROOT + sep) || !existsSync(candidate)) {
    throw new Error("Project not found.");
  }
  const real = realpathSync(candidate);
  const root = realpathSync(PROJECTS_ROOT);
  if (!real.startsWith(root + sep)) throw new Error("Invalid project location.");
  return real;
}

function runGradle(projectDir, res) {
  const gradle = process.platform === "win32" ? "gradle.bat" : "gradle";
  const args = [":app:assembleDebug", "--build-cache", "--stacktrace"];
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const env = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    JAVA_HOME: process.env.JAVA_HOME || "",
    ANDROID_HOME: sdk || "",
    ANDROID_SDK_ROOT: sdk || "",
    LANG: process.env.LANG || "C.UTF-8",
  };
  const child = spawn(gradle, args, {
    cwd: projectDir,
    env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let finished = false;
  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 120_000) output = output.slice(-120_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const timeout = setTimeout(() => {
    if (!finished) child.kill("SIGTERM");
  }, 5 * 60 * 1000);

  child.on("error", (error) => {
    finished = true;
    clearTimeout(timeout);
    send(res, 500, { ok: false, error: `Could not start Gradle: ${error.message}` });
  });
  child.on("close", (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    send(res, code === 0 ? 200 : 422, {
      ok: code === 0,
      exitCode: code,
      signal,
      task: ":app:assembleDebug",
      output,
      artifact: code === 0 ? "app/build/outputs/apk/debug/app-debug.apk" : null,
    });
  });
}


function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeout || 5 * 60 * 1000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error((stderr || stdout || `${command} exited with ${code}`).slice(-16000)));
    });
  });
}


function runBinaryCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeout || 20000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise({ stdout: Buffer.concat(stdout), stderr });
      else reject(new Error((stderr || `${command} exited with ${code}`).slice(-8000)));
    });
  });
}

function discoverPreviewTargets(source) {
  const targets = [];
  const declaration = /((?:@[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\s*)*)@Composable\s+(?:(?:private|internal)\s+)?fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(declaration)) {
    const annotations = match[1] || "";
    const name = match[2];
    const parameters = match[3].trim();
    if (!parameters || parameters.split(",").every((parameter) => parameter.includes("="))) {
      targets.push({ name, render: name + "()" });
      continue;
    }
    const provider = parameters.match(/@PreviewParameter\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)::class(?:\s*,[^)]*)?\s*\)\s*(?:val\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (provider && parameters.split(",").length === 1) {
      targets.push({
        name,
        render: "Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { " +
          provider[1] + "().values.take(5).forEach { previewValue -> " + name + "(previewValue) } }",
      });
      continue;
    }
    if (/@Preview(?:\s*\(|\s|$)/.test(annotations)) {
      targets.push({ name, unsupported: true });
    }
  }
  const byName = new Map();
  for (const target of targets) byName.set(target.name, target);
  return [...byName.values()];
}

async function createPreview(body, res) {
  try {
    if (typeof body.code !== "string" || body.code.length > 200_000) {
      return send(res, 400, { ok: false, error: "MainActivity.kt is missing or too large (200 KB max)." });
    }
    const projectDir = getProjectDir(body.projectId);
    const submittedFiles = Array.isArray(body.files) ? body.files : [];
    if (submittedFiles.length > 10) {
      return send(res, 400, { ok: false, error: "A maximum of 10 Kotlin files can be previewed at once." });
    }
    const fileMap = new Map([["MainActivity.kt", body.code]]);
    for (const file of submittedFiles) {
      if (!file || typeof file.path !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*\\.kt$/.test(file.path) ||
          typeof file.content !== "string" || file.content.length > 200_000) {
        return send(res, 400, { ok: false, error: "Each file must have a safe Kotlin filename and source content under 200 KB." });
      }
      fileMap.set(file.path, file.content);
    }
    const totalSourceBytes = [...fileMap.values()].reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);
    if (totalSourceBytes > 1024 * 1024) {
      return send(res, 400, { ok: false, error: "Combined Kotlin source exceeds the 1 MB preview limit." });
    }
    const combinedSource = [...fileMap.values()].join("\\n");
    const previewTargets = discoverPreviewTargets(combinedSource);
    const uniqueScreens = previewTargets.map((target) => target.name);
    if (!uniqueScreens.length) {
      return send(res, 422, { ok: false, stage: "analysis", error: "No zero-argument @Composable functions were found. Add @Composable fun YourScreen() to preview a screen." });
    }
    const selectedScreen = typeof body.screen === "string" ? body.screen : uniqueScreens[0];
    const selectedScreens = selectedScreen === "__all__" ? uniqueScreens : [selectedScreen];
    const unsupported = selectedScreens.filter((name) => previewTargets.find((target) => target.name === name)?.unsupported);
    if (unsupported.length) {
      return send(res, 422, {
        ok: false,
        stage: "analysis",
        error: "Selected @Preview parameters are not supported. Use one @PreviewParameter provider for a single parameter.",
        unsupportedScreens: unsupported,
        availableScreens: uniqueScreens,
      });
    }
    if (selectedScreens.some((screen) => !uniqueScreens.includes(screen))) {
      return send(res, 400, { ok: false, stage: "analysis", error: "Selected preview screen was not found in the current Kotlin source.", availableScreens: uniqueScreens });
    }

    const sourcePath = join(projectDir, "app/src/main/java/com/splitstudio/hello/MainActivity.kt");
    const requiredImports = [
      "import android.os.Bundle",
      "import androidx.activity.ComponentActivity",
      "import androidx.activity.compose.setContent",
      "import androidx.compose.material3.MaterialTheme",
      "import androidx.compose.foundation.layout.Column",
      "import androidx.compose.foundation.layout.fillMaxSize",
      "import androidx.compose.ui.Modifier",
      "import androidx.compose.foundation.layout.Box",
      "import androidx.compose.foundation.layout.fillMaxWidth",
      "import androidx.compose.foundation.layout.height",
      "import androidx.compose.foundation.rememberScrollState",
      "import androidx.compose.foundation.verticalScroll",
      "import androidx.compose.ui.unit.dp",
    ];
    let source = body.code;
    if (!/^package\s+/m.test(source)) source = "package com.splitstudio.hello\n" + source;
    const missingImports = requiredImports.filter((line) => !source.split("\n").includes(line));
    const packageLine = source.match(/^package [^\r\n]+/m);
    if (missingImports.length) {
      if (packageLine) {
        const insertAt = source.indexOf("\n", packageLine.index) + 1;
        source = source.slice(0, insertAt) + missingImports.join("\n") + "\n" + source.slice(insertAt);
      } else {
        source = missingImports.join("\n") + "\n" + source;
      }
    }
    source += "\nclass SplitStudioPreviewActivity : ComponentActivity() {\n" +
      "    override fun onCreate(savedInstanceState: Bundle?) {\n" +
      "        super.onCreate(savedInstanceState)\n" +
      "        val requestedScreen = intent.getStringExtra(\"splitstudio.screen\")\n" +
      "        setContent {\n" +
      "            MaterialTheme {\n" +
      "                when (requestedScreen) {\n" +
      "                    " + previewTargets.map((target) => '"' + target.name + '" -> ' + (target.render || target.name + "()")).join("\n                    ") + "\n" +
      "                    else -> " + uniqueScreens[0] + "()\n" +
      "                }\n" +
      "            }\n" +
      "        }\n" +
      "    }\n" +
      "}\n";
    writeFileSync(sourcePath, source, "utf8");
    const kotlinDir = join(projectDir, "app/src/main/java/com/splitstudio/hello");
    for (const [fileName, fileContent] of fileMap) {
      if (fileName === "MainActivity.kt") continue;
      const normalized = /^package\\s+/m.test(fileContent)
        ? fileContent
        : "package com.splitstudio.hello\\n" + fileContent;
      writeFileSync(join(kotlinDir, fileName), normalized, "utf8");
    }

    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
    const env = {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
    };
    const gradle = process.platform === "win32" ? "gradle.bat" : "gradle";
    const build = await runCommand(gradle, [":app:assembleDebug", "--build-cache"], {
      cwd: projectDir, env, timeout: 5 * 60 * 1000,
    });

    const apk = join(projectDir, "app/build/outputs/apk/debug/app-debug.apk");
    if (!existsSync(apk)) throw new Error("Gradle finished but the debug APK was not found.");

    const adb = sdk ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : "adb";
    const devicesResult = await runCommand(adb, ["devices"], { env, timeout: 15000 });
    const devices = devicesResult.stdout.split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2 && parts[1] === "device")
      .map((parts) => parts[0]);

    if (!devices.length) {
      return send(res, 409, {
        ok: false,
        stage: "device",
        error: "Build succeeded, but no Android emulator or USB device is connected. Start an emulator or connect a device with USB debugging enabled.",
        buildOutput: build.stdout + build.stderr,
      });
    }

    const serial = devices[0];
    await runCommand(adb, ["-s", serial, "install", "-r", apk], { env, timeout: 120000 });
    const previews = [];
    for (const screen of selectedScreens.slice(0, 8)) {
      await runCommand(adb, ["-s", serial, "shell", "am", "force-stop", "com.splitstudio.hello"], { env, timeout: 15000 });
      await runCommand(adb, ["-s", serial, "shell", "am", "start", "-n", "com.splitstudio.hello/.SplitStudioPreviewActivity", "--es", "splitstudio.screen", screen], { env, timeout: 15000 });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 900));
      const screenshot = await runBinaryCommand(adb, ["-s", serial, "exec-out", "screencap", "-p"], { env, timeout: 20000 });
      previews.push({ screen, image: "data:image/png;base64," + screenshot.stdout.toString("base64") });
    }

    return send(res, 200, {
      ok: true,
      device: serial,
      image: previews[0]?.image ?? null,
      previews,
      output: build.stdout.slice(-50000),
      message: "Compose screens captured independently from the connected Android device.",
      availableScreens: uniqueScreens,
      selectedScreen,
      renderedScreens: previews.map((item) => item.screen),
      truncated: selectedScreens.length > 8,
    });
  } catch (error) {
    return send(res, 422, { ok: false, stage: "build-or-device", error: error.message });
  }
}

async function interactWithDevice(body, res) {
  const action = body.action;
  const values = [body.x, body.y, body.x2, body.y2].filter((value) => value !== undefined);
  if (!["tap", "swipe"].includes(action) || values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) ||
      (action === "swipe" && (typeof body.x2 !== "number" || typeof body.y2 !== "number"))) {
    return send(res, 400, { ok: false, error: "Invalid device interaction coordinates." });
  }
  try {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
    const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
    const adb = sdk ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : "adb";
    const devicesResult = await runCommand(adb, ["devices"], { env, timeout: 15000 });
    const devices = devicesResult.stdout.split("\n").slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2 && parts[1] === "device")
      .map((parts) => parts[0]);
    if (!devices.length) return send(res, 409, { ok: false, error: "No Android device is connected." });
    const serial = devices[0];
    const sizeResult = await runCommand(adb, ["-s", serial, "shell", "wm", "size"], { env, timeout: 10000 });
    const match = sizeResult.stdout.match(/(\d+)x(\d+)/);
    if (!match) return send(res, 422, { ok: false, error: "Could not read Android display dimensions." });
    const width = Number(match[1]);
    const height = Number(match[2]);
    const x = Math.round(body.x * width);
    const y = Math.round(body.y * height);
    if (action === "tap") {
      await runCommand(adb, ["-s", serial, "shell", "input", "tap", String(x), String(y)], { env, timeout: 10000 });
    } else {
      const x2 = Math.round(body.x2 * width);
      const y2 = Math.round(body.y2 * height);
      await runCommand(adb, ["-s", serial, "shell", "input", "swipe", String(x), String(y), String(x2), String(y2), "250"], { env, timeout: 10000 });
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
    const screenshot = await runBinaryCommand(adb, ["-s", serial, "exec-out", "screencap", "-p"], { env, timeout: 20000 });
    return send(res, 200, {
      ok: true,
      action,
      device: serial,
      image: "data:image/png;base64," + screenshot.stdout.toString("base64"),
    });
  } catch (error) {
    return send(res, 422, { ok: false, error: error.message });
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return send(res, 403, { error: "Origin not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/health" && req.method === "GET") {
    return send(res, 200, {
      ok: true,
      service: "split-kotlin-local-runner",
      androidSdkConfigured: Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT),
    });
  }

  if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });

  if (url.pathname === "/preview" && req.method === "POST") {
    try {
      const body = await readJson(req, 256 * 1024);
      return await createPreview(body, res);
    } catch (error) {
      return send(res, 400, { ok: false, error: error.message });
    }
  }

  if (url.pathname === "/interact" && req.method === "POST") {
    try {
      const body = await readJson(req, 16 * 1024);
      return await interactWithDevice(body, res);
    } catch (error) {
      return send(res, 400, { ok: false, error: error.message });
    }
  }

  if (url.pathname === "/build" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const projectDir = getProjectDir(body.projectId);
      return runGradle(projectDir, res);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }

  return send(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`Split Kotlin runner listening on http://${HOST}:${PORT}`);
  console.log(`Projects root: ${PROJECTS_ROOT}`);
});
