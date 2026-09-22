import { fail } from "../errors.mjs";
import { loadNameAuthority } from "../source/names.mjs";
import { validateKnownReferences } from "./integrity.mjs";
import { mapCanonicalDataset } from "./mapper.mjs";

export async function buildFsdbPlan(rawPlan, canonicalDataset, coverage, dependencies = {}) {
  const { canonicalName, resourceExtension } = await (dependencies.loadNameAuthority ?? loadNameAuthority)();
  const structured = mapCanonicalDataset(canonicalDataset);
  const tables = new Set();
  const identities = new Set();
  for (const table of structured.tables) {
    if (canonicalName(table.name) !== table.name) fail("FSDB_PLAN_INVALID", `Non-canonical table name: ${table.name}`);
    const identity = `${table.kind}\0${table.name}`;
    if (tables.has(identity)) fail("FSDB_PLAN_INVALID", `Duplicate table identity: ${table.kind}/${table.name}`);
    tables.add(identity);
  }
  for (const object of structured.objects) {
    if (canonicalName(object.key) !== object.key) fail("FSDB_PLAN_INVALID", `Non-canonical object key: ${object.table}/${object.key}`);
    resourceExtension(`${object.key}.json`);
    const identity = `${object.table}\0${object.key}`;
    if (identities.has(identity)) fail("FSDB_PLAN_INVALID", `Duplicate structured identity: ${object.table}/${object.key}`);
    identities.add(identity);
  }
  if (coverage.physical.unclassifiedRecognisedObjects !== 0 || coverage.registry.unclassifiedRequiredFamilies.length !== 0 || coverage.pbs.unmatchedMainFiles.length !== 0) {
    fail("COVERAGE_FAILURE", "FSDB commit barrier rejected incomplete coverage");
  }
  if ((coverage.marshal.unsupportedEncounteredTags ?? 0) !== 0 || (coverage.marshal.invalidReferences ?? 0) !== 0 || (coverage.marshal.discardedNodes ?? 0) !== 0) {
    fail("COVERAGE_FAILURE", "FSDB commit barrier rejected incomplete Marshal coverage");
  }
  if (!coverage.oracle.pass || coverage.oracle.unclassified.length !== 0) {
    fail("ORACLE_DIFFERENCE", `FSDB commit barrier rejected ${coverage.oracle.unclassified.length} unclassified Oracle difference(s)`, coverage.oracle.unclassified.slice(0, 50).map((difference) => `${difference.domain}/${difference.id}.${difference.field}`));
  }
  const integrity = validateKnownReferences(structured);
  const keysByTable = Object.fromEntries(structured.tables.map((table) => [
    table.name,
    Object.freeze(structured.objects.filter((object) => object.table === table.name).map((object) => object.key).sort()),
  ]));
  const map21Evidence = canonicalDataset.domains.MapAction?.find((record) => record.key === "21")?.value;
  const generationManifest = Object.freeze({
    schemaVersion: "loomrealm.essentials-v21.1-generation/v1",
    tables: Object.freeze(keysByTable),
    resources: Object.freeze(rawPlan.resources.map((resource) => Object.freeze({
      table: resource.table,
      key: resource.resourceKey,
      path: resource.relativeSegments.join("/"),
      size: resource.size.toString(),
      sha256: resource.sha256 ?? null,
    })).sort((left, right) => `${left.table}/${left.path}`.localeCompare(`${right.table}/${right.path}`))),
    map21BridgeAudit: Object.freeze((map21Evidence?.actions ?? []).map((action) => Object.freeze({
      eventId: action.eventId,
      pageIndex: action.pageIndex,
      position: action.position,
      operation: action.op === "bridge-on" ? "on" : "off",
      occupied: action.occupied,
      trigger: action.trigger,
      through: action.through,
      emptyGraphic: action.emptyGraphic,
    }))),
  });
  return Object.freeze({ ...rawPlan, structured, generationManifest, coverage: Object.freeze({ ...coverage, integrity }) });
}
