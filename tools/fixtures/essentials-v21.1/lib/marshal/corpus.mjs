import { decodeMarshal } from "./decoder.mjs";

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function decodeMarshalCorpus(manifest, reader) {
  const roots = [];
  const tagCounts = Object.create(null);
  let nodes = 0;
  const objects = manifest.objects.filter((object) =>
    object.kind === "file" && object.canonicalSegments.length === 2 && object.canonicalSegments[0] === "Data" &&
    /\.(?:dat|rxdata)$/iu.test(object.canonicalSegments[1]));
  for (const object of objects) {
    const graph = decodeMarshal(await collect(reader.open(object)), { source: object.relativePath });
    roots.push(Object.freeze({ filename: object.canonicalSegments[1], graph }));
    nodes += graph.coverage.nodes;
    for (const [tag, amount] of Object.entries(graph.coverage.tagCounts)) tagCounts[tag] = (tagCounts[tag] ?? 0) + amount;
  }
  roots.sort((left, right) => left.filename.localeCompare(right.filename));
  return Object.freeze({
    roots: Object.freeze(roots),
    coverage: Object.freeze({
      decodedRoots: Object.freeze(roots.map((root) => root.filename)),
      unsupportedEncounteredTags: 0,
      invalidReferences: 0,
      discardedNodes: 0,
      nodes,
      tagCounts: Object.freeze(tagCounts),
    }),
  });
}
