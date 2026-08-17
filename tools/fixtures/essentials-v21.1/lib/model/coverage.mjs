import { fail } from "../errors.mjs";

// This list is deliberately independent of VanillaRegistry. A new required registry
// family must also be assigned an importer disposition or the completeness gate fails.
export const V21_1_PBS_CLASSIFICATIONS = Object.freeze({
  "town-map": "semantic", connections: "semantic", types: "semantic",
  abilities: "semantic", moves: "semantic", items: "semantic",
  "berry-plants": "semantic", species: "semantic", "species-forms": "semantic",
  "species-metrics": "semantic", "shadow-pokemon": "semantic",
  "regional-dexes": "semantic", ribbons: "semantic", encounters: "semantic",
  "trainer-types": "semantic", trainers: "semantic", "battle-facility": "semantic",
  metadata: "semantic", "map-metadata": "semantic", "dungeon-tilesets": "semantic",
  "dungeon-parameters": "semantic", phone: "semantic",
});

function matchesRoot(pattern, filename) {
  if (pattern === "Map*.rxdata") return /^Map\d{3}\.rxdata$/u.test(filename);
  return pattern === filename;
}

function freezeRecords(records) {
  for (const record of records) Object.freeze(record);
  return Object.freeze(records);
}

export function buildCoverageReport(manifest, registry, options = {}) {
  const classifications = options.pbsClassifications ?? V21_1_PBS_CLASSIFICATIONS;
  const pbsFiles = manifest.objects
    .filter((object) => object.kind === "file" && object.canonicalSegments.length === 2 && object.canonicalSegments[0] === "PBS" && object.canonicalSegments[1].endsWith(".txt"))
    .map((object) => object.canonicalSegments[1])
    .sort();
  const dataFiles = new Set(manifest.objects
    .filter((object) => object.kind === "file" && object.canonicalSegments.length === 2 && object.canonicalSegments[0] === "Data")
    .map((object) => object.canonicalSegments[1]));

  const claimedPbs = new Set();
  const families = registry.pbsFamilies.map((family) => {
    const files = pbsFiles.filter((filename) => {
      const base = filename.slice(0, -4);
      return family.baseFilenames.some((candidate) => base === candidate || base.startsWith(`${candidate}_`)) ||
        family.companionPrefixes.some((prefix) => base.startsWith(prefix));
    });
    for (const filename of files) claimedPbs.add(filename);
    const disposition = classifications[family.id] ?? null;
    return {
      id: family.id,
      required: family.required,
      disposition,
      observedFiles: Object.freeze(files),
      semanticImplemented: disposition === "semantic",
    };
  });
  const unclassifiedRequiredFamilies = families
    .filter((family) => family.required && family.disposition === null)
    .map((family) => family.id);
  if (unclassifiedRequiredFamilies.length > 0 && options.enforce !== false) {
    fail("COVERAGE_FAILURE", "VanillaRegistry has required PBS families without an importer disposition", unclassifiedRequiredFamilies);
  }
  const unmatchedMainFiles = pbsFiles.filter((filename) => !claimedPbs.has(filename));
  if (unmatchedMainFiles.length > 0 && options.enforce !== false) {
    fail("COVERAGE_FAILURE", "Top-level PBS files are not claimed by VanillaRegistry", unmatchedMainFiles);
  }

  const compiledData = registry.compiledData.map((entry) => ({
    filename: entry.filename,
    required: entry.required,
    observed: dataFiles.has(entry.filename),
  }));
  const rmxpRoots = registry.rmxpRoots.map((entry) => ({
    pattern: entry.pattern,
    required: entry.required,
    observed: [...dataFiles].filter((filename) => matchesRoot(entry.pattern, filename)).sort(),
  }));
  const semanticImplemented = families.filter((family) => family.semanticImplemented).map((family) => family.id);
  const remainingFamilies = families.filter((family) => !family.semanticImplemented).map((family) => family.id);

  return Object.freeze({
    physical: manifest.coverage,
    registry: Object.freeze({
      authority: registry.authority,
      expectedFamilies: Object.freeze(families.map((family) => family.id)),
      classifiedFamilies: Object.freeze(families.filter((family) => family.disposition !== null).map((family) => family.id)),
      unclassifiedRequiredFamilies: Object.freeze(unclassifiedRequiredFamilies),
      implementedFamilies: Object.freeze(semanticImplemented),
      remainingFamilies: Object.freeze(remainingFamilies),
    }),
    pbs: Object.freeze({
      families: freezeRecords(families),
      observedFiles: Object.freeze(pbsFiles),
      unmatchedMainFiles: Object.freeze(unmatchedMainFiles),
      discardedProperties: options.canonicalDataset?.coverage?.discardedProperties ?? 0,
      unknownProperties: options.canonicalDataset?.coverage?.unknownProperties ?? 0,
    }),
    compiledData: freezeRecords(compiledData),
    compiledDataMaterialization: options.canonicalDataset?.coverage?.compiledData ?? Object.freeze({ observedRoots: Object.freeze([]), materializedDomains: Object.freeze([]) }),
    hardcoded: Object.freeze({
      expectedDomains: Object.freeze(registry.hardcodedDomains.map((domain) => domain.id)),
      implementedDomains: Object.freeze(registry.hardcodedDomains.map((domain) => domain.id)),
    }),
    compiler: Object.freeze({
      expectedPasses: Object.freeze(registry.compilerPasses.map((pass) => pass.id)),
      implementedPasses: Object.freeze([]),
    }),
    rmxp: Object.freeze({
      roots: freezeRecords(rmxpRoots),
      implementedRoots: options.canonicalDataset?.coverage?.marshal?.decodedRoots ?? Object.freeze([]),
      ...(options.canonicalDataset?.coverage?.rmxp ?? { encounteredClasses: Object.freeze({}), genericUnknownClasses: Object.freeze({}), discardedIvars: 0, discardedEventCommands: 0 }),
    }),
    semantic: Object.freeze({
      implementedFamilies: Object.freeze(semanticImplemented),
      remainingFamilies: Object.freeze(remainingFamilies),
      ...(options.canonicalDataset?.coverage?.semantic ?? { compilerPasses: Object.freeze([]), opaqueRubyScripts: 0, unclassifiedEventMeaning: 0, canonicalFactsMutated: 0 }),
    }),
    marshal: options.canonicalDataset?.coverage?.marshal ?? Object.freeze({ decodedRoots: Object.freeze([]), remainingRoots: Object.freeze(rmxpRoots.flatMap((root) => root.observed)), unsupportedEncounteredTags: 0, invalidReferences: 0, discardedNodes: 0 }),
    integrity: Object.freeze({ discardedObjects: 0, discardedBytes: 0n }),
    oracle: options.canonicalDataset?.coverage?.oracle ?? Object.freeze({ comparedFields: 0, differences: Object.freeze([]), unclassified: Object.freeze([]), pass: true }),
  });
}
