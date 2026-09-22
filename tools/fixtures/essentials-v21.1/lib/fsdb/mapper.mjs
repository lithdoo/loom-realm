import { basename, extname } from "node:path";
import { jsonObject, structuredObject } from "./structured.mjs";

const INTERNAL_DOMAINS = new Set(["MarshalRoots", "RmxpRoots", "PbsDocuments", "DerivedSemantics", "MapAction"]);

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

function schemaFor(name) {
  if (name === "Map") return Object.freeze({ type: "object", additionalProperties: false, required: ["tileset_id", "width", "height", "data", "behaviors"], properties: Object.freeze({ tileset_id: Object.freeze({ type: "integer", minimum: 1 }), width: Object.freeze({ type: "integer", minimum: 1 }), height: Object.freeze({ type: "integer", minimum: 1 }), data: Object.freeze({ type: "object" }), behaviors: Object.freeze({ type: "array" }) }) });
  if (name === "NPC") return Object.freeze({ type: "object", additionalProperties: false, required: ["name", "sprite"], properties: Object.freeze({ name: Object.freeze({ type: "string", minLength: 1 }), sprite: Object.freeze({ type: "object", additionalProperties: false, required: ["namespace", "key"] }) }) });
  return Object.freeze({ type: "object" });
}

export function mapCanonicalDataset(canonicalDataset) {
  const tableRecords = new Map();
  for (const [domain, records] of Object.entries(canonicalDataset.domains)) {
    if (INTERNAL_DOMAINS.has(domain) || !Array.isArray(records)) continue;
    if (domain === "Map" || domain === "Tileset" || domain === "MapTransfer") {
      tableRecords.set(domain, records.map((record) => ({ key: record.key, value: record.value })));
    } else if (domain === "NPC") {
      tableRecords.set(domain, records.map((record) => ({ key: String(record.id), value: Object.freeze({ name: record.name, sprite: record.sprite }) })));
    } else {
      tableRecords.set(domain, records.map((record) => ({ key: String(record.id), value: record })));
    }
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
    tables.push(Object.freeze({ kind: "struct", name, schema: schemaFor(name) }));
    for (const record of records) objects.push(
      name === "Map" || name === "Tileset" || name === "MapTransfer" || name === "NPC"
        ? jsonObject(name, record.key, record.value)
        : structuredObject(name, record.key, record.value, collectReferences(record.value)),
    );
  }
  return Object.freeze({ tables: Object.freeze(tables), objects: Object.freeze(objects) });
}
