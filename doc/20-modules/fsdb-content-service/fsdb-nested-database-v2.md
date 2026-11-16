# FSDB Nested Databases and Explicit Database Selection

> Status: **Design proposal** — agreed direction; not yet implemented or normative.
> Scope: FSDB directory layout, database identity boundaries, open-time database selection, Core / HTTP API changes, and LoomRealm platform integration.
> Implementation baseline: `feat/fsdb-case-insensitive-directory-types` (case-insensitive directory type markers).
> This proposal does not change the existing Content API v1 or FSDB HTTP v1 wire contracts.

## 1. Summary

FSDB should support both multiple top-level databases and recursively nested databases. A nested database is physically contained by another database directory, but it remains a **logically independent, self-contained database**.

A caller opens exactly one database by providing:

- `root`: the filesystem container root that holds the top-level `[FSDB]` directories;
- `path`: the logical database path relative to that container root, using `/` as the separator.

The proposed Core API is deliberately breaking:

```ts
export interface OpenFsdbOptions {
  /** Filesystem container root, not an already selected FSDB directory. */
  readonly root: string;

  /** Required logical path to exactly one FSDB, e.g. "GameData/World". */
  readonly path: string;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;
```

There is no implicit default database, no "first database" fallback, and no `option.path` wrapper. The caller must identify the database it intends to open.

## 2. Goals and non-goals

### Goals

1. Allow any number of top-level `[FSDB]` directories under one container root.
2. Allow an FSDB directory to contain child `[FSDB]` directories recursively.
3. Select one exact database with a stable, portable logical path.
4. Keep every FSDB self-contained, with local tables, references, resources, validation, snapshot, and lifecycle.
5. Preserve the existing table and object identity model inside an opened database.
6. Keep Runtime consumers independent of physical filesystem paths.
7. Make the selection explicit at the installation / platform preparation boundary.

### Non-goals

- Merging tables from multiple databases into one namespace.
- Parent/child inheritance, overlays, joins, or cross-database foreign keys.
- Resolving a parent's references against a child, or vice versa.
- Automatically opening, validating, indexing, or fingerprinting all descendant databases.
- Making Node-only `@loomrealm/fsdb` a browser/PWA storage abstraction.
- Changing the existing `/fsdb/v1` HTTP routes or Content API v1 response semantics.
- Adding a public database catalog / enumeration API in this change.
- Adding database writes, transactions, or cross-database publication.

## 3. Directory model

### 3.1 Database and table nodes

A container root may contain multiple top-level FSDB directories. Each FSDB directory may contain child FSDB directories and its own four table types:

```text
Game/
├── [FSDB]GameData/
│   ├── [STRUCT]GlobalConfig/
│   ├── [RESOURCE]SharedAssets/
│   ├── [FSDB]World/
│   │   ├── [STRUCT]Maps/
│   │   └── [RESOURCE]MapAssets/
│   └── [FSDB]Characters/
│       ├── [STRUCT]Attributes/
│       └── [RESOURCE]Portraits/
│
├── [FSDB]ModData/
│   ├── [STRUCT]Settings/
│   └── [RESOURCE]Assets/
│
└── [FSDB]Cache/
    └── [STRUCT]Entries/
```

The logical grammar is:

```text
ContainerRoot
└── FSDB(DatabaseName)
    ├── FSDB(DatabaseName)       zero or more; recursive
    ├── STRUCT(TableName)        zero or more
    ├── EXTEND(TableName)        zero or more
    ├── GROUP(TableName)         zero or more
    └── RESOURCE(TableName)      zero or more
```

Each `[FSDB]` directory starts a new database scope. Each nested database follows the same directory rules recursively.

### 3.2 Database boundaries are recognized only at database-root level

The type marker is interpreted according to the current directory's role:

