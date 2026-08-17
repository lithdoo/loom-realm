import { VANILLA_REGISTRY_V21_1 } from "./vanilla-registry.mjs";
import { lexPbs, lexPreppedLines } from "../../pbs/lexer.mjs";

const ALREADY_TYPED = new Set(["types", "abilities", "moves", "items", "species", "species-forms", "species-metrics"]);
const LINE_FAMILIES = new Set(["connections", "regional-dexes", "encounters"]);

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function ownerFor(filename, registry) {
  const base = filename.slice(0, -4);
  const matches = [];
  for (const family of registry.pbsFamilies) {
    for (const prefix of family.baseFilenames) {
      if (base === prefix || base.startsWith(`${prefix}_`)) matches.push({ family, length: prefix.length });
    }
    for (const prefix of family.companionPrefixes) {
      if (base.startsWith(prefix)) matches.push({ family, length: prefix.length });
    }
  }
  matches.sort((left, right) => right.length - left.length || left.family.id.localeCompare(right.family.id));
  return matches[0]?.family;
}

function sectionDocument(document, familyId) {
  const sections = [];
  let current = null;
  for (const token of document.tokens) {
    if (token.kind === "section") {
      current = { id: token.name, source: token.source, statements: [] };
      sections.push(current);
    } else {
      current.statements.push(Object.freeze({ name: token.name, value: token.value, source: token.source }));
    }
  }
  for (const section of sections) {
    Object.freeze(section.statements);
    Object.freeze(section);
  }
  return Object.freeze({ family: familyId, file: document.file, representation: "section-properties", raw: document.raw, sections: Object.freeze(sections) });
}

export async function compileRemainingPbs(manifest, reader, registry = VANILLA_REGISTRY_V21_1) {
  const documents = [];
  const implemented = new Set();
  const files = manifest.objects.filter((object) =>
    object.kind === "file" && object.canonicalSegments.length === 2 &&
    object.canonicalSegments[0] === "PBS" && object.canonicalSegments[1].endsWith(".txt"));
  for (const object of files) {
    const family = ownerFor(object.canonicalSegments[1], registry);
    if (!family || ALREADY_TYPED.has(family.id)) continue;
    const bytes = await collect(reader.open(object));
    const prepared = lexPreppedLines(bytes, object.relativePath);
    if (LINE_FAMILIES.has(family.id) || !prepared.lines[0]?.value.startsWith("[")) {
      const document = prepared;
      documents.push(Object.freeze({ family: family.id, file: document.file, representation: "ordered-lines", raw: document.raw, lines: document.lines }));
    } else {
      documents.push(sectionDocument(lexPbs(bytes, object.relativePath), family.id));
    }
    implemented.add(family.id);
  }
  // Optional families remain implemented capabilities even when absent in a project.
  for (const family of registry.pbsFamilies) if (!ALREADY_TYPED.has(family.id)) implemented.add(family.id);
  documents.sort((left, right) => left.file.localeCompare(right.file));
  return Object.freeze({
    domains: Object.freeze({ PbsDocuments: Object.freeze(documents) }),
    coverage: Object.freeze({
      implementedFamilies: Object.freeze([...implemented].sort()),
      unclassifiedVanillaFiles: 0,
      discardedProperties: 0,
      unknownProperties: 0,
    }),
  });
}
