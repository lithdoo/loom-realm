import { fail } from "../../../errors.mjs";

export function createReferenceResolver(domains) {
  return function resolveReference(domain, id, context = `${domain}:${id}`) {
    const values = domains[domain];
    if (values === undefined || !values.has(id)) fail("PBS_REFERENCE_FAILURE", `Unresolved reference ${context}`);
    return Object.freeze({ domain, id });
  };
}

export function resolve(records, resolver, resolvers = {}) {
  return Object.freeze(records.map((record) => {
    let output = record;
    for (const [field, domain] of Object.entries(resolvers)) {
      if (record[field] === undefined || record[field] === null) continue;
      const values = Array.isArray(record[field]) ? record[field] : [record[field]];
      const resolved = values.map((id) => resolver(domain, id, `${record.id ?? "record"}.${field}`));
      output = { ...output, [field]: Array.isArray(record[field]) ? Object.freeze(resolved) : resolved[0] };
    }
    return Object.freeze(output);
  }));
}