- Direct children of an FSDB root may be `[FSDB]` child databases or one of the four table types.
- A table is not a container for another database.
- Directories below a `[RESOURCE]` table are resource-key path segments, not FSDB/table nodes.
- Therefore a resource directory literally named `[FSDB]World` is still an ordinary ResourceKey segment. The `[FSDB]` prefix has database meaning only when it appears as a direct child of an FSDB root.
- Resource subdirectories never create a new database or metadata scope.

This prevents a recursive filesystem walk from accidentally interpreting resource folders as databases.

### 3.3 Directory type marker casing

The case-insensitive type-marker rule is part of the agreed baseline on this branch and applies to all five physical type markers:

```text
[FSDB] [STRUCT] [EXTEND] [GROUP] [RESOURCE]
```

- Readers **MUST** recognize the ASCII type marker without regard to ASCII letter case.
- Writers **SHOULD** emit uppercase type markers.
- Case folding applies only to the marker inside `[]`.
- DatabaseName, TableName, Key, and ResourceKey remain case-sensitive logical names and continue to use the existing NFC / NameSegment rules.
- Physical directories such as `[FSDB]GameData` and `[fsdb]GameData` represent the same logical child database name. If both exist as separate physical entries, resolution MUST fail as ambiguous / duplicate; the implementation must not choose one arbitrarily.
- The same duplicate-identity rule applies to table type markers, e.g. `[STRUCT]角色` and `[struct]角色`.

Uppercase output is a writer convention, not a requirement to rename existing lowercase data.

## 4. Database independence

Physical nesting is organizational containment only. It does not create a logical parent/child database relationship.

Every FSDB is an independent data unit:

- It owns its own tables, schemas, records, and resources.
- It has its own table namespace and object identities.
- It has its own snapshot identity, source fingerprints, read leases, and OPEN / STALE / CLOSED lifecycle.
- It is validated independently.
- Opening one FSDB does not open or validate its parent, children, or siblings.
- A parent database does not depend on the existence or contents of a child database.
- A child database does not inherit schemas, records, resources, or configuration from its parent.
- No FSDB may reference another FSDB's STRUCT records, schemas, or resources.
- Cross-database references are forbidden in both directions: parent-to-child, child-to-parent, and sibling-to-sibling.
- There is no cross-database join, foreign key, resource resolution, inheritance, overlay, or implicit merge.

### 4.1 Reference scope

Existing `.extend.meta` declarations in EXTEND and GROUP tables resolve STRUCT table names only within the same opened FSDB.

For example:

```text
[FSDB]GameData/
├── [STRUCT]Character/
└── [FSDB]World/
    ├── [STRUCT]Character/
    └── [EXTEND]CharacterSkills/
```

The `CharacterSkills` table inside `World` resolves `struct: "Character"` to `World`'s own `[STRUCT]Character`. It cannot resolve the parent database's table.

Resource keys are likewise local to the database containing the RESOURCE table. A value in one database cannot use this mechanism to resolve a resource from another database.

If data needs to be shared between databases, the content must be duplicated or coordinated by a higher-level installer / packaging system. Cross-database sharing is not an FSDB feature.

## 5. Database selection path

### 5.1 Meaning of `root` and `path`

`root` is the filesystem container root. It is not the selected database directory.

`path` is a logical database path relative to `root`. Each segment names one FSDB directory, without the physical `[FSDB]` prefix.

Example:

```text
root = "/games/example"
path = "GameData/World"

physical target =
  /games/example/
    [FSDB]GameData/
      [FSDB]World/
```

Other examples:

| `path` | Selected physical directory |
|---|---|
| `GameData` | `[FSDB]GameData` |
| `ModData` | `[FSDB]ModData` |
| `GameData/World` | `[FSDB]GameData/[FSDB]World` |
| `GameData/World/Region` | `[FSDB]GameData/[FSDB]World/[FSDB]Region` |

To open a standalone database directory, the caller supplies its parent as `root` and its DatabaseName as `path`. Passing an already selected `[FSDB]...` directory as `root` with an empty path is not supported.

### 5.2 Path syntax

The `path` field is required and MUST be a non-empty string.

