import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { run as runImporter } from "../tools/fixtures/essentials-v21.1/import.mjs";
import { buildSourceManifest } from "../tools/fixtures/essentials-v21.1/lib/source/manifest.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(repository, ".local", "m15-essentials");
const electronRoot = path.dirname(fileURLToPath(import.meta.resolve("electron")));

function argumentsOf(argv) {
  const result = { mapId: 47, x: 35, y: 21, characterName: "trainer_POKEMONTRAINER_Red", screenshot: path.join(repository, "artifacts", "m15-essentials-v21.1-electron.png") };
  if (argv.length === 1 && !argv[0].startsWith("--")) argv = ["--source", argv[0]];
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    if (value === undefined || !["--source", "--map-id", "--x", "--y", "--character-name", "--screenshot"].includes(name)) throw new Error(`Invalid M15 exact-source argument ${name ?? ""}`);
    if (name === "--source") result.source = path.resolve(value);
    else if (name === "--character-name") result.characterName = value;
    else if (name === "--screenshot") result.screenshot = path.resolve(value);
    else result[name === "--map-id" ? "mapId" : name.slice(2)] = Number(value);
  }
  if (!result.source) throw new Error("Missing --source <Essentials v21.1 ZIP or directory>");
  for (const name of ["mapId", "x", "y"]) if (!Number.isSafeInteger(result[name]) || result[name] < (name === "mapId" ? 1 : 0)) throw new Error(`Invalid ${name}`);
  return result;
}

async function fingerprint(source) {
  const info = await stat(source);
  if (info.isFile()) return createHash("sha256").update(await readFile(source)).digest("hex");
  const manifest = await buildSourceManifest(source);
  const lines = manifest.objects.filter((item) => item.kind === "file").map((item) => `${item.relativePath}\0${item.sha256}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function prepareInstallation(options) {
  await mkdir(workRoot, { recursive: true });
  const installationRoot = await mkdtemp(path.join(workRoot, "installation-"));
  const subsystems = path.join(installationRoot, "subsystems");
  await mkdir(subsystems, { recursive: true });
  await Promise.all([
    writeFile(path.join(installationRoot, "game.json"), `${JSON.stringify({
      formatVersion: 1,
      initial: { subsystem: "map", input: { mapId: options.mapId, x: options.x, y: options.y, characterName: options.characterName } },
      subsystems: [{ key: "map" }],
    }, null, 2)}\n`),
    writeFile(path.join(installationRoot, "launch.hostra.json"), '{"formatVersion":1,"subsystems":[{"key":"map","module":"subsystems/map.mjs"}]}\n'),
    writeFile(path.join(subsystems, "map.mjs"), 'export { default } from "@loomrealm-game/map";\n'),
  ]);
  const fsdbRoot = await runImporter(["--source", options.source, "--output", installationRoot]);
  const presentationRoot = path.join(fsdbRoot, "[resource]Presentation");
  await Promise.all([
    mkdir(path.join(presentationRoot, "map"), { recursive: true }),
    mkdir(path.join(presentationRoot, "essentials"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(presentationRoot, ".desc.meta"), "M15 trusted presentation resources for exact-source qualification.\n"),
    copyFile(path.join(repository, "game-libs", "map", "browser", "map.css"), path.join(presentationRoot, "map", "map.css.css")),
    copyFile(path.join(repository, "game-libs", "map", "browser", "map.browser.js"), path.join(presentationRoot, "map", "map.browser.js.js")),
    copyFile(path.join(repository, "examples", "essentials-v21.1", "presentation.css"), path.join(presentationRoot, "essentials", "page.css.css")),
  ]);
  return installationRoot;
}

const options = argumentsOf(process.argv.slice(2));
assert.equal(existsSync(options.source), true, `Source does not exist: ${options.source}`);
const sourceFingerprint = `sha256:${await fingerprint(options.source)}`;
const installationRoot = await prepareInstallation(options);
await mkdir(path.dirname(options.screenshot), { recursive: true });
const environment = { ...process.env, LOOMREALM_DESKTOP_INSTALLATION_ROOT: installationRoot };
delete environment.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({
    executablePath: path.join(electronRoot, "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: [path.join(repository, "apps", "desktop", "dist", "main-entry.js")],
    env: environment,
  });
  const page = await application.firstWindow();
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 30_000 });
  await page.bringToFront();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
  await page.waitForFunction(() => document.hasFocus());
  await page.waitForFunction(() => {
    const canvases = [
      document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas"),
      document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas"),
    ];
    return canvases.every((canvas) => {
      if (!canvas?.width || !canvas?.height) return false;
      const values = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < values.length; index += 4) if (values[index + 3] !== 0 && (values[index] !== 0 || values[index + 1] !== 0 || values[index + 2] !== 0)) return true;
      return false;
    });
  }, null, { timeout: 20_000 });
  const visible = await page.evaluate(() => {
    const hasVisibleColor = (canvas) => {
      const values = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < values.length; index += 4) if (values[index + 3] !== 0 && (values[index] !== 0 || values[index + 1] !== 0 || values[index + 2] !== 0)) return true;
      return false;
    };
    const view = document.querySelector("lr-map-view");
    const sprite = document.querySelector("lr-map-sprite");
    return {
      map: hasVisibleColor(view.shadowRoot.querySelector("canvas")),
      player: hasVisibleColor(sprite.shadowRoot.querySelector("canvas")),
      size: [getComputedStyle(view).width, getComputedStyle(view).height],
      playerBefore: sprite.shadowRoot.querySelector("canvas").toDataURL(),
    };
  });
  assert.deepEqual(visible.size, ["640px", "480px"]);
  assert.equal(visible.map, true); assert.equal(visible.player, true);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((before) => document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").toDataURL() !== before, visible.playerBefore, { timeout: 5_000 });
  await page.screenshot({ path: options.screenshot, fullPage: true });
  const record = {
    sourceFingerprint,
    selection: { mapId: options.mapId, x: options.x, y: options.y, characterName: options.characterName },
    runtime: "Electron BrowserWindow + Hostra process.execPath Runner + Desktop Data/Content",
    evidence: { viewport: visible.size, mapVisible: visible.map, playerVisible: visible.player, trustedArrowRightChangedPlayerFrame: true },
    screenshot: options.screenshot,
    pass: true,
  };
  await writeFile(path.join(workRoot, "last-electron-qualification.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
} finally {
  if (application) await application.close().catch(() => {});
  await rm(installationRoot, { recursive: true, force: true });
}
