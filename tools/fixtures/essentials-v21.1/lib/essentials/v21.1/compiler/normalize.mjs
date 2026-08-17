export function normalize(records, normalizers = []) {
  return Object.freeze(records.map((record) => normalizers.reduce((value, normalizer) => normalizer(value), record)));
}
