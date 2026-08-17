export function applyDefaults(records, defaults) {
  return Object.freeze(records.map((record) => Object.freeze({ ...defaults, ...record })));
}
