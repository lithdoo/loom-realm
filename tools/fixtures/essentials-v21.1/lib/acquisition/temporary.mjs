import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function removeOwnedDirectory(parent, target) {
  const absoluteParent = resolve(parent);
  const absoluteTarget = resolve(target);
  if (absoluteParent === absoluteTarget || !isWithin(absoluteParent, absoluteTarget)) {
    throw new Error(`Refusing to remove non-owned path: ${absoluteTarget}`);
  }
  await rm(absoluteTarget, { recursive: true, force: true });
}
