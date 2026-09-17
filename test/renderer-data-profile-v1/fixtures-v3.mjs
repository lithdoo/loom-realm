/**
 * Renderer Data Application Profile v1 — conformance fixture catalog,
 * fixtureSetRevision 3 (revised four-child /1 per ADR0037).
 *
 * The catalog is the executable projection of
 * doc/15-contracts/renderer-data-profile-conformance-v1.md (revision 3):
 * every group below mirrors a normative section of that conformance
 * specification, and revision-2 observables that remain unconflicted are
 * re-proven by the "original-revision2-observables" group exactly as
 * required by its §6. Historical revision-1/2 fixtures remain provenance
 * only; nothing here may be satisfied by an old three-child executable.
 */

export const protocol = "loomrealm.renderer-data";
export const protocolVersion = 1;
export const fixtureSetRevision = 3;

export const groups = Object.freeze([
  "identity-cohort",
  "unit-gates-direction",
  "one-writer-bounded-producer",
  "fresh-baseline",
  "failure-containment",
  "original-revision2-observables",
]);

export const fixturesByGroup = Object.freeze({
  "identity-cohort": Object.freeze([
    Object.freeze({ fixture: "exact-profile-identity-binding", roles: Object.freeze(["subsystem-peer", "renderer-peer"]) }),
    Object.freeze({ fixture: "unsupported-profile-identity-rejected-before-carrier-effects", roles: Object.freeze(["subsystem-peer"]) }),
    Object.freeze({ fixture: "four-child-composition-single-connection-dispatch", roles: Object.freeze(["subsystem-receiver", "renderer-receiver"]) }),
    Object.freeze({ fixture: "viewport-masquerade-not-consumed-as-input", roles: Object.freeze(["subsystem-receiver"]) }),
  ]),
  "unit-gates-direction": Object.freeze([
    Object.freeze({ fixture: "one-json-text-unit-per-child-object-unit-rejected", roles: Object.freeze(["subsystem-receiver", "renderer-receiver"]) }),
    Object.freeze({ fixture: "byte-limit-1mib-common-gate", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "depth-limit-64-common-gate", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "unknown-type-profile-fatal", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "wrong-direction-input-family", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "wrong-direction-render-family", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "wrong-direction-viewport-family", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "viewport-child-invalid-viewport-family", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "input-child-invalid-input-family", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "one-logical-reader-ordered-disposition", roles: Object.freeze(["subsystem-receiver"]) }),
  ]),
  "one-writer-bounded-producer": Object.freeze([
    Object.freeze({ fixture: "max-one-concurrent-physical-send", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "admitted-units-fifo", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "terminal-first-wins-queued-settle-once", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "no-retry-replay-or-cross-carrier-migration", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "viewport-bounded-burst-latest-convergence", roles: Object.freeze(["renderer-viewport-sender"]) }),
    Object.freeze({ fixture: "viewport-burst-interleaved-no-starvation", roles: Object.freeze(["renderer-viewport-sender", "renderer-input-sender"]) }),
    Object.freeze({ fixture: "viewport-equal-size-suppress", roles: Object.freeze(["renderer-viewport-sender"]) }),
  ]),
  "fresh-baseline": Object.freeze([
    Object.freeze({ fixture: "fresh-peer-no-inherited-state", roles: Object.freeze(["renderer-sender", "renderer-viewport-sender"]) }),
    Object.freeze({ fixture: "old-carrier-pending-not-migrated", roles: Object.freeze(["renderer-viewport-sender"]) }),
    Object.freeze({ fixture: "viewport-fresh-carrier-independent-baseline", roles: Object.freeze(["renderer-viewport-sender", "subsystem-receiver"]) }),
  ]),
  "failure-containment": Object.freeze([
    Object.freeze({ fixture: "child-explicit-fatal-disposition-family", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "handler-throw-is-local-fatal", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "well-formed-stale-input-accepted-drop", roles: Object.freeze(["subsystem-receiver"]) }),
    Object.freeze({ fixture: "data-terminal-does-not-fail-remote-peer-side", roles: Object.freeze(["subsystem-receiver", "renderer-receiver"]) }),
  ]),
  "original-revision2-observables": Object.freeze([
    Object.freeze({ fixture: "input-interest-original-dispatch", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "render-domains-original-dispatch", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "render-snapshot-original-dispatch", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "render-patch-original-dispatch", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "render-event-original-dispatch", roles: Object.freeze(["renderer-receiver"]) }),
    Object.freeze({ fixture: "input-state-original-send", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "input-event-original-send", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "input-reset-original-send", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "send-outcome-local-acceptance-only", roles: Object.freeze(["renderer-sender"]) }),
    Object.freeze({ fixture: "profile-identity-export-exact", roles: Object.freeze(["cohort-manifest"]) }),
  ]),
});

export const fixtureCatalog = Object.freeze(
  Object.entries(fixturesByGroup).flatMap(([group, fixtures]) =>
    fixtures.map(({ fixture, roles }) =>
      Object.freeze({ protocol, protocolVersion, fixtureSetRevision, group, fixture, roles }),
    ),
  ),
);
