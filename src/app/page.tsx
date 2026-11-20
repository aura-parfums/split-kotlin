"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Editor from "@monaco-editor/react";
import {
  Activity, AppWindow, ChevronDown, ChevronRight, Code2, Command,
  FileCode2, Folder, GitBranch, Monitor, MoreHorizontal,
  Play, RefreshCw, Search, Settings2, Smartphone,
  Wifi, X, Zap, Plus
} from "lucide-react";

const starterCode = `package com.splitstudio.hello

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    GreetingScreen()
                }
            }
        }
    }
}

@Composable
fun GreetingScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Hello, Android!")
        Button(onClick = { /* Handle click */ }) {
            Text("Get started")
        }
    }
}

@Composable
fun ProfileScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Your profile")
        Text(text = "This is a second screen preview.")
    }
}`;

const files = [
  { name: "app", kind: "folder", depth: 0 },
  { name: "manifests", kind: "folder", depth: 1 },
  { name: "AndroidManifest.xml", kind: "xml", depth: 2 },
  { name: "kotlin + java", kind: "folder", depth: 1 },
  { name: "com.splitstudio.hello", kind: "folder", depth: 2 },
  { name: "MainActivity.kt", kind: "kotlin", depth: 3, active: true },
  { name: "res", kind: "folder", depth: 1 },
  { name: "Gradle Scripts", kind: "folder", depth: 0 },
  { name: "build.gradle.kts", kind: "gradle", depth: 1 },
  { name: "settings.gradle.kts", kind: "gradle", depth: 1 },
];

