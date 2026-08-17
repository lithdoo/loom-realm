import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fail } from "../errors.mjs";
import { removeOwnedDirectory } from "../acquisition/temporary.mjs";

const OUTPUT_BASENAME = "[FSDB]Essentials v21.1";

export async function prepareOutputParent(input) {
  const outputParent = resolve(input);
  await mkdir(outputParent, { recursive: true });
  const item = await lstat(outputParent);
  if (!item.isDirectory()) fail("COPY_FAILURE", `Output parent is not a directory: ${outputParent}`);
  return await realpath(outputParent);
}

export async function reserveOutput(outputParent) {
  for (let suffix = 1; ; suffix += 1) {
    const logicalName = suffix === 1 ? OUTPUT_BASENAME : `${OUTPUT_BASENAME} ${suffix}`;
    const finalPath = join(outputParent, logicalName);
    try { await lstat(finalPath); continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const reservationPath = join(outputParent, `.${logicalName}.reserve`);
    let reservation;
    try { reservation = await open(reservationPath, "wx"); } catch (error) { if (error.code === "EEXIST") continue; throw error; }
    try {
      await lstat(finalPath);
      await reservation.close();
      await rm(reservationPath, { force: true });
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") {
        await reservation.close();
        await rm(reservationPath, { force: true });
        throw error;
      }
    }
    const stagingContainer = join(outputParent, `.essentials-v21.1.${randomBytes(8).toString("hex")}.staging`);
    const stagingPath = join(stagingContainer, logicalName);
    try {
      await mkdir(stagingPath, { recursive: true });
      return { logicalName, finalPath, stagingContainer, stagingPath, reservationPath, reservation };
    } catch (error) {
      await reservation.close();
      await rm(reservationPath, { force: true });
      throw error;
    }
  }
}

export async function promoteOutput(transaction, outputParent) {
  await rename(transaction.stagingPath, transaction.finalPath);
  transaction.stagingPath = undefined;
  await transaction.reservation.close().catch(() => {});
  transaction.reservation = undefined;
  await rm(transaction.reservationPath, { force: true }).catch(() => {});
  await removeOwnedDirectory(outputParent, transaction.stagingContainer).catch(() => {});
  transaction.stagingContainer = undefined;
}

export async function cleanupOutput(transaction, outputParent) {
  if (transaction?.reservation) await transaction.reservation.close().catch(() => {});
  if (transaction?.reservationPath) await rm(transaction.reservationPath, { force: true }).catch(() => {});
  if (transaction?.stagingContainer) await removeOwnedDirectory(outputParent, transaction.stagingContainer).catch(() => {});
}
