import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPreviewActivity, discoverPreviewTargets } from "./preview-discovery.mjs";

const packageDir = join(
  process.cwd(),
  "backend/projects/hello-compose/app/src/main/java/com/splitstudio/hello"
);
const fixture = `package com.splitstudio.hello

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider

class CiSampleProvider : PreviewParameterProvider<String> {
    override val values = sequenceOf("one", "two")
}

@Composable
fun CiSimpleScreen() {
    Text("CI preview")
}

@Preview(showBackground = true)
@Composable
fun ParameterizedCiScreen(
    @PreviewParameter(CiSampleProvider::class) value: String
) {
    Text(value)
}
`;


const targets = discoverPreviewTargets(mainSource + "\n" + fixture);
if (!targets.some((target) => target.name === "CiSimpleScreen") ||
    !targets.some((target) => target.name === "ParameterizedCiScreen" && !target.unsupported)) {
  throw new Error("CI preview fixture did not discover both simple and parameterized composables.");
}
writeFileSync(join(packageDir, "PreviewFixture.kt"), fixture, "utf8");
writeFileSync(join(packageDir, "SplitStudioPreviewActivity.kt"), buildPreviewActivity(targets, "CiSimpleScreen"), "utf8");
