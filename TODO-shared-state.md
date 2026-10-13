# TODO: Rename Realm State to Shared State

> Status: TODO / migration planning  
> Scope: terminology and public-surface rename only  
> Target: `Realm State` → `Shared State`  
> Package: `@loomrealm/realm-state` → `@loomrealm/shared-state`

## Goal

Rename the current **Realm State** module and architectural role to **Shared State** so the name directly reflects its responsibility and aligns better with the rest of the LoomRealm vocabulary.

The rename MUST NOT change the existing authority model or runtime semantics.

Current meaning remains:

```text
Main
    Control Authority

Shared State
    Session-scoped Shared Business State Authority

Subsystem
    Domain Execution / Local State Authority

Renderer
    Readonly Presentation Replica / Input Producer

Content
    Readonly Definition Authority
```

Shared State remains a sibling authority of Main. It MUST NOT become Main-owned session state, a universal application store, a Renderer-accessible store, or a replacement for Subsystem-local state.

---

## Naming decision

Canonical vocabulary after this migration:

```text
Realm State                         -> Shared State
Realm State Authority               -> Shared State Authority
RealmStateAuthority                 -> SharedStateAuthority
RealmStateClient                    -> SharedStateClient
RealmStateKey                       -> SharedStateKey
RealmState*                         -> SharedState*
realm-state                         -> shared-state
@loomrealm/realm-state              -> @loomrealm/shared-state
```

Use **Shared State** when referring to the architectural subsystem/authority.

Use **shared business state** descriptively when explaining the kind of state it owns.

Do not rename the product/repository name `LoomRealm`; this task only removes `Realm` from the state-module terminology.

---

## Non-goals

This rename MUST NOT change:

- Session ownership or lifecycle semantics.
- Main control authority.
- Record identity `(namespace, key)`.
- immutable initial values / mutable current values.
- global revision or per-record version semantics.
- OCC conditions and atomic commit behavior.
- `read`, `readInitial`, `list`, `scan`, `commit`, or subscription semantics except where exported type/function names contain `RealmState`.
- Runtime-scoped logical client semantics.
- replaceable physical binding behavior.
- fatal reporting and Main-owned terminal/unwind behavior.
- Save/Load architecture.
- Renderer, Content, Input, Frame, Activation, or Runtime authority boundaries.

If implementation changes are required only to complete the rename, keep them mechanically equivalent and covered by existing conformance tests.

---

## Migration tasks

### 1. Package and directory

- [ ] Rename `packages/realm-state/` to `packages/shared-state/`.
- [ ] Rename npm package `@loomrealm/realm-state` to `@loomrealm/shared-state`.
- [ ] Update package description, repository directory metadata, build/test references, workspaces, scripts, lockfile entries, and dependency declarations.
- [ ] Search the repository for all imports/references to `@loomrealm/realm-state` and migrate them.
- [ ] Verify package dependency direction remains unchanged.

### 2. Public TypeScript API

- [ ] Rename exported `RealmState*` symbols to `SharedState*`.
- [ ] Rename authority/client/key/request/result/error/binding/subscription types consistently.
- [ ] Rename factories/helpers/testing exports that contain `realmState` / `RealmState`.
- [ ] Rename source filenames where the old module name appears and where doing so improves consistency.
- [ ] Update JSDoc, comments, error messages, diagnostics, and test descriptions.
- [ ] Ensure no accidental `SessionState*` terminology is introduced; Shared State is not Main session-control state.

### 3. Platform ports and composition

- [ ] Rename Realm State-facing platform-port types and fields to Shared State equivalents.
- [ ] Update Main's fatal-source wiring terminology without changing ownership: Shared State reports a session-fatal fact; Main still commits terminal/unwind.
- [ ] Update Desktop composition names such as authority instances, prepared state bindings, provisioners, and cleanup variables.
- [ ] Update PWA composition and Worker/MessagePort binding names.
- [ ] Update RuntimeHosting/Runner integration and runtime-scoped client provisioning.
- [ ] Confirm physical colocating/wiring still does not create a second application authority.

### 4. Protocol and wire vocabulary

- [ ] Search protocol discriminants, channel names, message kinds, wire errors, profile identifiers, capability names, and debug labels for `realm-state` / `RealmState` / `realmState`.
- [ ] Rename logical protocol identifiers to `shared-state` where they are part of the current internal/public contract.
- [ ] Decide explicitly whether any on-wire identifiers require a compatibility transition.
- [ ] If no released compatibility boundary exists, perform a clean rename rather than maintaining permanent aliases.
- [ ] If an externally consumed wire/package identifier already exists, document its migration/versioning rule before changing it.

### 5. Formal contracts

- [ ] Rename `doc/15-contracts/realm-state-v1.md` to `shared-state-v1.md`.
- [ ] Change contract title and normative terminology from Realm State to Shared State.
- [ ] Update all contract cross-links.
- [ ] Update conformance/qualification references and evidence names.
- [ ] Preserve all current v1 semantics unless a separate architectural decision explicitly changes them.
- [ ] Check whether protocol/profile names containing `realm-state` are compatibility identifiers; version them if required by the documentation-governance rules.