- `/` is the only logical separator.
- Each segment is a DatabaseName / NameSegment, without `[FSDB]`.
- Segments are NFC-canonicalized using the existing FSDB name rules.
- DatabaseName matching remains case-sensitive.
- Empty segments, leading or trailing separators, repeated separators, `.`, `..`, backslashes, absolute paths, and OS-specific path syntax are forbidden.
- The caller passes a logical string, not a URL; URL percent-decoding is not part of this API.
- The path must not be passed directly to a generic filesystem join and trusted as safe. The resolver walks and validates one database segment at a time.

Examples:

```text
Valid:   GameData
Valid:   GameData/World
Valid:   游戏数据/世界/区域

Invalid: ""
Invalid: /GameData
Invalid: GameData/
Invalid: GameData//World
Invalid: GameData/../World
Invalid: GameData\\World
Invalid: [FSDB]GameData
```

### 5.3 Resolution rules

The resolver walks from `root` one segment at a time:

1. Resolve and validate the caller-supplied container root as a directory.
2. For the first segment, locate a direct child whose physical name is `[FSDB]` plus that logical DatabaseName.
3. For each subsequent segment, repeat the same lookup inside the previously selected FSDB directory.
4. Match the `[FSDB]` marker case-insensitively, but match the NFC DatabaseName case-sensitively.
5. Each selected component MUST be a real directory, not a symbolic link, junction, or other indirection.
6. Duplicate physical candidates that canonicalize to the same logical DatabaseName MUST fail resolution; the resolver must never pick an arbitrary match.
7. Every resolved component MUST remain beneath the supplied container root. Path traversal and symlink escape are forbidden.
8. The final resolved directory is the only FSDB passed to the Core scanner.

A missing segment, invalid segment, ambiguous match, non-directory candidate, or unsafe indirection is a resolution failure. There is no fallback to another database.

The container root itself may be supplied using the host's normal path syntax; the logical `path` must not contain host-specific path syntax. Existing behavior of resolving a relative `root` against the process working directory may be retained.

## 6. Core API: intentional breaking change

### 6.1 New public options

Replace the current root-only API:

```ts
// Current implementation
interface OpenFsdbOptions {
  readonly root: string;
}
```

with:

```ts
export interface OpenFsdbOptions {
  readonly root: string;
  readonly path: string;
}
```

Usage:

```ts
const db = await openFsdb({
  root: installationRoot,
  path: "GameData/World",
});
```

The following forms are deliberately not supported:

```ts
openFsdb({ root: installationRoot });             // path is required
openFsdb({ root: installationRoot, option: { path: "GameData" } }); // no option wrapper
openFsdb({ root: selectedFsdbDirectory, path: "" }); // empty path is invalid
```

There is no implicit default database and no "first matching FSDB" behavior. Selection must not depend on directory enumeration order or sorting.

### 6.2 What remains database-handle-local

Once `openFsdb()` returns a handle, that handle represents exactly one selected database. The existing local identities remain unchanged:

```ts
TableIdentity = (TableKind, TableName)

FsdbObjectIdentity =
  (kind, table, key)
  | (kind, table, metadataName)
```

Do not add `databasePath` to `TableIdentity`, `FsdbObjectIdentity`, or individual entry descriptors. The selected path is an open-time locator, not part of an object's identity inside its database.

The following APIs remain local to the supplied `FsdbDatabase` handle:

- `describeFsdb(db)`
- `getFsdbSnapshotId(db)`
- `listFsdbEntries(db)`
- `openFsdbObject(db, identity, signal)`

They continue to describe or access only the database represented by that handle. No table enumeration or object lookup implicitly crosses into nested databases.

### 6.3 HTTP adapter

`ServeFsdbOptions` continues to extend `OpenFsdbOptions`, so `serveFsdb()` receives the same required `root` and `path`:

```ts
const service = await serveFsdb({
  root: installationRoot,
  path: "GameData/World",
  host: "127.0.0.1",
  port: 0,
});
```

`createFsdbHttpHandler(db)` remains unchanged because it borrows an already selected database handle.

