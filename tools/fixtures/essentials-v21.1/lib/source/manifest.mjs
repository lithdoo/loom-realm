import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fail } from "../errors.mjs";
import { fingerprint, sameFingerprint, sha256File } from "./fingerprint.mjs";
import { decodeName, loadNameAuthority } from "./names.mjs";

export const RAW_RESOURCE_ROOTS = Object.freeze(["Graphics", "Audio", "Fonts", "Data", "PBS", "Plugins"]);

const EXCLUDED_ROOT_TOOLING = new Map([
  ["Essentials Docs Wiki.URL", "external-documentation-shortcut"],
  ["Game.exe", "runtime-executable"],
  ["animmaker.exe", "authoring-tool-executable"],
  ["animmaker.txt", "authoring-tool-support"],
  ["extendtext.exe", "authoring-tool-executable"],
  ["extendtext.txt", "authoring-tool-support"],
  ["knownpoint.bmp", "authoring-tool-support"],
  ["selpoint.bmp", "authoring-tool-support"],
  ["townmapgen.html", "authoring-tool-support"],
  ["x64-msvcrt-ruby310.dll", "runtime-binary"],
  ["zlib1.dll", "runtime-binary"],
]);

function classifyRoot(rootName) {
  if (RAW_RESOURCE_ROOTS.includes(rootName)) return { status: "raw-preserved" };
  if (rootName === "mkxp.json") return { status: "parsed", reason: "source-version-identity" };
  const exclusion = EXCLUDED_ROOT_TOOLING.get(rootName);
  if (exclusion !== undefined) return { status: "explicitly-excluded", reason: exclusion };
  return { status: "opaque-preserved", reason: "root-project-data-without-stage-2-parser" };
}

function freezeObject(object) {
  Object.freeze(object.physicalSegments);
  Object.freeze(object.canonicalSegments);
  if (object.fingerprint) Object.freeze(object.fingerprint);
  return Object.freeze(object);
}

export async function buildSourceManifest(rootInput, dependencies = {}) {
  const root = resolve(rootInput);
  const nameAuthority = dependencies.loadNameAuthority ?? loadNameAuthority;
  const hashFile = dependencies.sha256File ?? sha256File;
  const { canonicalName } = await nameAuthority();
  const objects = [];

  async function inventory(directory, physicalSegments, canonicalSegments, inheritedClassification) {
    const beforeDirectory = fingerprint(await lstat(directory));
    const entries = await readdir(directory, { withFileTypes: true, encoding: "buffer" });
    entries.sort((left, right) => Buffer.compare(left.name, right.name));
    const canonicalChildren = new Map();

    for (const entry of entries) {
      const displayParent = physicalSegments.join("/") || ".";
      const physicalName = decodeName(entry.name, displayParent);
      let canonical;
      try { canonical = canonicalName(physicalName); } catch { fail("INVALID_NAME_SEGMENT", `Invalid source name: ${[...physicalSegments, physicalName].join("/")}`); }
      const existing = canonicalChildren.get(canonical);
      if (existing !== undefined) {
        fail("NORMALIZATION_COLLISION", `Source normalization collision: ${existing} <> ${[...physicalSegments, physicalName].join("/")}`);
      }
      canonicalChildren.set(canonical, [...physicalSegments, physicalName].join("/"));

      const sourcePath = join(directory, physicalName);
      const before = await lstat(sourcePath);
      if (before.isSymbolicLink()) fail("SOURCE_INDIRECTION", `Source indirection: ${[...physicalSegments, physicalName].join("/")}`);
      if (!before.isDirectory() && !before.isFile()) fail("SOURCE_INDIRECTION", `Unsupported source object: ${[...physicalSegments, physicalName].join("/")}`);
      const nextPhysical = [...physicalSegments, physicalName];
      const nextCanonical = [...canonicalSegments, canonical];
      const classification = inheritedClassification ?? classifyRoot(canonical);
      const object = {
        relativePath: nextCanonical.join("/"),
        physicalRelativePath: nextPhysical.join("/"),
        physicalSegments: nextPhysical,
        canonicalSegments: nextCanonical,
        sourcePath,
        kind: before.isDirectory() ? "directory" : "file",
        classification: classification.status,
        classificationReason: classification.reason,
        fingerprint: fingerprint(before),
      };

      if (before.isFile()) {
        object.size = BigInt(before.size);
        object.sha256 = await hashFile(sourcePath);
        const after = fingerprint(await lstat(sourcePath));
        if (!sameFingerprint(object.fingerprint, after)) fail("SOURCE_CHANGED", `Source changed while building manifest: ${object.physicalRelativePath}`);
      }
      objects.push(freezeObject(object));
      if (before.isDirectory()) {
        await inventory(sourcePath, nextPhysical, nextCanonical, classification);
        const after = fingerprint(await lstat(sourcePath));
        if (!sameFingerprint(object.fingerprint, after)) fail("SOURCE_CHANGED", `Source directory changed while building manifest: ${object.physicalRelativePath}`);
      }
    }
    const afterDirectory = fingerprint(await lstat(directory));
    if (!sameFingerprint(beforeDirectory, afterDirectory)) {
      fail("SOURCE_CHANGED", `Source directory changed while inventorying: ${physicalSegments.join("/") || "."}`);
    }
  }

  await inventory(root, [], [], undefined);
  const counts = { "raw-preserved": 0, parsed: 0, "opaque-preserved": 0, "explicitly-excluded": 0 };
  for (const object of objects) counts[object.classification] += 1;
  const coverage = Object.freeze({
    totalObjects: objects.length,
    classifiedObjects: objects.length,
    unclassifiedRecognisedObjects: 0,
    classifications: Object.freeze(counts),
  });
  return Object.freeze({ root, version: "21.1", objects: Object.freeze(objects), coverage });
}
