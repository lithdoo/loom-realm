import { basename, extname } from "node:path";
import { structuredObject } from "./structured.mjs";

const INTERNAL_DOMAINS = new Set(["MarshalRoots", "RmxpRoots", "PbsDocuments", "DerivedSemantics"]);

function collectReferences(value, output = [], seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (typeof value.domain === "string" && typeof value.id === "string" && Object.keys(value).every((key) => key === "domain" || key === "id")) {
    output.push(Object.freeze({ table: value.domain, key: value.id }));
    return output;
  }
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return output;
  for (const child of Object.values(value)) collectReferences(child, output, seen);
  return output;
}

function fileKey(filename) {
  const leaf = basename(filename);
  return leaf.slice(0, leaf.length - extname(leaf).length).replace(/[^\p{L}\p{N}_-]/gu, "_");
}

export function mapCanonicalDataset(canonicalDataset) {
  const tableRecords = new Map();
  for (const [domain, records] of Object.entries(canonicalDataset.domains)) {
    if (INTERNAL_DOMAINS.has(domain) || !Array.isArray(records)) continue;
    tableRecords.set(domain, records.map((record) => ({ key: String(record.id), value: record })));
  }
  const pbs = canonicalDataset.domains.PbsDocuments ?? [];
  tableRecords.set("PbsDocument", pbs.map((document) => ({ key: fileKey(document.file), value: document })));
  const rmxp = canonicalDataset.domains.RmxpRoots ?? [];
  tableRecords.set("RmxpRoot", rmxp.map((root) => ({ key: root.filename.replace(/\./gu, "_"), value: root })));
  const semantic = canonicalDataset.domains.DerivedSemantics;
  if (semantic) tableRecords.set("DerivedSemantic", Object.entries(semantic).map(([key, value]) => ({ key, value: Object.freeze({ id: key, values: value }) })));

  const tables = [];
  const objects = [];
  for (const [name, records] of [...tableRecords].sort(([left], [right]) => left.localeCompare(right))) {
    if (records.length === 0) continue;
    tables.push(Object.freeze({ kind: "struct", name, schema: Object.freeze({ type: "object" }) }));
    for (const record of records) objects.push(structuredObject(name, record.key, record.value, collectReferences(record.value)));
  }
  return Object.freeze({ tables: Object.freeze(tables), objects: Object.freeze(objects) });
}
