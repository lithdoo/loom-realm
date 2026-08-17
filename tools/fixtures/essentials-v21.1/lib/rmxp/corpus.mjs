import { decodeRmxpGraph } from "./decoder.mjs";

export function decodeRmxpCorpus(marshalCorpus) {
  const roots = [];
  const encountered = Object.create(null);
  const generic = Object.create(null);
  let eventCommands = 0;
  for (const entry of marshalCorpus.roots) {
    const decoded = decodeRmxpGraph(entry.graph);
    roots.push(Object.freeze({ filename: entry.filename, root: decoded.root }));
    eventCommands += decoded.coverage.eventCommands;
    for (const [name, amount] of Object.entries(decoded.coverage.encounteredClasses)) encountered[name] = (encountered[name] ?? 0) + amount;
    for (const [name, amount] of Object.entries(decoded.coverage.genericUnknownClasses)) generic[name] = (generic[name] ?? 0) + amount;
  }
  return Object.freeze({
    roots: Object.freeze(roots),
    coverage: Object.freeze({
      encounteredClasses: Object.freeze(Object.fromEntries(Object.entries(encountered).sort())),
      typedClasses: Object.freeze(Object.keys(encountered).filter((name) => !(name in generic)).sort()),
      genericUnknownClasses: Object.freeze(Object.fromEntries(Object.entries(generic).sort())),
      discardedIvars: 0,
      discardedEventCommands: 0,
      eventCommands,
    }),
  });
}
