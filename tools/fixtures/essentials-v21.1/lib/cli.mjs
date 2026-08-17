import { fail } from "./errors.mjs";

export function parseArguments(argv, cwd = process.cwd()) {
  const result = { source: undefined, output: cwd };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== "--source" && name !== "--output") fail("INVALID_ARGUMENT", `Unknown argument: ${name}`);
    if (seen.has(name)) fail("INVALID_ARGUMENT", `Duplicate argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("INVALID_ARGUMENT", `Missing value for ${name}`);
    seen.add(name);
    result[name === "--source" ? "source" : "output"] = value;
    index += 1;
  }
  return result;
}
