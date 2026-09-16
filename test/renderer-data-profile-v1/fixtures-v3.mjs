export const protocol = "loomrealm.renderer-data";
export const protocolVersion = 1;
export const fixtureSetRevision = 3;

function group(name, roles, fixtures) {
  return fixtures.map((fixture) => Object.freeze({
    protocol,
    protocolVersion,
    fixtureSetRevision,
    group: name,
    fixture,
    roles,
  }));
}

export const fixtureCatalog = Object.freeze([
  ...group("identity-cohort", ["profile"], [
    "profile-identity-four-child",
    "fixture-set-revision-3",
    "no-renderer-data-2-identity",
    "main-selects-profile-without-size",
    "desktop-unified-holder-construction",
  ]),
  ...group("application-unit", ["data-peer"], [
    "one-json-text-unit",
    "one-logical-reader",
    "ordered-child-disposition",
    "one-writer-max-one-physical-send",
    "viewport-direction-renderer-to-subsystem",
    "viewport-diagnostic-family",
    "unknown-type-profile-family",
  ]),
  ...group("inherited-children", ["regression"], [
    "connection-input-render-remain-current",
  ]),
]);

export const fixturesByGroup = Object.freeze(
  Object.fromEntries(
    [...new Set(fixtureCatalog.map((fixture) => fixture.group))].map((name) => [
      name,
      Object.freeze(fixtureCatalog.filter((fixture) => fixture.group === name)),
    ]),
  ),
);
