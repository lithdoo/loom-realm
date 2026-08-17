import { fail } from "../errors.mjs";

export function validateKnownReferences(structuredPlan) {
  const identities = new Set(structuredPlan.objects.map((object) => `${object.table}\0${object.key}`));
  const broken = [];
  for (const object of structuredPlan.objects) {
    for (const reference of object.references) {
      if (!identities.has(`${reference.table}\0${reference.key}`)) broken.push(`${object.table}/${object.key} -> ${reference.table}/${reference.key}`);
    }
  }
  if (broken.length > 0) fail("INTEGRITY_FAILURE", `FSDB plan has ${broken.length} broken known reference(s)`, broken.slice(0, 100));
  return Object.freeze({ identityCollisions: 0, knownBrokenReferences: 0, knownReferences: structuredPlan.objects.reduce((sum, object) => sum + object.references.length, 0) });
}
