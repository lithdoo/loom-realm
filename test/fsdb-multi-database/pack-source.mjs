import { createHash } from "node:crypto";
import { listFsdbEntries, listFsdbPaths, openFsdb, openFsdbObject } from "@loomrealm/fsdb";

async function readEntry(db, identity) {
  const lease = await openFsdbObject(db, identity, new AbortController().signal);
  if (!lease) throw new Error("Indexed FSDB entry disappeared during packaging");
  const chunks = [];
  try {
    for await (const chunk of lease.stream) chunks.push(Buffer.from(chunk));
  } finally {
    await lease.close();
  }
  return Buffer.concat(chunks);
}

/**
 * Consumer-side reference packager. A failure from any database rejects the
 * whole call, so the caller does not receive a partial bundle.
 */
export async function packFsdbRoot(root) {
  const paths = await listFsdbPaths({ root });
  const content = [];
  for (const databasePath of paths) {
    const db = await openFsdb({ root, path: databasePath });
    try {
      for (const descriptor of listFsdbEntries(db)) {
        const bytes = await readEntry(db, descriptor.identity);
        const kind = descriptor.identity.kind === "group" ? "group" : descriptor.identity.kind === "resource" ? "resource" : "record";
        content.push(Object.freeze({
          databasePath,
          kind,
          namespace: `${descriptor.identity.kind}.${descriptor.identity.table}`,
          key: descriptor.identity.key,
          mime: descriptor.contentType,
          bytes,
          contentVersion: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        }));
      }
    } finally {
      await db.close();
    }
  }
  return Object.freeze(content);
}
