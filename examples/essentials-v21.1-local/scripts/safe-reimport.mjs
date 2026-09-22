import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const RECORD_VERSION = 1;
const PHASES = new Set(["prepared", "backing-up", "installing", "verifying", "cleanup"]);

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function fsdbs(root) {
  if (!await exists(root)) return [];
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("[FSDB]"))
    .map((entry) => join(root, entry.name));
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function childFsdb(path, root, label) {
  if (typeof path !== "string" || !samePath(dirname(path), root) || !basename(path).startsWith("[FSDB]")) {
    throw new Error(`Recovery record ${label} is outside its owned root`);
  }
}

function validateRecord(record, { exampleRoot, workRoot }) {
  if (record?.version !== RECORD_VERSION || !["initial", "replace"].includes(record.mode) || !PHASES.has(record.phase)) {
    throw new Error("Cannot safely recover FSDB switch; recovery record is invalid");
  }
  childFsdb(record.target, exampleRoot, "target");
  if (record.mode === "replace") childFsdb(record.original, exampleRoot, "original");
  else if (record.original !== null) throw new Error("Initial-install recovery record must not name an original FSDB");
  if (!samePath(record.backup, join(workRoot, "backup.fsdb"))) throw new Error("Recovery backup is outside the owned work root");
  return record;
}

async function writeRecord(recordPath, record) {
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, "utf8");
}

async function verifyInstalled(verify, exampleRoot) {
  if (typeof verify !== "function") return false;
  try { await verify(exampleRoot); return true; } catch { return false; }
}

export async function recoverReimport({ exampleRoot, workRoot, verify, preferRollback = false }) {
  const recordPath = join(workRoot, "recovery.json");
  if (!await exists(recordPath)) return;
  const record = validateRecord(JSON.parse(await readFile(recordPath, "utf8")), { exampleRoot, workRoot });
  const formal = await fsdbs(exampleRoot);
  const targetExists = await exists(record.target);
  const backupExists = await exists(record.backup);
  const originalExists = record.original !== null && await exists(record.original);
  const mayHaveInstalled = ["installing", "verifying", "cleanup"].includes(record.phase);

  if (formal.length > 1 || formal.some((path) => !samePath(path, record.target) && !samePath(path, record.original))) {
    throw new Error("Cannot safely recover FSDB switch; formal FSDB evidence is ambiguous");
  }

  if (mayHaveInstalled && targetExists) {
    if (!(preferRollback && record.phase !== "cleanup") && await verifyInstalled(verify, exampleRoot)) {
      if (backupExists) await rm(record.backup, { recursive: true });
      await rm(recordPath);
      await rm(join(workRoot, "lock"), { recursive: true, force: true });
      return;
    }
    await rm(record.target, { recursive: true });
  }

  if (record.mode === "replace") {
    if (backupExists) {
      if (originalExists || (await fsdbs(exampleRoot)).length !== 0) {
        throw new Error("Cannot safely recover FSDB switch; both original and backup are present");
      }
      await rename(record.backup, record.original);
    } else if (!originalExists) {
      throw new Error("Cannot safely recover replacement; neither original nor owned backup exists");
    }
  } else if ((await fsdbs(exampleRoot)).length !== 0) {
    throw new Error("Cannot safely recover initial install; an unverified formal FSDB remains");
  }

  await rm(recordPath);
  await rm(join(workRoot, "lock"), { recursive: true, force: true });
}

export async function installCandidate({ exampleRoot, workRoot, candidateRoot, verify, fault = () => {}, simulateCrash = false }) {
  await mkdir(workRoot, { recursive: true });
  await recoverReimport({ exampleRoot, workRoot, verify });
  const candidates = await fsdbs(candidateRoot);
  if (candidates.length !== 1) throw new Error(`Candidate root must contain exactly one [FSDB]*, found ${candidates.length}`);
  await verify(candidateRoot);
  const formal = await fsdbs(exampleRoot);
  if (formal.length > 1) throw new Error("Formal example contains more than one [FSDB]*");
  const deviceA = (await stat(exampleRoot)).dev;
  const deviceB = (await stat(candidateRoot)).dev;
  if (deviceA !== deviceB) throw new Error("Candidate and formal FSDB must be on the same filesystem");
  const lock = join(workRoot, "lock");
  try { await mkdir(lock); } catch (error) { throw new Error(`Another reimport is active: ${error?.message ?? error}`); }

  const target = join(exampleRoot, basename(candidates[0]));
  const backup = join(workRoot, "backup.fsdb");
  const original = formal[0] ?? null;
  const recordPath = join(workRoot, "recovery.json");
  let record = {
    version: RECORD_VERSION,
    mode: original === null ? "initial" : "replace",
    phase: "prepared",
    original,
    backup,
    target,
  };
  let crashed = false;
  const checkpoint = async (name) => {
    try { await fault(name); } catch (error) { if (simulateCrash) crashed = true; throw error; }
  };
  const phase = async (value) => {
    record = { ...record, phase: value };
    await writeRecord(recordPath, record);
  };

  try {
    if (await exists(backup)) throw new Error("Stale backup exists without a recovery record");
    await writeRecord(recordPath, record);
    await checkpoint("after-record");
    if (original !== null) {
      await phase("backing-up");
      await rename(original, backup);
      await checkpoint("after-backup");
    }
    await phase("installing");
    await rename(candidates[0], target);
    await checkpoint("after-install");
    await phase("verifying");
    await verify(exampleRoot);
    await phase("cleanup");
    await checkpoint("after-verify");
    if (await exists(backup)) await rm(backup, { recursive: true });
    await checkpoint("after-backup-cleanup");
    await rm(recordPath);
  } catch (error) {
    if (!crashed) await recoverReimport({ exampleRoot, workRoot, verify, preferRollback: true });
    throw error;
  } finally {
    if (!crashed) await rm(lock, { recursive: true, force: true });
  }
}

export async function resetCandidateRoot(path) {
  const resolved = dirname(path);
  await mkdir(resolved, { recursive: true });
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}
