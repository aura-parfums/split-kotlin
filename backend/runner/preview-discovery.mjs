function extractFunctionParameters(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return null;
}

function splitTopLevelParameters(parameters) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let genericDepth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < parameters.length; index++) {
    const char = parameters[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "<") genericDepth++;
    else if (char === ">" && parameters[index - 1] !== "-" && genericDepth > 0) genericDepth--;
    else if (char === "," && depth === 0 && genericDepth === 0) {
      parts.push(parameters.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = parameters.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

export function discoverPreviewTargets(source) {
  const targets = [];
  const declaration = /((?:@[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\s*)*)@Composable\s+(?:(?:internal)\s+)?fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  for (const match of source.matchAll(declaration)) {
    const name = match[2];
    const openIndex = match.index + match[0].lastIndexOf("(");
    const extracted = extractFunctionParameters(source, openIndex);
    if (extracted === null) continue;
    const parameters = extracted.trim().replace(/,\s*$/, "");
    const parameterParts = parameters ? splitTopLevelParameters(parameters) : [];
    const provider = parameters.match(/@PreviewParameter\s*\(\s*(?:provider\s*=\s*)?([A-Za-z_][A-Za-z0-9_]*)::class(?:\s*,[^)]*)?\s*\)\s*(?:val\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    const requiredParameters = parameterParts.filter((parameter) => {
      const declaration = parameter.replace(/@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*/g, "");
      return !declaration.includes("=");
    });
    if (!parameters || requiredParameters.length === 0) {
      targets.push({ name, render: name + "()" });
      continue;
    }
    if (provider && requiredParameters.length === 1) {
      targets.push({
        name,
        render: "Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { " +
          "for (previewValue in " + provider[1] + "().values.take(5)) { " + name + "(previewValue) } }",
      });
      continue;
    }
    if (/@Preview(?:\s*\(|\s|$)/.test(match[1] || "")) {
      targets.push({ name, unsupported: true });
    }
  }
  const byName = new Map();
  for (const target of targets) byName.set(target.name, target);
  return [...byName.values()];
}

export function buildPreviewActivity(targets, fallbackScreen) {
  const supportedTargets = targets.filter((target) => !target.unsupported);
  const branches = supportedTargets
    .map((target) => `                    "${target.name}" -> ${target.render || target.name + "()"}`)
    .join("\n");
  return [
    "package com.splitstudio.hello",
    "",
    "import android.os.Bundle",
    "import androidx.activity.ComponentActivity",
    "import androidx.activity.compose.setContent",
    "import androidx.compose.material3.MaterialTheme",
    "import androidx.compose.foundation.layout.Column",
    "import androidx.compose.foundation.layout.fillMaxSize",
    "import androidx.compose.foundation.rememberScrollState",
    "import androidx.compose.foundation.verticalScroll",
    "import androidx.compose.ui.Modifier",
    "",
    "class SplitStudioPreviewActivity : ComponentActivity() {",
    "    override fun onCreate(savedInstanceState: Bundle?) {",
    "        super.onCreate(savedInstanceState)",
    "        val requestedScreen = intent.getStringExtra(\"splitstudio.screen\")",
    "        setContent {",
    "            MaterialTheme {",
    "                when (requestedScreen) {",
    branches,
    `                    else -> ${fallbackScreen}()`,
    "                }",
    "            }",
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}
