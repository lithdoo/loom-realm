import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function fsdbs(root) {
  if (!await exists(root)) return [];
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("[FSDB]"))
    .map((entry) => join(root, entry.name));
}

export function backupPath(workRoot) {
  return join(workRoot, "backup.fsdb");
}

export async function assertNoPendingBackup(workRoot) {
  const backup = backupPath(workRoot);
  if (await exists(backup)) {
    throw new Error([
      `Unresolved FSDB backup: ${backup}`,
      "Close the game, inspect the formal FSDB and this backup, then restore or archive the backup manually before retrying.",
    ].join("\n"));
  }
}

async function restoreOriginal({ backup, original, target, candidateInstalled }) {
  if (candidateInstalled && await exists(target)) await rm(target, { recursive: true });
  if (original !== null && await exists(backup)) await rename(backup, original);
}

export async function installCandidate({ exampleRoot, workRoot, candidateRoot, verify }) {
  await mkdir(workRoot, { recursive: true });
  await assertNoPendingBackup(workRoot);

  const candidates = await fsdbs(candidateRoot);
  if (candidates.length !== 1) throw new Error(`Candidate root must contain exactly one [FSDB]*, found ${candidates.length}`);
  await verify(candidateRoot);

  const formal = await fsdbs(exampleRoot);
  if (formal.length > 1) throw new Error("Formal example contains more than one [FSDB]*");
  if ((await stat(exampleRoot)).dev !== (await stat(candidateRoot)).dev) {
    throw new Error("Candidate and formal FSDB must be on the same filesystem");
  }

  const original = formal[0] ?? null;
  const target = join(exampleRoot, basename(candidates[0]));
  const backup = backupPath(workRoot);
  let originalMoved = false;
  let candidateInstalled = false;

  try {
    if (original !== null) {
      await rename(original, backup);
      originalMoved = true;
    }
    await rename(candidates[0], target);
    candidateInstalled = true;
    await verify(exampleRoot);
    if (originalMoved) await rm(backup, { recursive: true });
  } catch (error) {
    try {
      await restoreOriginal({ backup, original, target, candidateInstalled });
    } catch (restoreError) {
      throw new Error([
        `FSDB install failed: ${error instanceof Error ? error.message : String(error)}`,
        `Automatic rollback also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        `The previous FSDB backup was left at: ${backup}`,
        "Close the game and restore that backup manually before retrying.",
      ].join("\n"), { cause: error });
    }
    throw error;
  }
}

export async function resetCandidateRoot(path) {
  await mkdir(path, { recursive: true });
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}
