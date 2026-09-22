import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverReimport } from "./safe-reimport.mjs";

const exampleRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
await recoverReimport({ exampleRoot, workRoot: join(repoRoot, ".local", "essentials-v21.1-reimport") });
