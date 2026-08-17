export function precompile(rawDataset, rewrites = []) {
  let canonicalInput = rawDataset;
  const applied = [];
  for (const rewrite of rewrites) {
    const result = rewrite.apply(canonicalInput);
    if (result !== canonicalInput) applied.push(Object.freeze({ id: rewrite.id, authority: rewrite.authority }));
    canonicalInput = result;
  }
  return Object.freeze({ rawDataset, canonicalInput, applied: Object.freeze(applied) });
}
