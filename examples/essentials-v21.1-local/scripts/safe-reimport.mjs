import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function fsdbs(root) {
  if (!await exists(root)) return [];
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("[FSDB]"))
    .map((entry) => join(root, entry.name));
}

export async function recoverReimport({ exampleRoot, workRoot }) {
  const recordPath = join(workRoot, "recovery.json");
  if (!await exists(recordPath)) return;
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const formal = await fsdbs(exampleRoot);
  const backupExists = await exists(record.backup);
  if (formal.length === 0 && backupExists) await rename(record.backup, record.original);
  else if (formal.length === 1 && backupExists) {
    await rm(formal[0], { recursive: true, force: true });
    await rename(record.backup, record.original);
  } else if (formal.length > 1 || (!backupExists && formal.length !== 1)) {
    throw new Error("Cannot safely recover FSDB switch; recovery evidence is ambiguous");
  }
  await rm(recordPath, { force: true });
}

export async function installCandidate({ exampleRoot, workRoot, candidateRoot, verify }) {
  await mkdir(workRoot, { recursive: true });
  await recoverReimport({ exampleRoot, workRoot });
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
  const target = join(exampleRoot, candidates[0].split(/[\\/]/u).at(-1));
  const backup = join(workRoot, "backup.fsdb");
  const original = formal[0] ?? target;
  const recordPath = join(workRoot, "recovery.json");
  try {
    if (await exists(backup)) throw new Error("Stale backup exists without a recovery record");
    await writeFile(recordPath, `${JSON.stringify({ original, backup, target })}\n`, { flag: "wx" });
    if (formal[0]) await rename(formal[0], backup);
    try {
      await rename(candidates[0], target);
      await verify(exampleRoot);
    } catch (error) {
      if (await exists(target)) await rm(target, { recursive: true, force: true });
      if (await exists(backup)) await rename(backup, original);
      throw error;
    }
    if (await exists(backup)) await rm(backup, { recursive: true, force: true });
    await rm(recordPath, { force: true });
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function resetCandidateRoot(path) {
  const resolved = dirname(path);
  await mkdir(resolved, { recursive: true });
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}
