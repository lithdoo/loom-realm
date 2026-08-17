import { lstat, open } from "node:fs/promises";
import { fail } from "../errors.mjs";
import { fingerprint, sameFingerprint } from "./fingerprint.mjs";

export function createSourceReader(manifest) {
  const byPath = new Map(manifest.objects.map((object) => [object.relativePath, object]));
  return Object.freeze({
    get(relativePath) {
      return byPath.get(relativePath.normalize("NFC"));
    },
    async *open(objectOrPath) {
      const object = typeof objectOrPath === "string" ? byPath.get(objectOrPath.normalize("NFC")) : objectOrPath;
      if (!object || object.kind !== "file") fail("SOURCE_CHANGED", `Manifest file is unavailable: ${String(objectOrPath)}`);
      const before = await lstat(object.sourcePath);
      if (!before.isFile() || before.isSymbolicLink() || !sameFingerprint(object.fingerprint, fingerprint(before))) {
        fail("SOURCE_CHANGED", `Source changed after manifest: ${object.physicalRelativePath}`);
      }
      const handle = await open(object.sourcePath, "r");
      try {
        const opened = await handle.stat();
        if (!sameFingerprint(object.fingerprint, fingerprint(opened))) fail("SOURCE_CHANGED", `Source changed while opening: ${object.physicalRelativePath}`);
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        while (true) {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
          if (bytesRead === 0) break;
          position += bytesRead;
          yield Buffer.from(buffer.subarray(0, bytesRead));
        }
        const after = await handle.stat();
        if (!sameFingerprint(object.fingerprint, fingerprint(after)) || BigInt(position) !== object.size) {
          fail("SOURCE_CHANGED", `Source changed while reading: ${object.physicalRelativePath}`);
        }
      } finally {
        await handle.close();
      }
    },
  });
}