export default function Home() {
  const workspaceStorageKey = "split-kotlin:hello-compose:files";
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(workspaceStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, unknown>;
          if (parsed && typeof parsed["MainActivity.kt"] === "string" &&
              Object.values(parsed).every((value) => typeof value === "string")) {
            return parsed as Record<string, string>;
          }
        }
      } catch {
        // Ignore malformed local drafts and use the starter project.
      }
    }
    return { "MainActivity.kt": starterCode };
  });
  const hasLocalDraft = useRef(typeof window !== "undefined" && Boolean(localStorage.getItem(workspaceStorageKey)));
  const workspaceTouched = useRef(false);
  const [activeFile, setActiveFile] = useState("MainActivity.kt");
  useEffect(() => {
    try {
      localStorage.setItem(workspaceStorageKey, JSON.stringify(projectFiles));
    } catch {
      setBuildOutput("Could not persist the workspace in browser storage. Export your Kotlin files before leaving.");
    }
  }, [projectFiles]);
  useEffect(() => {
    if (hasLocalDraft.current) return;
    let cancelled = false;
    fetch("/api/runner/files", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (cancelled || workspaceTouched.current || !result.ok || !Array.isArray(result.files) || !result.files.length) return;
        const restored = Object.fromEntries(
          result.files
            .filter((file: { path?: unknown; content?: unknown }) =>
              typeof file.path === "string" && /^[A-Za-z_][A-Za-z0-9_]*\.kt$/.test(file.path) &&
              file.path !== "SplitStudioPreviewActivity.kt" && typeof file.content === "string")
            .map((file: { path: string; content: string }) => [file.path, file.content])
        ) as Record<string, string>;
        if (typeof restored["MainActivity.kt"] === "string") setProjectFiles(restored);
      })
      .catch(() => {
        // The starter and browser draft remain available while the local runner is offline.
      });
    return () => { cancelled = true; };
  }, []);
  const code = projectFiles[activeFile] ?? "";
  const mainCode = projectFiles["MainActivity.kt"] ?? "";
  const [activeTab, setActiveTab] = useState<"problems" | "terminal">("terminal");
  const [bottomOpen, setBottomOpen] = useState(true);
  const [previewScale, setPreviewScale] = useState("100%");
  const [running, setRunning] = useState(false);
  const [buildOutput, setBuildOutput] = useState("Live Compose preview is ready to connect. Start the local Android runner and an emulator, then press Preview.");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<Array<{ screen: string; image: string }>>([]);
  const [autoPreview, setAutoPreview] = useState(true);
  const [selectedScreen, setSelectedScreen] = useState("__all__");
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionStart = useRef<{ x: number; y: number } | null>(null);
  const [buildStatus, setBuildStatus] = useState<"idle" | "building" | "success" | "error">("idle");
  async function runPreview(screenOverride?: string) {
    setRunning(true);
    setBuildStatus("building");
    setActiveTab("terminal");
    setBottomOpen(true);
    setBuildOutput("Compiling current MainActivity.kt…\nInstalling on connected Android device…\nCapturing Compose screen…");
    try {
      const response = await fetch("/api/runner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "hello-compose",
          code: mainCode,
          files: Object.entries(projectFiles).filter(([path]) => path !== "MainActivity.kt").map(([path, content]) => ({ path, content })),
          screen: screenOverride ?? (selectedScreen === "__all__" ? "__all__" : previewScreens.includes(selectedScreen) ? selectedScreen : previewScreens[0])
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.buildOutput || "Preview failed.");
      }
      setPreviewImage(result.image || result.previews?.[0]?.image || null);
      setPreviewImages(Array.isArray(result.previews) ? result.previews : []);
      setBuildStatus("success");
      setBuildOutput((result.output || "Gradle build completed.") + "\n\nLIVE PREVIEW UPDATED\nDevice: " + result.device + (result.truncated ? "\nGallery limited to the first 8 discovered screens." : "") + (result.skippedUnsupportedScreens?.length ? "\nSkipped unsupported previews: " + result.skippedUnsupportedScreens.join(", ") : ""));
    } catch (error) {
      setBuildStatus("error");
      setBuildOutput(error instanceof Error ? error.message : "Unknown preview error.");
    } finally {
      setRunning(false);
    }
  }
  async function sendDeviceInteraction(payload: { action: "tap"; x: number; y: number } | { action: "swipe"; x: number; y: number; x2: number; y2: number }) {
    try {
      const response = await fetch("/api/runner/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Device interaction failed.");
      if (typeof result.image === "string") setPreviewImage(result.image);
    } catch (error) {
      setBuildOutput(error instanceof Error ? error.message : "Device interaction failed.");
    }
  }
  function handlePreviewPointerDown(event: PointerEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    interactionStart.current = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handlePreviewPointerUp(event: React.PointerEvent<HTMLImageElement>) {
    const start = interactionStart.current;
    interactionStart.current = null;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const end = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance > 0.035) {
      void sendDeviceInteraction({ action: "swipe", ...start, x2: end.x, y2: end.y });
    } else {
      void sendDeviceInteraction({ action: "tap", x: end.x, y: end.y });
    }
  }

  function handleEditorChange(value: string | undefined) {
    const nextCode = value ?? "";
    workspaceTouched.current = true;
    setProjectFiles((current) => ({ ...current, [activeFile]: nextCode }));
    if (autoPreview && previewImage) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        void runPreview();
      }, 1400);
    }
  }
  const previewScreens = (() => {
    const found = [...Object.values(projectFiles).join("\n").matchAll(/@Composable\s+(?:(?:internal)\s+)?fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
      .map((match) => match[1]);
    return [...new Set(found)];
  })();
  const lineCount = code.split("\n").length;
  const explorerFiles = [...files, ...Object.keys(projectFiles).filter((name) => name !== "MainActivity.kt").map((name) => ({ name, kind: "kotlin", depth: 3, active: false }))];
  function addKotlinFile() {
    const requested = window.prompt("New Kotlin file name (without .kt):", "NewScreen");
    if (!requested) return;
    const safeName = requested.trim().replace(/\.kt$/i, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safeName)) {
      setBuildOutput("Invalid Kotlin filename. Use letters, numbers, and underscores.");
      return;
    }
    if (Object.keys(projectFiles).length >= 10) {
      setBuildOutput("This workspace supports up to 10 Kotlin files including MainActivity.kt.");
      return;
    }
    if (safeName === "SplitStudioPreviewActivity") {
      setBuildOutput("SplitStudioPreviewActivity.kt is reserved for the preview runtime.");
      return;
    }
    const fileName = safeName + ".kt";
    if (projectFiles[fileName]) {
      setActiveFile(fileName);
      return;
    }
    workspaceTouched.current = true;
    setProjectFiles((current) => ({
      ...current,
      [fileName]: `package com.splitstudio.hello

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun ${safeName}() {
    Text("New Compose screen")
}
`
    }));
    setActiveFile(fileName);
  }

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Code2 size={17} strokeWidth={2.4} /></div>
          <span className="brand-name">split<span>studio</span></span>
          <span className="version">EARLY ACCESS</span>
        </div>
        <div className="top-center">
          <div className="project-switch"><AppWindow size={14} /><span>My Compose App</span><ChevronDown size={13} /></div>
          <span className="branch"><GitBranch size={13} /> main</span>
        </div>
        <div className="top-actions">
          <div className="connection"><span className="connection-dot" /> Local workspace</div>
          <button className="icon-button" aria-label="Search"><Search size={16} /></button>
          <button className="icon-button" aria-label="Settings"><Settings2 size={16} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <div className="workspace">
        <aside className="activitybar">
          <button className="activity active" aria-label="Explorer"><Folder size={19} /></button>
          <button className="activity" aria-label="Search"><Search size={19} /></button>
          <button className="activity" aria-label="Source control"><GitBranch size={19} /></button>
          <button className="activity" aria-label="Extensions"><Zap size={19} /></button>
          <div className="activity-spacer" />
          <button className="activity" aria-label="Account"><Activity size={19} /></button>
          <button className="activity" aria-label="Settings"><Settings2 size={19} /></button>
        </aside>

        <aside className="explorer">
          <div className="pane-heading"><span>EXPLORER</span><MoreHorizontal size={16} /></div>
          <div className="project-title"><ChevronDown size={13} /><span>MY COMPOSE APP</span><MoreHorizontal size={15} /></div>
          <div className="file-tree">
            {explorerFiles.map((file, index) => (
              <div key={index} className={`file-row ${file.name === activeFile ? "selected" : ""}`} onClick={() => { if (projectFiles[file.name]) setActiveFile(file.name); }} style={{ paddingLeft: 10 + file.depth * 14 }}>
                {file.kind === "folder" ? <><ChevronRight size={13} /><Folder size={14} className="folder-icon" /></> :
                  file.kind === "kotlin" ? <FileCode2 size={14} className="kt-icon" /> :
                  <FileCode2 size={14} className="file-icon" />}
                <span>{file.name}</span>
              </div>
            ))}
          </div>
          <div className="explorer-bottom">
            <div className="project-title"><ChevronRight size={13} /><span>OUTLINE</span></div>
            <div className="project-title"><ChevronRight size={13} /><span>TIMELINE</span></div>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="editor-tabs">
            {Object.keys(projectFiles).map((fileName) => (
              <button key={fileName} className={`editor-tab ${activeFile === fileName ? "active" : "muted"}`} onClick={() => setActiveFile(fileName)}>
                <FileCode2 size={14} className="kt-icon" /> {fileName}
              </button>
            ))}
            <div className="editor-tab-actions"><button className="icon-button small" onClick={addKotlinFile} aria-label="Add Kotlin file"><Plus size={15} /></button><MoreHorizontal size={17} /></div>
          </div>
          <div className="breadcrumbs"><span>app</span><ChevronRight size={12} /><span>src</span><ChevronRight size={12} /><span>main</span><ChevronRight size={12} /><span>java</span><ChevronRight size={12} /><strong>{activeFile}</strong></div>
          <div className="editor-toolbar">
            <div className="editor-language"><span className="kotlin-badge">K</span> Kotlin <ChevronDown size={12} /></div>
            <div className="editor-tools"><span>UTF-8</span><span>Spaces: 4</span><span>LF</span><button aria-label="Editor options"><MoreHorizontal size={16} /></button></div>
          </div>
          <div className="monaco-wrap">
            <Editor
              height="100%"
              language="kotlin"
              theme="vs-dark"
              value={code}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: true, scale: 1 },
                fontSize: 13,
                lineHeight: 22,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                padding: { top: 16, bottom: 20 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                renderLineHighlight: "all",
                roundedSelection: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: "off",
                overviewRulerBorder: false,
                scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
              }}
              loading={<div className="editor-loading">Loading Kotlin editor…</div>}
            />
          </div>
          {bottomOpen && (
            <div className="bottom-panel">
              <div className="bottom-tabs">
                <button className={activeTab === "problems" ? "chosen" : ""} onClick={() => setActiveTab("problems")}>PROBLEMS <span className="count">0</span></button>
                <button className={activeTab === "terminal" ? "chosen" : ""} onClick={() => setActiveTab("terminal")}>TERMINAL</button>
                <div className="bottom-spacer" />
                <button className="panel-icon" onClick={() => setBottomOpen(false)} aria-label="Close panel"><X size={14} /></button>
              </div>
              <div className="terminal-content">
                {activeTab === "terminal" ? <pre className="build-output">{buildOutput}</pre> : <span className="empty-problems">No Kotlin compiler diagnostics yet. Build the starter project to see Gradle output.</span>}
              </div>
            </div>
          )}
          <div className="editor-status"><span><GitBranch size={12} /> main</span><span>Ln 1, Col 1</span><span>{lineCount} lines</span><span className="status-spacer" /><span>Kotlin</span><span>Prettier</span><span>✓ No errors</span></div>
        </section>

        <section className="preview-panel">
          <div className="preview-header">
            <div className="preview-title"><Smartphone size={16} /><strong>PREVIEW</strong><span className="live-pill"><span /> DEVICE</span></div>
            <div className="preview-actions">
              <select className="preview-screen-select" aria-label="Select Compose screen" value={selectedScreen === "__all__" ? "__all__" : previewScreens.includes(selectedScreen) ? selectedScreen : previewScreens[0] ?? ""} onChange={(event) => { const nextScreen = event.target.value; setSelectedScreen(nextScreen); if (previewImage) void runPreview(nextScreen); }}><option value="__all__">All screens</option>{previewScreens.map((screen) => <option key={screen} value={screen}>{screen}</option>)}</select><label className="auto-preview-toggle"><input type="checkbox" checked={autoPreview} onChange={(event) => setAutoPreview(event.target.checked)} /> Auto</label><button className="device-select"><Smartphone size={13} /> Connected device <ChevronDown size={12} /></button>
              <button className="icon-button small" onClick={() => setPreviewScale(previewScale === "100%" ? "85%" : "100%")} aria-label="Change preview scale"><Monitor size={15} /></button>
              <button className="icon-button small" onClick={() => setRunning(false)} aria-label="Refresh preview"><RefreshCw size={14} /></button>
              <button className="run-button" onClick={() => runPreview()} disabled={running}><Play size={13} fill="currentColor" /> {running ? "Rendering…" : "Preview"}</button>
            </div>
          </div>
          <div className="device-stage">
            <div className="stage-label"><span>ANDROID EMULATOR</span><span>API 35 · ANDROID 15</span></div>
            {selectedScreen === "__all__" && previewImages.length > 0 ? (
              <div className="preview-gallery">
                {previewImages.map((item) => (
                  <button className="preview-card" key={item.screen} onClick={() => { setSelectedScreen(item.screen); setPreviewImage(item.image); }}>
                    <div className="preview-card-image"><img src={item.image} alt={item.screen + " Compose preview"} /></div>
                    <span className="preview-card-title">{item.screen}</span>
                    <span className="preview-card-subtitle">Android runtime capture</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="phone-wrap" style={{ transform: `scale(${previewScale === "100%" ? 1 : 0.85})` }}>
                <div className="phone">
                  <div className="phone-screen">
                    {!previewImage && <div className="statusbar"><span>9:41</span><div className="dynamic-island" /><span className="status-icons"><Wifi size={12} /> ▰</span></div>}
                    {previewImage ? <img
                      className="real-device-capture"
                      src={previewImage}
                      alt="Live Android Compose preview — tap or swipe to interact with the device"
                      draggable={false}
                      onPointerDown={handlePreviewPointerDown}
                      onPointerUp={handlePreviewPointerUp}
                      onPointerCancel={() => { interactionStart.current = null; }}
                    /> : <div className="android-content">
                      <div className="android-placeholder-icon"><Code2 size={27} /></div>
                      <h2>Hello, Android!</h2>
                      <p>Your Compose UI will appear here<br />when the Android runtime is connected.</p>
                      <button className="android-demo-button">Get started</button>
                      <div className="runtime-note"><span className="runtime-dot" /> {buildStatus === "building" ? "Compiling Compose source" : buildStatus === "success" ? "Compose preview ready" : buildStatus === "error" ? "Preview failed — see terminal" : "Waiting for Android device"}</div>
                    </div>}
                    {!previewImage && <div className="gesture-bar"><span /></div>}
                  </div>
                </div>
              </div>
            )}
            <div className="preview-footnote"><span className="info-dot">i</span> Real Compose screen captured from your connected Android device.</div>
          </div>
          <div className="device-footer"><span><span className="footer-dot" /> {buildStatus === "success" ? "Live Compose preview connected" : "Android device disconnected"}</span><span>1280 × 2856</span></div>
        </section>
      </div>

      <footer className="global-status">
        <div><span className="status-branch"><GitBranch size={12} /> main</span><span><Wifi size={12} /> Workspace ready</span></div>
        <div><span>Split Kotlin Studio</span><span>v0.1.0</span><span>Keyboard shortcuts <Command size={11} /></span></div>
      </footer>
    </main>
  );
}
