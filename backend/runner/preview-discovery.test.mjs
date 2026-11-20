import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewActivity, discoverPreviewTargets } from "./preview-discovery.mjs";

test("discovers zero-argument composables and default-parameter composables", () => {
  const targets = discoverPreviewTargets(`
    @Composable
    fun HomeScreen() {}

    @Composable
    fun Greeting(name: String = "Android") {}
  `);
  assert.deepEqual(targets.map((target) => target.name), ["HomeScreen", "Greeting"]);
});

test("discovers PreviewParameter providers with nested annotation arguments", () => {
  const targets = discoverPreviewTargets(`
    @Preview(showBackground = true)
    @Composable
    fun UserCard(
      @PreviewParameter(UserProvider::class) user: User,
      compact: Boolean = false,
    ) {}
  `);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].name, "UserCard");
  assert.match(targets[0].render, /UserProvider\(\)\.values\.take\(5\)/);
  assert.match(targets[0].render, /for \(previewValue in/);
});

test("marks unsupported required preview parameters without a provider", () => {
  const targets = discoverPreviewTargets(`
    @Preview
    @Composable
    fun ProductCard(product: Product) {}
  `);
  assert.deepEqual(targets, [{ name: "ProductCard", unsupported: true }]);
});

test("does not expose private composables as standalone previews", () => {
  const targets = discoverPreviewTargets(`
    @Composable
    private fun InternalButton() {}

    @Composable
    internal fun PublicScreen() {}
  `);
  assert.deepEqual(targets.map((target) => target.name), ["PublicScreen"]);
});

test("generates a standalone Activity with supported preview branches", () => {
  const activity = buildPreviewActivity([
    { name: "HomeScreen", render: "HomeScreen()" },
    { name: "UserCard", render: "Column { UserCard(UserProvider().values.first()) }" },
    { name: "UnsupportedScreen", unsupported: true },
  ], "HomeScreen");
  assert.match(activity, /class SplitStudioPreviewActivity : ComponentActivity/);
  assert.match(activity, /"HomeScreen" -> HomeScreen\(\)/);
  assert.match(activity, /"UserCard" -> Column/);
  assert.doesNotMatch(activity, /UnsupportedScreen/);
  assert.match(activity, /else -> HomeScreen\(\)/);
});
