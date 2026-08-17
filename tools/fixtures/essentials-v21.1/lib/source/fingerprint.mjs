import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

export function fingerprint(item) {
  return { dev: item.dev, ino: item.ino, size: item.size, mtimeMs: item.mtimeMs, ctimeMs: item.ctimeMs };
}

export function sameFingerprint(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export async function sha256File(path) {
  const handle = await open(path, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}
