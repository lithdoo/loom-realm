export function provenance(file, line, section = null, property = null, raw = null) {
  return Object.freeze({ file, line, section, property, raw });
}

export function withProvenance(value, source) {
  return Object.freeze({ value, source });
}
