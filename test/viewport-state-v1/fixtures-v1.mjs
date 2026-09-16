export const protocol = "loomrealm.viewport-state";
export const protocolVersion = 1;
export const fixtureSetRevision = 1;

const roles = Object.freeze(["renderer-sender", "subsystem-receiver"]);
const renderer = Object.freeze(["renderer-sender"]);
const subsystem = Object.freeze(["subsystem-receiver"]);
const product = Object.freeze(["desktop-product"]);

function group(name, roleList, fixtures) {
  return fixtures.map((fixture) => Object.freeze({
    protocol,
    protocolVersion,
    fixtureSetRevision,
    group: name,
    fixture,
    roles: roleList,
  }));
}

export const fixtureCatalog = Object.freeze([
  ...group("wire-schema", roles, [
    "exact-viewport-state-fields",
    "positive-safe-integer-dimensions",
    "extra-fields-fatal",
    "zero-height-fatal",
    "fraction-local-fatal",
    "wrong-direction-fatal",
    "unknown-viewport-star-fatal",
    "recognized-invalid-protocol-viewport",
  ]),
  ...group("retained-api", subsystem, [
    "start-current-null",
    "subscribe-sync-null",
    "getter-before-callback",
    "duplicate-size-suppress",
    "later-subscribe-sync-current",
    "snapshot-immutable",
    "listener-throw-isolated",
    "listener-rejection-isolated",
    "unsubscribe-idempotent",
    "post-terminal-subscribe-inert",
  ]),
  ...group("bounded-publisher", renderer, [
    "blocked-writer-one-inflight-one-pending",
    "resize-burst-gt-1024-latest-converges",
    "interleaved-input-survives-burst",
  ]),
  ...group("lifetime", roles, [
    "no-synthetic-wire-without-observation",
    "first-legal-sends-once",
    "same-generation-fresh-carrier-baseline",
    "fresh-renderer-fences-old-source",
    "runtime-terminal-no-late-callback",
  ]),
  ...group("input-frame-independence", roles, [
    "viewport-does-not-mutate-input-target",
    "viewport-is-not-x-star-state",
  ]),
  ...group("logical-surface", product, [
    "desktop-document-layout-viewport",
    "floor-css-logical-pixels",
    "hidden-visible-resample",
    "dpr-only-does-not-change-css-size",
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