One `FsdbHttpService` serves one selected FSDB. The existing `/fsdb/v1` routes and their lowercase HTTP kind tokens remain unchanged; the selected filesystem path is not added to the HTTP URL. Serving several databases requires several independently configured services or a separately designed higher-level router; multi-database routing is not part of this proposal.

## 7. LoomRealm integration

### 7.1 Desktop

Current Desktop preparation discovers the FSDB root by requiring exactly one direct child `[FSDB]` directory in the installation root. This must be replaced with explicit selection.

Target flow:

```text
Prepared installation
    ↓
installation / platform Content selection supplies path
    ↓
openFsdb({ root: installationRoot, path })
    ↓
one independent FsdbDatabase
    ↓
one immutable Desktop Content Index
    ↓
existing Content API v1
```

The current `preparedFsdbRoot()` "exactly one FSDB root" discovery rule is removed. Desktop must not silently choose one database when several exist.

The selected path should come from installation / platform Content configuration and be passed into PREPARE / Content realization. It should not be added casually to `GameEntryV1`: that type is a closed Game logical-topology contract, not the owner of physical Content placement. The exact configuration document / field owner must be decided before platform integration; its logical value should use the same `path` syntax defined here.

The Desktop Content view remains bound to one selected FSDB. Its existing namespace projection (for example, `struct.Character`) remains unambiguous within that selected database. No physical path is exposed to Subsystems or Renderers.

### 7.2 PWA

PWA continues to use browser-native storage and Content realization (for example, OPFS / IndexedDB / Service Worker). Node-only `@loomrealm/fsdb` is not promoted to a browser storage abstraction.

The packaging / installation preparation step must select the intended FSDB using the same logical path semantics and produce the Content projection for that selected database. The browser runtime consumes the resulting Content index; it does not need to recursively scan the source filesystem.

Desktop and PWA must agree on the selected database's logical Content semantics, not on identical physical storage mechanics.

The current Content API v1 has no database dimension. Therefore this proposal selects one database per Content view / installation projection. Simultaneously exposing several independent databases to one Runtime would require a separate Content identity and routing design; it must not be implemented by concatenating namespaces or silently merging indexes.

### 7.3 Game Package and installation configuration boundary

`GameEntryV1` is closed-schema and describes logical game topology / initial state. Database selection is a platform / installation Content concern, not a Game Entry concern.

The selected `path` must be supplied by the platform or installation preparation configuration. This proposal freezes the path semantics and Core API shape, but intentionally does not invent a new configuration filename or silently extend `GameEntryV1`. That ownership decision is a prerequisite for the Desktop and PWA integration work.

## 8. Versioning and migration

This is an intentional API breaking change and a directory-format capability expansion.

- `@loomrealm/fsdb` must publish a major version for the required `path` option.
- `@loomrealm/fsdb-http` must publish a compatible major version because it re-exports / inherits the Core open options.
- Existing source calls using `openFsdb({ root: fsdbDirectory })` must be migrated.
- Existing single-database installations migrate by passing the parent container as `root` and the database name as `path`.

Example migration:

```ts
// Before
await openFsdb({
  root: "/games/example/[FSDB]GameData",
});

// After
await openFsdb({
  root: "/games/example",
  path: "GameData",
});
```

The nested-database directory semantics are a new FSDB directory-format revision and must be reflected in the formal FSDB layout specification and conformance suite before implementation is declared complete.

Do not conflate these versions:

- FSDB directory-format revision: gains nested database nodes and multiple top-level database selection.
- Core / HTTP npm package major versions: reflect the TypeScript API break.
- FSDB HTTP wire protocol: remains `/fsdb/v1` for this change.
- LoomRealm Content API: remains Content API v1 for one selected database.

The current [FSDB layout](./fsdb-layout.md) remains the description of the implemented format until the nested-database proposal is accepted into the normative specification and implemented. This document is a target design, not a claim that nested databases already work.

## 9. Required implementation and conformance work

