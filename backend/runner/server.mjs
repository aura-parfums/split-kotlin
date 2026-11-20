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
  const args = [":app:assembleDebug", "--no-daemon", "--stacktrace"];
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
\nasync function createPreview(body, res) {
  try {
    if (typeof body.code !== "string" || body.code.length > 200_000) {
      return send(res, 400, { ok: false, error: "Kotlin source is missing or too large (200 KB max)." });
    }
    const projectDir = getProjectDir(body.projectId);
    const sourcePath = join(projectDir, "app/src/main/java/com/splitstudio/hello/MainActivity.kt");
    writeFileSync(sourcePath, body.code, "utf8");

    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
    const env = {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
    };
    const gradle = process.platform === "win32" ? "gradle.bat" : "gradle";
    const build = await runCommand(gradle, [":app:assembleDebug", "--no-daemon"], {
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
    await runCommand(adb, ["-s", serial, "shell", "am", "force-stop", "com.splitstudio.hello"], { env, timeout: 15000 });
    await runCommand(adb, ["-s", serial, "shell", "monkey", "-p", "com.splitstudio.hello", "1"], { env, timeout: 15000 });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1800));
    const screenshot = await runBinaryCommand(adb, ["-s", serial, "exec-out", "screencap", "-p"], { env, timeout: 20000 });
    const image = screenshot.stdout.toString("base64");

    return send(res, 200, {
      ok: true,
      device: serial,
      image: `data:image/png;base64,${image}`,
      output: build.stdout.slice(-50000),
      message: "Compose app rendered on the connected Android device.",
    });
  } catch (error) {
    return send(res, 422, { ok: false, stage: "build-or-device", error: error.message });
  }
}
\nconst server = createServer(async (req, res) => {
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

  if (url.pathname === "/preview" && req.method === "POST") {\n    try {\n      const body = await readJson(req, 256 * 1024);\n      return await createPreview(body, res);\n    } catch (error) {\n      return send(res, 400, { ok: false, error: error.message });\n    }\n  }\n\n  if (url.pathname === "/build" && req.method === "POST") {
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
