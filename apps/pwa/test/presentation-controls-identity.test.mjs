import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repo = join(import.meta.dirname, "..", "..", "..");
const builtControls = join(repo, "game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js");
const installedCopies = Object.freeze([
  ["PokeMan", join(repo, "examples", "PokeMan", "[FSDB]PokeMan", "[resource]Presentation", "controls", "device-input.browser.js.js")],
  ["essentials", join(repo, "examples", "essentials-v21.1", "[FSDB]essentials-v21.1", "[resource]Presentation", "controls", "device-input.browser.js.js")],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("game presentation controls match the bundle the qualification shell evaluates first", async () => {
  const built = await readFile(builtControls);
  const builtText = built.toString("utf8");
  const builtHash = sha256(built);
  assert.ok(builtText.includes('TypeError("Game Common Controls element collision: "'));
  assert.ok(builtText.includes("game-keyboard-input"));
  assert.ok(builtText.includes("Vendor:") && builtText.includes("4001") && builtText.includes("0428"));
  for (const [name, path] of installedCopies) {
    const installed = await readFile(path);
    assert.equal(
      sha256(installed),
      builtHash,
      `${name} Presentation/controls/device-input.browser.js drifted from the built controls bundle. `
      + "The qualification document evaluates that bundle while booting the demo, then loads this resource for the game. "
      + "Bootstrap re-evaluates a script only when its content hash differs, and the second copy then throws "
      + "Game Common Controls element collision: game-keyboard-input.",
    );
  }
});
