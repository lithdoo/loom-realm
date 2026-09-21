import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const scripts = JSON.parse(await read("package.json")).scripts;
const pr = await read(".github/workflows/m12-m15-pr.yml");

const m13Only = "npm run test:m13:qualification:run && node --test test/m13-boundary.test.mjs && npm run test:m13:pack";
const m14Only = "node --test test/m14-boundary.test.mjs && npm run test:m14:projection && npm test -w @loomrealm-game/map && npm test -w @loomrealm-example/essentials-v21.1 && npm run test:m14:vertical && npm run test:m14:pack";
const m15Only = "npm run test:m15:desktop && npm run test:m15:hostra";

test("M12 runs its original full regression, boundaries, fixtures and pack on PR", () => {
  for (const command of [
    "npm run test:regression", "npm run test:m10:qualification:run", "node --test test/m10-boundary.test.mjs",
    "npm run test:m11:qualification:run", "node --test test/m11-boundary.test.mjs", "npm run test:fixtures",
    "node --test test/m12-boundary.test.mjs", "npm run test:m12:pack",
  ]) assert.ok(scripts["test:m12"].includes(command), `Missing M12 command: ${command}`);
});

test("M13 canonical chain remains intact and its PR suite equals the exclusive M13 suffix", () => {
  assert.equal(scripts["test:m13"], `npm run test:m12 && ${m13Only}`);
  assert.equal(scripts["test:m13:pr"], `npm run build:desktop-stack && ${m13Only}`);
  assert.ok(scripts["build:desktop-stack"].includes("-w @loomrealm/renderer"));
});

test("M14 canonical chain remains intact and its PR suite contains every exclusive M14 check", () => {
  assert.equal(scripts["test:m14"], "npm run test:m13 && npm run test:m14:pr");
  assert.equal(scripts["test:m14:pr"], `npm run build:m14 && ${m14Only}`);
  assert.ok(scripts["build:m14"].includes("-w @loomrealm-game/map"));
});

test("M15 runs every exclusive check and builds exactly once per clean runner", () => {
  assert.equal(scripts["test:m15"], `npm run test:m14 && ${m15Only}`);
  assert.equal(scripts["test:m15:pr"], `npm run build:m15 && ${m15Only}`);
  assert.equal(scripts["build:m15"], "npm run build:m14");
  assert.match(scripts["test:m15:hostra"], /--test-concurrency=1/);
});

test("one PR workflow runs M12 and each exclusive milestone on its full Node matrix", () => {
  assert.match(pr, /^on:\s*\n\s+pull_request:/m);
  assert.match(pr, /cancel-in-progress: true/);
  for (const name of ["m12", "m13", "m14"]) {
    const section = pr.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  (?:m12|m13|m14|m15|qualification):|$(?![\\s\\S]))`, "m"))?.[1];
    assert.ok(section, `Missing ${name} job`);
    assert.match(section, /node: \[20, 24\]/);
    assert.match(section, new RegExp(`npm run test:${name}${name === "m12" ? "" : ":pr"}`));
    assert.match(section, /if: always\(\)/);
    assert.match(section, /if-no-files-found: error/);
  }
  assert.match(pr, /name: M15 delta \/ Node 24/);
  assert.match(pr, /node-version: 24/);
  assert.match(pr, /npm run test:m15:pr/);
  assert.match(pr, /d863beab3c59c3bd4f271514a228fa8fee0bf5b6/);
  assert.match(pr, /chmod 4755/);
  assert.doesNotMatch(pr, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});

test("the PR summary fails for any failed, cancelled or skipped milestone", () => {
  assert.match(pr, /needs: \[m12, m13, m14, m15\]/);
  assert.match(pr, /if: always\(\)/);
  for (const name of ["m12", "m13", "m14", "m15"]) assert.match(pr, new RegExp(`needs\\.${name}\\.result`));
  assert.match(pr, /if \[ "\$result" != success \]; then/);
  assert.match(pr, /exit 1/);
  assert.doesNotMatch(pr, /continue-on-error:/);
});

test("legacy canonical full closures run on main and manual dispatch, not redundantly on PR", async () => {
  for (const name of ["m12", "m13", "m14", "m15"]) {
    const workflow = await read(`.github/workflows/${name}.yml`);
    assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^  pull_request:/m);
    assert.match(workflow, new RegExp(`npm run test:${name}(?!:)`));
    assert.match(workflow, /if-no-files-found: error/);
  }
});
