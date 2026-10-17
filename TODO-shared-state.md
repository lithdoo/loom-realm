# DONE: Rename Realm State to Shared State

> Status: **Completed**  
> Scope: terminology and public-surface rename only  
> Result: `Realm State` → `Shared State`  
> Package: `@loomrealm/realm-state` → `@loomrealm/shared-state`

This document is retained as the migration record. Old-name tokens below are intentional historical vocabulary for the completed rename.

## Naming map (historical → current)

```text
Realm State                         -> Shared State
Realm State Authority               -> Shared State Authority
RealmStateAuthority                 -> SharedStateAuthority
RealmStateClient                    -> SharedStateClient
RealmStateKey                       -> SharedStateKey
RealmState*                         -> SharedState*
realm-state                         -> shared-state
@loomrealm/realm-state              -> @loomrealm/shared-state
loomrealm.realm-state/1             -> loomrealm.shared-state/1
loomrealm.realm-state.frame/1       -> loomrealm.shared-state.frame/1
REALM_STATE_*                       -> SHARED_STATE_*
```

## Non-goals preserved

The rename did **not** change:

- Session ownership or lifecycle semantics
- Main control authority
- Record identity `(namespace, key)`
- OCC / commit / subscription semantics
- Game Entry serialized field name `state`
- Product/repository name `LoomRealm`

## Current authority roles

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

## Guard

Repository tests reject new `Realm State` / `RealmState` / `realmState` / `realm-state` / `@loomrealm/realm-state` / `REALM_STATE` references outside this migration record and other explicitly allowlisted historical material.
