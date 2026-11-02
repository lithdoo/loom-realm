import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFsdbEntries, openFsdb, openFsdbObject } from "@loomrealm/fsdb";

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultFsdbRoot = join(exampleRoot, "[FSDB]PokeMan");

function codePointCompare(left, right) {
  const a = [...left]; const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function fsdbIdentityKey(identity) { return `${identity.kind}\0${identity.table}\0${identity.key}`; }
function pwaIdentityKey(entry) { return `${entry.kind}\0${entry.namespace}\0${entry.key}`; }

export function mapFsdbEntryToPwaIdentity(entry) {
  const { identity } = entry;
  const kind = identity.kind === "group" ? "group" : identity.kind === "resource" ? "resource" : "record";
  return Object.freeze({ kind, namespace: `${identity.kind}.${identity.table}`, key: identity.key, mime: entry.contentType });
}

export function indexFsdbEntries(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = fsdbIdentityKey(entry.identity);
    if (index.has(key)) throw new Error(`Duplicate FSDB identity: ${key.replaceAll("\0", "/")}`);
    index.set(key, entry);
  }
  return index;
}

export function requireFsdbEntry(index, kind, table, key) {
  const lookup = `${kind}\0${table}\0${key}`;
  const entry = index.get(lookup);
  if (entry === undefined) throw new Error(`Missing PokeMan dependency: ${lookup.replaceAll("\0", "/")}`);
  return entry;
}

export function assertUniquePwaContent(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const identity = pwaIdentityKey(entry);
    if (seen.has(identity)) throw new Error(`Duplicate PWA Content identity: ${identity.replaceAll("\0", "/")}`);
    seen.add(identity);
  }
}

async function readFsdbEntry(db, entry) {
  const lease = await openFsdbObject(db, entry.identity, new AbortController().signal);
  if (lease === null) throw new Error(`Indexed FSDB entry disappeared: ${fsdbIdentityKey(entry.identity).replaceAll("\0", "/")}`);
  try {
    const chunks = [];
    for await (const chunk of lease.stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    if (BigInt(bytes.byteLength) !== entry.length) throw new Error("FSDB entry length changed while preparing PWA Content");
    return bytes;
  } finally { await lease.close(); }
}

/** Packages every PokeMan FSDB entry. Full-content packaging is intentional for v1. */
export async function preparePokeManPwaContent(options = {}) {
  const fsdbRoot = options.fsdbRoot ?? defaultFsdbRoot;
  const db = await openFsdb({ root: fsdbRoot });
  try {
    const descriptors = listFsdbEntries(db);
    indexFsdbEntries(descriptors);
    const content = await Promise.all(descriptors.map(async (descriptor) => Object.freeze({
      ...mapFsdbEntryToPwaIdentity(descriptor),
      bytes: Uint8Array.from(await readFsdbEntry(db, descriptor)),
    })));
    content.sort((left, right) => codePointCompare(left.kind, right.kind)
      || codePointCompare(left.namespace, right.namespace) || codePointCompare(left.key, right.key));
    assertUniquePwaContent(content);
    return Object.freeze(content);
  } finally { await db.close(); }
}

export async function createPokeManPwaFixture(options = {}) {
  const root = options.exampleRoot ?? exampleRoot;
  const executablePaths = options.executablePaths ?? {};
  const specifications = Object.freeze(["base", "map", "dialogue", "battle", "message"].map((key) => Object.freeze({
    logicalModule: `subsystems/${key}.mjs`,
    path: executablePaths[key] ?? join(root, "subsystems", `${key}.mjs`),
  })));
  const [gameEntryText, launchManifestText, presentationText, executableSources, content] = await Promise.all([
    readFile(join(root, "game.json"), "utf8"),
    readFile(join(root, "launch.pwa.json"), "utf8"),
    readFile(join(root, "presentation.json"), "utf8"),
    Promise.all(specifications.map(async (specification) => Object.freeze({
      logicalModule: specification.logicalModule, mime: "text/javascript", source: await readFile(specification.path, "utf8"),
    }))),
    preparePokeManPwaContent(options),
  ]);
  const executables = Object.freeze(executableSources.map((executable) => Object.freeze({
    ...executable, contentVersion: `sha256:${createHash("sha256").update(executable.source).digest("hex")}`,
  })));
  return Object.freeze({
    gameEntryText, launchManifestText, presentation: JSON.parse(presentationText), executables,
    content: Object.freeze(content.map((entry) => Object.freeze({
      kind: entry.kind, namespace: entry.namespace, key: entry.key, mime: entry.mime,
      encoding: "base64", body: Buffer.from(entry.bytes).toString("base64"),
    }))),
  });
}
