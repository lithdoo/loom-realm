import { parentPort } from "node:worker_threads";
import {
  RealmStateError,
  createRealmStateAuthority,
  jsonValueMetrics,
  prepareRealmStateDefinition,
} from "../dist/index.js";

try {
  const a = { namespace: "é", key: "x" };
  const b = { namespace: "z", key: "x" };
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([
    { namespace: a.namespace, key: a.key, value: { emoji: "😀" } },
  ]));
  const initial = await authority.read([a, b]);
  const commit = await authority.commit({
    conditions: [{ key: b, version: 0 }],
    writes: [{ type: "put", key: b, value: [1, 2, 3] }],
  });
  let conflict = null;
  try {
    await authority.commit({
      conditions: [{ key: b, version: 0 }],
      writes: [{ type: "put", key: b, value: 4 }],
    });
  } catch (error) {
    if (error instanceof RealmStateError) conflict = error.code;
  }
  parentPort.postMessage({
    initialOrder: initial.records.map((record) => record.key.namespace),
    size: jsonValueMetrics({ emoji: "😀" }),
    revision: commit.revision,
    conflict,
    scan: await authority.scan(),
  });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.stack : String(error) });
}
