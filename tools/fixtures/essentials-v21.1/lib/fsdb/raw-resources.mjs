import { fail } from "../errors.mjs";
import { RAW_RESOURCE_ROOTS } from "../source/manifest.mjs";
import { loadNameAuthority } from "../source/names.mjs";

const COMPATIBILITY_ADAPTATIONS = new Map([
  ["Graphics/UI/itemstorage_bg.PNG", {
    targetName: "itemstorage_bg.png",
    size: 1897n,
    sha256: "a494acc6701661184a211b0de4651b79ed267cac33d1cc9097b0c84926213329",
  }],
]);

export async function planRawResources(manifest, dependencies = {}) {
  const nameAuthority = dependencies.loadNameAuthority ?? loadNameAuthority;
  const { resourceExtension } = await nameAuthority();
  const resources = [];
  const directories = [];
  const warnings = [];
  const issues = [];
  const rootDirectories = new Set(manifest.objects
    .filter((object) => object.kind === "directory" && object.canonicalSegments.length === 1)
    .map((object) => object.canonicalSegments[0]));
  const tables = RAW_RESOURCE_ROOTS.filter((table) => rootDirectories.has(table));
  const stats = new Map(tables.map((table) => [table, { count: 0, bytes: 0n }]));
  const keysByTable = new Map(tables.map((table) => [table, new Map()]));
  const portableByTable = new Map(tables.map((table) => [table, new Map()]));

  for (const object of manifest.objects) {
    if (object.classification !== "raw-preserved") continue;
    const table = object.canonicalSegments[0];
    if (!stats.has(table)) fail("SOURCE_MANIFEST_INVALID", `Raw object has no resource root: ${object.relativePath}`);
    if (object.kind === "directory") {
      if (object.canonicalSegments.length > 1) directories.push({ table, segments: object.canonicalSegments.slice(1) });
      continue;
    }

    const physicalName = object.physicalSegments.at(-1);
    const logicalDirectories = object.canonicalSegments.slice(1, -1);
    let parsed;
    let targetName;
    try { parsed = resourceExtension(physicalName); } catch (error) {
      const adaptation = COMPATIBILITY_ADAPTATIONS.get(object.physicalRelativePath);
      if (adaptation !== undefined) {
        if (object.size !== adaptation.size || object.sha256 !== adaptation.sha256) {
          issues.push(`INVALID_EXTENSION ${object.physicalRelativePath} (known adaptation content mismatch)`);
          continue;
        }
        parsed = resourceExtension(adaptation.targetName);
        targetName = `${parsed.leaf}.${parsed.extension}`;
        warnings.push(`adapted ${object.physicalRelativePath} -> ${table}/${[...logicalDirectories, targetName].join("/")}`);
      } else {
        const category = /extension/i.test(error.message) ? "INVALID_EXTENSION" : "INVALID_NAME_SEGMENT";
        issues.push(`${category} ${object.physicalRelativePath}`);
        continue;
      }
    }
    targetName ??= `${parsed.leaf}.${parsed.extension}`;
    const key = [...logicalDirectories, parsed.leaf].join("/");
    const keys = keysByTable.get(table);
    const existing = keys.get(key);
    if (existing !== undefined) issues.push(`RESOURCE_KEY_COLLISION ${existing} <> ${object.physicalRelativePath}`);
    else keys.set(key, object.physicalRelativePath);
    const folded = key.toUpperCase();
    const portableKeys = portableByTable.get(table);
    const portable = portableKeys.get(folded);
    if (portable !== undefined && portable.key !== key) warnings.push(`${table}: ${portable.display} <> ${object.physicalRelativePath}`);
    else if (portable === undefined) portableKeys.set(folded, { key, display: object.physicalRelativePath });
    resources.push({
      table,
      sourcePath: object.sourcePath,
      sourceRelativeSegments: object.physicalSegments.slice(1),
      relativeSegments: [...logicalDirectories, targetName],
      resourceKey: key,
      extension: parsed.extension,
      size: object.size,
      fingerprint: object.fingerprint,
    });
    const tableStats = stats.get(table);
    tableStats.count += 1;
    tableStats.bytes += object.size;
  }

  if (issues.length > 0) {
    const category = issues[0].split(" ", 1)[0];
    fail(category, `Strict resource preflight found ${issues.length} incompatible source object(s)`, issues);
  }
  return Object.freeze({
    resources: Object.freeze(resources),
    directories: Object.freeze(directories),
    warnings: Object.freeze(warnings),
    stats,
    tables: Object.freeze(tables),
    physicalCoverage: manifest.coverage,
  });
}
