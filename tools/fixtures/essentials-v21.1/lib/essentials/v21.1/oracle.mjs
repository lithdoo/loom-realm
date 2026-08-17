export function diffOracleDomain(actualRecords, oracleRecords, classifications = {}) {
  const actual = new Map(actualRecords.map((record) => [record.id, record]));
  const oracle = new Map(oracleRecords.map((record) => [record.id, record]));
  const differences = [];
  for (const id of [...new Set([...actual.keys(), ...oracle.keys()])].sort()) {
    const left = actual.get(id);
    const right = oracle.get(id);
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    differences.push(Object.freeze({ id, classification: classifications[id] ?? null, actual: left, oracle: right }));
  }
  const unclassified = differences.filter((difference) => difference.classification === null);
  return Object.freeze({ differences: Object.freeze(differences), unclassified: Object.freeze(unclassified), pass: unclassified.length === 0 });
}
