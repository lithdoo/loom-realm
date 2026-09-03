import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-hostra-pack-"));

try {
  const npmArguments = [
    "pack",
    "-w",
    "@loomrealm/game-launcher-hostra",
    "--pack-destination",
    temporary,
    "--json",
  ];
  const output = execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    npmArguments,
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  const packed = JSON.parse(output)[0];
  const tarball = path.join(temporary, packed.filename);
  execFileSync("tar", ["-xzf", tarball, "-C", temporary]);
  const packageRoot = path.join(temporary, "package");
  await symlink(
    path.join(root, "node_modules"),
    path.join(packageRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const entry = path.join(packageRoot, "dist", "index.js");
  const runner = path.join(packageRoot, "dist", "runner", "entry.js");
  if (!(await stat(entry)).isFile() || !(await stat(runner)).isFile()) {
    throw new Error("Packed Hostra artifacts are incomplete");
  }
  const imported = await import(pathToFileURL(entry).href);
  if (
    typeof imported.prepareHostraGame !== "function" ||
    typeof imported.createHostraRuntimeHosting !== "function"
  ) {
    throw new Error("Packed Hostra public surface is not importable");
  }
  const smoke = spawnSync(process.execPath, [runner], {
    cwd: packageRoot,
    env: {},
    encoding: "utf8",
    timeout: 10_000,
  });
  if (smoke.status !== 1) {
    throw new Error("Packed Runner did not fail closed without bootstrap");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
