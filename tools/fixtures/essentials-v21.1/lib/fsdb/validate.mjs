import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail } from "../errors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../../../../..");

export async function validateWithProductionFsdb(stagingPath) {
  const modulePath = join(REPOSITORY_ROOT, "packages", "fsdb-http", "dist", "index.js");
  let openFsdb;
  try { ({ openFsdb } = await import(pathToFileURL(modulePath).href)); } catch {
    fail("FSDB_VALIDATION_FAILURE", "Cannot load built @loomrealm/fsdb-http production entry point");
  }
  try {
    const db = await openFsdb({ root: stagingPath });
    await db.close();
  } catch (error) {
    fail("FSDB_VALIDATION_FAILURE", `Production openFsdb() rejected the generated fixture: ${error.message}`);
  }
}