### 6. Architecture documentation

- [ ] Rename `doc/10-architecture/realm-state-system.md` to `shared-state-system.md`.
- [ ] Replace architectural role wording with `Shared State` / `Shared State Authority`.
- [ ] Update `system-overview.md` authority tables and diagrams.
- [ ] Update subsystem/runtime-hosting/storage/communication/rendering documents that mention Realm State.
- [ ] Update product vision and overview documents.
- [ ] Update module ownership documentation under `doc/20-modules/`.
- [ ] Update development/implementation/qualification documents.
- [ ] Update ADR/decision documents only where they describe current terminology; preserve historical wording where changing it would falsify historical context, adding a note if needed.

### 7. Package/module docs

- [ ] Rename `packages/shared-state/DESIGN.md` terminology and links.
- [ ] Update `packages/main/DESIGN.md` references to the sibling Shared State authority.
- [ ] Update `packages/subsystem/DESIGN.md` and author API documentation.
- [ ] Update Renderer docs to retain the rule that Renderer has no direct Shared State authority/access.
- [ ] Update Game Package docs where initial shared state is described.
- [ ] Update Desktop/PWA README and topology diagrams.
- [ ] Update repository root README architecture vocabulary.

### 8. Game Entry vocabulary

- [ ] Review Game Entry's optional `state` field and confirm whether it remains simply `state`.
- [ ] Prefer keeping the serialized Game Entry field `state` unless there is a concrete ambiguity; this rename does not require changing data shape just to mirror the module name.
- [ ] Update prose so the field is described as the initial definition for Shared State.
- [ ] Ensure Game Package validation remains platform-neutral and Main still receives only logical bootstrap rather than Shared State definitions.

### 9. Tests and qualification

- [ ] Rename unit/integration/conformance tests containing Realm State terminology.
- [ ] Update fixtures, snapshots, golden outputs, error strings, and expected protocol discriminants as applicable.
- [ ] Run package tests for Shared State.
- [ ] Run Main, Subsystem, RuntimeHosting, Desktop, and PWA integration tests.
- [ ] Run formal Shared State v1 conformance/qualification suites.
- [ ] Verify OCC conflict, atomic commit, initial/current value, discovery, subscription, binding replacement, ambiguous outcome, fatal propagation, and lifetime tests are behaviorally unchanged.
- [ ] Add a repository-level guard/check that rejects new `Realm State`, `RealmState`, `realmState`, `realm-state`, and `@loomrealm/realm-state` references outside explicitly allowed historical material.

### 10. Repository-wide cleanup

- [ ] Search tracked source/docs/config for all old-name forms:

```text
Realm State
RealmState
realmState
realm-state
@loomrealm/realm-state
REALM_STATE
```

- [ ] Classify every remaining match as either migration debt or intentionally preserved history.
- [ ] Update generated artifacts only through their source/generation workflow; do not hand-edit generated files when avoidable.
- [ ] Verify links after path renames.
- [ ] Verify package-lock and workspace metadata contain no stale package identity.

---

## Compatibility strategy

The current package is pre-1.0 (`0.1.0-alpha.0`), so the preferred migration is a **clean rename** if repository/external-consumer inspection confirms there is no compatibility promise that must be retained.

Preferred end state:

```text
@loomrealm/shared-state
SharedStateAuthority
SharedStateClient
SharedStateKey
Shared State v1
```

Avoid keeping long-lived duplicate public names such as both `RealmStateClient` and `SharedStateClient`; that would preserve the vocabulary ambiguity this migration is intended to remove.

If published consumers or frozen wire identifiers are discovered, handle those specific boundaries with an explicit deprecation/version migration rather than making the whole internal architecture bilingual indefinitely.

---

## Acceptance criteria

The migration is complete when:

- [ ] Root architecture vocabulary consistently says **Shared State**.
- [ ] The package is `@loomrealm/shared-state` under `packages/shared-state/`.
- [ ] Public TypeScript symbols use `SharedState*`.
- [ ] Formal contract and architecture files use `shared-state-*` naming.
- [ ] Desktop and PWA compositions use the new vocabulary.
- [ ] Main remains the unique Control Authority and Shared State remains the unique Session-scoped shared business state authority.
- [ ] Existing Shared State semantics and qualification behavior remain unchanged.
- [ ] No stale old-name references remain except explicitly annotated historical material.
- [ ] Repository build, typecheck, tests, conformance, docs links, and qualification checks pass.

---

## Suggested execution order

```text
1. Freeze naming decision
2. Rename package/directory + public API
3. Update direct compile-time consumers
4. Rename protocol/wire identifiers where safe
5. Update contracts
6. Update architecture/module/product documentation
7. Update tests/qualification/evidence
8. Repository-wide old-name scan
9. Full build + qualification
10. Remove temporary migration aliases, if any
```

Keep each step behavior-preserving. Any proposal that changes Shared State semantics should be tracked as a separate architecture/contract change rather than being folded into this naming migration.