### Core resolver and scanner

- Add a dedicated resolver for `root + path`; do not bury path traversal in table scanning.
- Require `path` at the TypeScript and runtime validation layers.
- Resolve each path segment through a direct `[FSDB]` child directory.
- Apply ASCII case-insensitive matching only to the type marker.
- Apply existing NFC / NameSegment validation to each DatabaseName.
- Reject duplicate normalized child database names and unsafe directory indirection.
- Pass only the final selected directory to the existing single-database scanner.
- Keep the scanner scoped to the selected database's own tables; never recurse into child databases.
- Keep all public object identities local to the returned handle.

### HTTP and platform integration

- Propagate the required options through `serveFsdb()`.
- Keep `createFsdbHttpHandler(db)` and `/fsdb/v1` route semantics stable.
- Replace Desktop's exactly-one-root discovery with explicit configured path selection.
- Add the selected path to the correct platform / installation Content configuration without changing `GameEntryV1`.
- Make PWA packaging select the same logical database before projecting Content into browser-native storage.
- Keep one Content view bound to one database.

### Test matrix

At minimum, conformance should cover:

1. One top-level FSDB selected by a one-segment path.
2. Multiple top-level FSDBs selected independently.
3. Nested FSDB selected by a multi-segment path.
4. Three-or-more-level nested selection.
5. Mixed-case `[FSDB]` markers at every selected level.
6. Mixed-case table markers with uppercase writer output.
7. Case-sensitive DatabaseName matching and NFC canonicalization.
8. Duplicate physical child directories that normalize to the same logical name.
9. Missing, empty, absolute, trailing-slash, repeated-separator, dot-segment, and backslash paths.
10. Symlink / junction / non-directory candidates and path-escape attempts.
11. A RESOURCE subtree containing a directory named `[FSDB]Something`; it remains a ResourceKey segment and is never traversed as a database.
12. Parent, child, and sibling databases with identical TableIdentity values; each remains independent.
13. Cross-database STRUCT and Resource references are rejected by Integrity validation.
14. Opening the parent does not scan, fingerprint, validate, or invalidate because of child database contents.
15. Each independently opened database has its own snapshot and close / stale / read-lease lifecycle.
16. `serveFsdb()` serves only the selected database and preserves existing HTTP v1 conformance.
17. Desktop and PWA select the same logical database while retaining their distinct physical storage implementations.

## 10. Decisions intentionally left for the integration phase

The following are not reasons to weaken the Core contract, but must be resolved before end-to-end implementation:

1. **Selection configuration owner:** choose the platform / installation configuration that supplies `path`. Do not place it in `GameEntryV1` without a separate contract decision.
2. **On-disk format version declaration:** decide whether the new directory-format revision needs an explicit marker or is versioned by the package / installation manifest. This must not be confused with the HTTP `v1` route.
3. **Database discovery UI / tooling:** decide whether authoring tools need a public database-listing API. Runtime open does not need implicit discovery.
4. **Multiple databases in one Runtime:** this proposal opens one database per handle and one database per current Content view. Multi-database Runtime consumption requires a separate explicit identity / Content API design.

## 11. Final design rules

The target model is:

```text
Container Root
  ├── FSDB A
  │    ├── Tables owned by A
  │    └── FSDB A/Child
  │         └── Tables owned by A/Child
  └── FSDB B
       └── Tables owned by B
```

- Physical nesting is allowed; logical database independence is mandatory.
- Multiple top-level databases are allowed.
- One `openFsdb()` call selects exactly one database using required `root` and `path`.
- There is no default database and no enumeration-order fallback.
- Each database owns its schemas, records, resources, references, snapshot, validation, and lifecycle.
- References never cross database boundaries.
- The selected database path is not part of table or object identity.
- Tables never contain databases; RESOURCE subdirectories remain resource paths.
- Readers accept case-insensitive ASCII type markers; writers emit uppercase markers.
- HTTP v1 and Content API v1 remain unchanged for a single selected database.
