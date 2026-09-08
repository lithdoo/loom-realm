import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.argv[2];
if (!root) throw new TypeError("Test tree root is required");

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (entry.isFile() && entry.name.endsWith(".test.mjs")) result.push(path);
  }
  return result;
}

const files = (await collect(resolve(root))).sort();
if (files.length === 0) throw new Error(`No tests found under ${root}`);
const child = spawn(process.execPath, ["--test", ...files], { stdio: "inherit", shell: false });
const code = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (exitCode, signal) => resolveExit(signal === null ? (exitCode ?? 1) : 1));
});
process.exitCode = code;
