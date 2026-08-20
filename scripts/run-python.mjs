import { spawnSync } from "node:child_process";

const script = process.argv[2];
if (script === undefined) {
  console.error("usage: node scripts/run-python.mjs <script> [...args]");
  process.exit(2);
}

const candidates = process.platform === "win32"
  ? [
      { command: "python", prefix: [] },
      { command: "py", prefix: ["-3"] },
      { command: "python3", prefix: [] },
    ]
  : [
      { command: "python3", prefix: [] },
      { command: "python", prefix: [] },
    ];

for (const candidate of candidates) {
  const result = spawnSync(
    candidate.command,
    [...candidate.prefix, script, ...process.argv.slice(3)],
    { stdio: "inherit" },
  );
  if (result.error?.code === "ENOENT") continue;
  if (result.error !== undefined) throw result.error;
  process.exit(result.status ?? 1);
}

console.error("Python 3 interpreter not found");
process.exit(127);
