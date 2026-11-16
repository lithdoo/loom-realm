# FSDB Nested and Multi-Database Architecture

> Status: **Design proposal** — agreed direction; not yet implemented or normative.
> Scope: FSDB directory layout, recursive database discovery, independent database identity, Core / HTTP API changes, and multi-database LoomRealm Content integration.
> Implementation baseline: `feat/fsdb-case-insensitive-directory-types` (case-insensitive directory type markers).
> This proposal requires a breaking, database-aware Content API contract. The low-level FSDB HTTP adapter remains one database per service; its open options change, while its existing route shape can remain.

## 1. Summary

LoomRealm installations may contain **multiple top-level FSDBs and arbitrarily nested FSDBs**. Every discovered FSDB is a first-class, independently addressable database. Nesting describes physical organization only; it never creates logical ownership, inheritance, or a reference relationship.

This is not a design for selecting one database for an installation. It is a design for making **all databases in one installation available together**, while preserving each database's independent identity and lifecycle.

There are two distinct operations:

1. **Discover** all FSDB logical paths beneath an installation/container root.
2. **Open** one exact database by supplying its path.

The proposed Core API is deliberately breaking:

```ts
export interface OpenFsdbOptions {
  /** Filesystem container root containing top-level [FSDB] directories. */
  readonly root: string;

  /** Required logical path to exactly one FSDB, e.g. "GameData/World". */
  readonly path: string;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;
```

A separate discovery operation is required for installation-level consumers:

```ts
export interface ListFsdbPathsOptions {
  readonly root: string;
}

export function listFsdbPaths(
  options: ListFsdbPathsOptions,
): Promise<readonly string[]>;
```

`listFsdbPaths` discovers paths; it does not choose a default, open databases, or merge their contents. Consumers open each returned path independently with `openFsdb({ root, path })`.

At the LoomRealm Content boundary, `databasePath` becomes part of every database-backed Content identity. A single installation Content View can expose many FSDBs without merging their namespaces. Desktop and PWA MUST preserve this database dimension.

No installation-level file is introduced to select one database. No FSDB on-disk format-version marker is introduced. This is an intentional breaking change: consumers are migrated to the new contracts rather than supported through compatibility shims.

## 2. Goals and non-goals

### Goals

1. Allow any number of top-level `[FSDB]` directories under one installation/container root.
2. Allow an FSDB directory to contain child `[FSDB]` directories recursively.
3. Discover every FSDB path deterministically without scanning table or resource contents.
4. Open any one discovered database explicitly with required `root + path`.
5. Make all discovered databases independently addressable from one LoomRealm installation and one Runtime.
6. Keep every FSDB self-contained, with local tables, references, resources, validation, snapshot, and lifecycle.
7. Preserve the existing table and object identity model inside each opened database.
8. Add database identity at the LoomRealm Content boundary without modifying `TableIdentity` or `FsdbObjectIdentity`.
9. Keep Runtime consumers independent of physical filesystem paths.
10. Keep Desktop and PWA logically equivalent while allowing their storage implementations to differ.

### Non-goals

- Merging tables from different databases into one namespace.
- Parent/child inheritance, overlays, joins, or cross-database foreign keys.
- Resolving a database's references against its parent, children, or siblings.
- Automatically opening a database as a side effect of opening another database.
- Making Node-only `@loomrealm/fsdb` a browser/PWA storage abstraction.
- Introducing a configuration file or manifest field that selects one database for the installation.
- Adding a compatibility layer for the old root-only `openFsdb()` API or old single-database Content calls.
- Adding a FSDB on-disk format-version marker.
- Adding database writes, transactions, or cross-database publication.

The installation-level Content View is an aggregate access surface, not an aggregate database: it MUST retain database identity and independent handles rather than flattening databases into one logical namespace.

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

## 5. Database path, resolution, and discovery

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

The same logical `databasePath` is used by LoomRealm Content identities. It is a stable logical path relative to the installation root, not an OS path and not a physical directory name.

### 5.2 Path syntax

The `path` field is required and MUST be a non-empty string.

- `/` is the only logical separator.
- Each segment is a DatabaseName / NameSegment, without `[FSDB]`.
- Segments are NFC-canonicalized using the existing FSDB name rules.
- DatabaseName matching remains case-sensitive.
- Empty segments, leading or trailing separators, repeated separators, `.`, `..`, backslashes, absolute paths, and OS-specific path syntax are forbidden.
- The caller passes a logical string, not a URL; URL percent-decoding is not part of the Core API.
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

### 5.3 Explicit resolution rules

`openFsdb({ root, path })` resolves exactly one target:

1. Resolve and validate the caller-supplied container root as a directory.
2. For the first segment, locate a direct child whose physical name is `[FSDB]` plus that logical DatabaseName.
3. For each subsequent segment, repeat the same lookup inside the previously selected FSDB directory.
4. Match the `[FSDB]` marker case-insensitively, but match the NFC DatabaseName case-sensitively.
5. Each selected component MUST be a real directory, not a symbolic link, junction, or other indirection.
6. Duplicate physical candidates that canonicalize to the same logical DatabaseName MUST fail resolution; the resolver must never pick one arbitrarily.
7. Every resolved component MUST remain beneath the supplied container root. Path traversal and symlink escape are forbidden.
8. The final resolved directory is the only FSDB passed to the Core scanner.

A missing segment, invalid segment, ambiguous match, non-directory candidate, or unsafe indirection is a resolution failure. There is no fallback to another database and no default selection.

### 5.4 Recursive database discovery

Installation-level consumers need to discover all available databases before opening them. The Core package SHOULD expose:

```ts
export interface ListFsdbPathsOptions {
  readonly root: string;
}

export function listFsdbPaths(
  options: ListFsdbPathsOptions,
): Promise<readonly string[]>;
```

Normative behavior:

- Start with direct `[FSDB]` children of `root`.
- For each discovered FSDB directory, inspect only its direct children for further `[FSDB]` directories, and recurse only through those database directories.
- Never interpret directories inside `[STRUCT]`, `[EXTEND]`, `[GROUP]`, or `[RESOURCE]` tables as databases. In particular, a resource key segment named `[FSDB]Something` remains ordinary resource content.
- Return canonical logical paths relative to `root`, without type markers.
- Return paths in deterministic Unicode code-point order; discovery order MUST NOT depend on filesystem enumeration order.
- Validate each database path segment, marker casing, duplicate logical child names, directory type, and no-symlink rule.
- Discovery does not scan table contents, build snapshots, run Integrity validation, or open database handles.
- A discovered database is opened and validated independently by a separate `openFsdb({ root, path })` call.
- No discovered path is implicitly selected. An empty result is an empty database catalog, not an invitation to guess a default.

Discovery must not make database contents dependent on one another. A malformed table inside one discovered database is an error when that database is opened; it must not change the result of opening a valid sibling or parent database. Physical tree/name errors that prevent unambiguous discovery (for example duplicate logical child names or a symlinked database directory) are discovery errors and MUST be reported rather than silently skipped.

The Core scanner remains single-database. Recursive traversal belongs to discovery, not to table scanning.

## 6. Core API: intentional breaking change

### 6.1 Required open options

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

The following forms are deliberately unsupported:

```ts
openFsdb({ root: installationRoot }); // path is required
openFsdb({ root: installationRoot, option: { path: "GameData" } }); // no option wrapper
openFsdb({ root: selectedFsdbDirectory, path: "" }); // empty path is invalid
```

There is no implicit default database and no "first matching FSDB" behavior. Selection MUST be explicit.

### 6.2 Discovery and opening are separate

`listFsdbPaths({ root })` enumerates logical database paths. `openFsdb({ root, path })` opens exactly one of them. Neither operation implicitly invokes the other.

A caller that needs all databases follows this pattern:

```ts
const paths = await listFsdbPaths({ root: installationRoot });
const databases = await Promise.all(
  paths.map((path) => openFsdb({ root: installationRoot, path })),
);
```

The caller owns the returned handles and MUST close every successfully opened handle. If aggregate preparation fails partway through, already-opened handles MUST be closed.

### 6.3 Database-local identities remain unchanged

One `FsdbDatabase` handle represents exactly one selected database. The existing local identities remain:

```ts
TableIdentity = (TableKind, TableName)

FsdbObjectIdentity =
  (kind, table, key)
  | (kind, table, metadataName)
```

Do not add `databasePath` to `TableIdentity`, `FsdbObjectIdentity`, or individual FSDB entry descriptors. These identities are local to a single handle.

The following APIs remain local to the supplied `FsdbDatabase` handle:

- `describeFsdb(db)`
- `getFsdbSnapshotId(db)`
- `listFsdbEntries(db)`
- `openFsdbObject(db, identity, signal)`

Each opened database owns its own snapshot, fingerprint, read leases, and OPEN / STALE / CLOSED lifecycle. A stale or closed handle does not stale or close another database handle.

### 6.4 FSDB HTTP adapter

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

One `FsdbHttpService` serves one selected FSDB. The existing `/fsdb/v1` routes and lowercase HTTP kind tokens remain unchanged. A caller that needs several FSDB HTTP endpoints creates one independently configured service per handle. LoomRealm's installation-level multi-database Content Service is a separate layer and MUST NOT be constrained to one database merely because this low-level adapter serves one handle.

## 7. LoomRealm multi-database integration

### 7.1 Installation boundary: no single-database selector

An installation is the physical container for all its FSDBs. The directory tree itself is the source of truth.

- Do not add `content.json` or another installation manifest whose purpose is selecting one FSDB.
- Do not put a single `databasePath` selector in `GameEntryV1`, launcher manifests, or platform launch configuration.
- Do not select a default database or the first discovered database.
- Discover all database paths from the installation root and make every database available to the installation's Content layer.
- Keep `GameEntryV1` and launcher manifests responsible for their existing logical game / executable contracts.

`databasePath` is used to address one database in a Content request; it is not a configuration field selecting the installation's only database.

### 7.2 Desktop: one installation view, many independent handles

The current Desktop implementation has a single `db` field, discovers exactly one direct child `[FSDB]` directory, and builds an index without a database dimension. All three assumptions MUST be removed.

Target flow:

```text
Prepared Installation Root
       |
       v
listFsdbPaths({ root })
       |
       +---- GameData -----------------> openFsdb({ root, path: "GameData" })
       |
       +---- GameData/World -----------> openFsdb({ root, path: "GameData/World" })
       |
       +---- ModData ------------------> openFsdb({ root, path: "ModData" })
       |
       v
Installation-level Desktop Content View
       |
       +---- databasePath-aware Content Index
       |
       v
Desktop Content Service
```

The installation-level Content View owns a collection/map of independent database handles, keyed by canonical `databasePath`. It is not itself an FSDB and does not merge their table namespaces.

Every Content index identity MUST include all of:

```ts
interface ContentIndexIdentity {
  readonly databasePath: string;
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
}
```

Consequences:

- Two databases MAY contain the same `kind`, `namespace`, and `key` without collision.
- The lookup key MUST include `databasePath`; never concatenate the database path into `namespace`.
- A Content request resolves the selected database handle first, then resolves the local `FsdbObjectIdentity` within that handle.
- Closing the installation view closes all owned handles.
- A database's snapshot / stale state remains independent. The view MUST NOT share snapshots or read leases between databases.

The aggregate view is installation-scoped, while the database handles it owns remain independent. Opening or indexing one database MUST be isolated: a failed database is marked unavailable for that view, but it MUST NOT prevent healthy siblings from being opened or served, and MUST NOT stale or close their handles. The view/catalog records the per-database availability result so callers can distinguish an unavailable database from an absent one. Whether a particular game may launch without one of its databases is a higher-level game/runtime policy, not an FSDB dependency.

### 7.3 PWA: preserve database identity through bundling and storage

PWA continues to use browser-native storage and Content realization (OPFS / IndexedDB / Service Worker). Node-only `@loomrealm/fsdb` is not promoted to a browser storage abstraction.

The PWA source/package builder MUST enumerate the same logical database paths and process every database independently. It MUST NOT choose one database, flatten all databases into one shared namespace, or discard database identity.

The PWA bundle target shape is:

```ts
interface PwaBundleContentEntry {
  readonly databasePath: string;
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly mime: string;
  readonly body: Blob;
}

interface PwaInstallationBundle {
  readonly databases: readonly string[];
  readonly content: readonly PwaBundleContentEntry[];
  // Existing game entry, launch manifest, and executable fields remain.
}
```

`databases` is the complete discovered database catalog, including an empty database that has no record/group/resource entries. Each content entry carries its owning `databasePath`.

The installer MUST:

- validate every `databasePath` using the same logical path rules;
- validate each content entry within its owning database;
- treat `(databasePath, kind, namespace, key)` as the content identity;
- allow the same namespace/key in different databases;
- reject duplicates only when the full database-scoped identity is equal;
- preserve `databasePath` in the persisted Content Index;
- retain content-addressed object storage / deduplication by bytes where useful, without using the content hash as a substitute for database identity.

The Service Worker MUST parse and validate `databasePath` as part of every record/group/resource request, and match the full database-scoped identity. The manifest remains installation-wide. A database catalog endpoint exposes `databases` without requiring the browser to inspect the source filesystem.

PWA installation remains an atomic installation publication: a bundle is validated and published as one installation generation. That does not merge its databases; each database remains independently addressable after publication.

### 7.4 Content API: database is part of logical content identity

The current Content API identity has no database dimension. That is incompatible with multiple independent FSDBs because two databases may legitimately contain identical table namespaces and keys.

The breaking Content contract MUST add `databasePath` to every database-backed record/group/resource identity. It MUST NOT encode the database path by prefixing or concatenating it into `namespace`.

Target identity:

```ts
interface ContentObjectIdentity {
  readonly databasePath: string;
  readonly namespace: string;
  readonly key: string;
}
```

The Runtime-facing Content client SHOULD accept this identity as one object:

```ts
interface ContentDatabaseDescriptor {
  readonly databasePath: string;
  readonly availability: "available" | "unavailable";
}

interface ContentClient {
  databases(options?: ContentReadOptions): Promise<readonly ContentDatabaseDescriptor[]>;
  record(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentRecord>;
  group(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentGroup>;
  resource(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentResource>;
}
```

This makes the database boundary explicit at every read and avoids ambiguous positional overloads. The same logical path validation applies as in the FSDB Core API.

Manifest is installation-level and has no `databasePath`. The installation's database catalog is also installation-level and lists all discovered canonical paths.

Recommended wire shape for the breaking Content API:

```http
GET /_lr/v2/games/{installationId}/manifest
GET /_lr/v2/games/{installationId}/databases

GET /_lr/v2/games/{installationId}/databases/{databasePathSegment}/records/{namespace}/{key}
GET /_lr/v2/games/{installationId}/databases/{databasePathSegment}/groups/{namespace}/{key}
GET /_lr/v2/games/{installationId}/databases/{databasePathSegment}/resources/{namespace}/{key...}
```

`databasePathSegment` is one URL path segment containing the percent-encoded complete logical database path (for example, `GameData/World` is encoded as `GameData%2FWorld`). The server decodes that one segment exactly once, then validates its slash-separated logical segments. Resource key segments remain separate trailing segments. This avoids ambiguity between variable-depth database paths and the resource-key suffix.

The database catalog response MUST be deterministic and contain each canonical logical path plus its availability state (`available` / `unavailable`); it MUST NOT expose physical paths or filesystem metadata. The catalog is derived from the installation tree, not authored in a separate selection file. PWA's atomically published bundle normally reports every bundled database as available; Desktop MAY report a discovered but unopenable database as unavailable while continuing to serve healthy databases.

Content cache/index identity MUST include:

```text
installationId + databasePath + kind + namespace + key + contentVersion
```

Desktop and PWA MUST expose the same database-scoped identity and response semantics. The current Content API v1 single-database routes/client are not preserved as a compatibility surface; the contract is changed as a breaking migration.

### 7.5 Game Package and launcher boundary

`GameEntryV1` remains unchanged in responsibility: it describes logical game topology / initial state. Launcher manifests remain responsible for executable bindings.

Neither contract selects one FSDB. No additional installation selection document is introduced. The installation root is enumerated directly by the preparation / packaging layer.

The Desktop and PWA preparation pipelines may differ physically, but they MUST produce the same canonical database catalog and database-scoped Content identities.

## 8. Breaking-change and migration policy

This is an intentional breaking change. All affected consumers are migrated together; no compatibility shim or old single-database behavior is retained.

- `@loomrealm/fsdb` changes `openFsdb()` to require `root` and `path` and adds recursive database-path discovery.
- `@loomrealm/fsdb-http` propagates the required open options. Its low-level service remains one database per service.
- LoomRealm Content identity and wire routes gain `databasePath`; the Content client API changes accordingly.
- Desktop and PWA Content indexes and storage records gain database-scoped identities.
- Existing tests, fixtures, demo bundles, and consumers are migrated to the new required fields and method signatures.

The FSDB directory layout gains nested database directories without adding an on-disk format-version marker. The implementation distinguishes database nodes by their position in the directory tree and the `[FSDB]` type marker.

The breaking Content route shape SHOULD use `/_lr/v2` rather than silently changing the meaning of the existing `/_lr/v1` routes. This is Content wire-contract versioning, not an FSDB disk-format marker. No old Content API compatibility endpoint is required.

Do not introduce:

- a disk-level `formatVersion` marker for FSDB;
- a `content.json` or equivalent single-database selection file;
- an implicit first-database fallback;
- compatibility wrappers for old API signatures;
- a migration path that merges multiple databases into one namespace.

The current [FSDB layout](./fsdb-layout.md) and [Content API v1](../../15-contracts/content-api-v1.md) describe the existing implementation baseline. They must be revised as part of implementation so that normative specifications match the new multi-database behavior. This proposal is the target architecture, not a claim that the implementation already supports it.

## 9. Required implementation and conformance work

### Core discovery and resolver

- Add deterministic `listFsdbPaths({ root })` recursive discovery.
- Require `path` at the TypeScript and runtime validation layers of `openFsdb()`.
- Resolve each path segment through a direct `[FSDB]` child directory.
- Apply ASCII case-insensitive matching only to the type marker.
- Apply existing NFC / NameSegment validation to each DatabaseName.
- Reject duplicate normalized child database names and unsafe directory indirection.
- Keep discovery separate from database content scanning and opening.
- Pass only the final selected directory to the existing single-database scanner.
- Never recurse into child databases while scanning one database.
- Keep all FSDB public object identities local to the returned handle.

### Desktop multi-database Content

- Replace the exactly-one-root discovery helper.
- Discover every database path and open each independently.
- Change the prepared Content view from one `db` field to a database-path-keyed handle collection.
- Include `databasePath` in every Content index key.
- Permit duplicate namespace/key identities across different database paths.
- Close all handles and preserve independent stale/closed state.

### PWA multi-database Content

- Update the source/package builder to enumerate all FSDB paths.
- Add the complete database catalog to the PWA installation bundle.
- Add `databasePath` to every PWA content bundle entry and persisted Content Index entry.
- Include `databasePath` in duplicate detection and Service Worker matching.
- Keep the OPFS content-addressed object store independent from logical database identity.
- Keep installation publication atomic and preserve each database's catalog entry, including empty databases.

### Runtime Content client and protocol

- Update the public `ContentClient` type and all call sites to require database-scoped identity.
- Update Desktop and PWA URL construction and route parsing.
- Add an installation-level database catalog endpoint.
- Include `databasePath` in Content cache identity and any client-side cache keys.
- Keep manifest identity installation-level.
- Keep physical paths and host filesystem metadata private.

### Integrity, validation, and lifecycle

- Ensure EXTEND/GROUP references resolve only within their own database.
- Reject any attempted cross-database STRUCT or Resource reference; do not search parent/child/sibling databases as fallback.
- Verify that opening a parent does not scan, fingerprint, validate, or stale because of child database contents.
- Verify that opening a child does not scan or depend on parent tables.
- Keep snapshots, read leases, fingerprints, and close/stale state independent.
- Keep the PWA installation publication transaction atomic; do not conflate installation atomicity with database namespace merging.

### Conformance minimum

1. One top-level FSDB discovered and opened.
2. Multiple top-level FSDBs discovered and opened independently.
3. Nested FSDB discovered and opened by a multi-segment path.
4. Three-or-more-level nested discovery.
5. Mixed-case `[FSDB]` markers at every selected/discovered level.
6. Mixed-case table markers with uppercase writer output.
7. Case-sensitive DatabaseName matching and NFC canonicalization.
8. Duplicate physical child directories that normalize to the same logical name.
9. Missing, empty, absolute, trailing-slash, repeated-separator, dot-segment, and backslash paths.
10. Symlink / junction / non-directory candidates and path-escape attempts.
11. A RESOURCE subtree containing a directory named `[FSDB]Something`; it remains a ResourceKey segment and is never discovered as a database.
12. Parent, child, and sibling databases with identical TableIdentity values; each remains independent.
13. A broken child database does not prevent direct opening of a valid parent or sibling.
14. A broken parent table does not prevent direct opening of a valid child database.
15. Cross-database STRUCT and Resource references are rejected; no fallback resolution occurs.
16. Each independently opened database has its own snapshot, stale state, read leases, and close lifecycle.
17. Desktop indexes two databases containing the same namespace/key without collision.
18. PWA bundle/index/Service Worker preserve databasePath, including empty databases.
19. Content Client addresses two databases with identical namespace/key and receives the correct distinct bytes.
20. Content cache keys include databasePath.
21. The database catalog is deterministic and exposes logical paths only.
22. Desktop and PWA produce the same database catalog and Content identities.
23. The FSDB HTTP adapter serves only its selected handle and retains its existing low-level route semantics.

## 10. Remaining design gaps and recommended repairs

The architecture is now fixed: an installation contains many independent FSDBs, and LoomRealm exposes all of them through one database-aware Content surface. The following details still need to be closed before or during implementation.

### Gap 1 — Core recursive discovery API

**Current gap:** `openFsdb({ root, path })` can open a known database, but the current Core API has no operation to enumerate all root and nested database paths. Desktop/PWA cannot reliably support all databases by guessing or duplicating ad-hoc directory walks.

**Recommended repair:** add `listFsdbPaths({ root })` as specified in `5.4. It returns canonical, deterministic logical paths, recursively traversing only direct `[FSDB]` children of database roots. It does not open or validate table contents. Use this single implementation as the authority for discovery.

### Gap 2 — Content API database identity and route

**Current gap:** `ContentIdentityV1` and current ContentClient methods identify records/groups/resources only by installation, namespace, and key. Two databases can legally contain the same namespace/key, so current identity is ambiguous.

**Recommended repair:** require `databasePath` for every record/group/resource identity; use an object-shaped identity argument for Runtime ContentClient methods; use a dedicated encoded database-path route segment; and change the breaking Content wire route to `/_lr/v2`. Keep manifest and database catalog installation-scoped. Never overload namespace with a prefixed database path.

### Gap 3 — Runtime database catalog

**Current gap:** even if a caller knows a `databasePath`, there is no standardized way for Runtime code to discover which database paths exist in the installation. Empty databases also cannot be inferred from record entries.

**Recommended repair:** expose an installation-level `GET /databases` endpoint returning the deterministic list of canonical logical database paths. Store the same complete list in the Desktop view and PWA bundle/installation record. This is derived metadata, not a new authored configuration file.

### Gap 4 — Desktop single-handle Content view

**Current gap:** `PreparedDesktopContentViewState` currently owns one `db`, `preparedFsdbRoot()` requires exactly one direct child FSDB, and the Content index key omits database identity.

**Recommended repair:** own a `Map<databasePath, FsdbDatabase>`, discover and open every path, key the index by `databasePath + kind + namespace + key`, and close every handle together when the installation view closes. Keep snapshot and stale state per handle.

### Gap 5 — PWA bundle and persisted index lose database identity

**Current gap:** `PwaBundleContentEntryV1` and `StoredContentIndexEntry` currently contain only kind/namespace/key. The installer duplicate check and Service Worker matcher use the same single-database identity.

**Recommended repair:** add `databasePath` to each content entry and persisted index record, add the complete `databases` catalog to the bundle and installation record, and match requests using the full database-scoped identity. Continue to deduplicate stored bytes by content hash where useful; never deduplicate logical identities across databases.

### Gap 6 — Runtime Content client signatures and call sites

**Current gap:** `ContentClient.record/group/resource(namespace, key)` cannot address more than one database. Changing only the HTTP service would leave Subsystem code unable to select a database.

**Recommended repair:** change the ContentClient methods to accept `ContentObjectIdentity` containing `databasePath`, `namespace`, and `key`. Update all Runtime/Subsystem consumers and demos in the same breaking change. Validate the database path before issuing a request.

### Gap 7 — Per-database failure and aggregate preparation policy

**Current gap:** Core database independence is specified, but the installation-level behavior when one discovered database is malformed has not been explicitly frozen.

**Recommended repair:** keep Core behavior strictly isolated. Desktop should retain per-database availability: failure to open/index one path must not block healthy databases, and the catalog should report each path's availability. PWA bundle publication may remain atomic at the installation-artifact level because the bundle is one validated artifact; a failed bundle build publishes nothing, but it must never merge or cross-resolve databases. Whether a game requires every discovered database is a higher-level Runtime policy; do not add required/optional flags or a single-database selector in this change.

### Gap 8 — Security and race-resistant path resolution

**Current gap:** the logical path rules are clear, but the implementation must prove that path traversal, symlink/junction traversal, duplicate marker variants, and filesystem races cannot escape the supplied root.

**Recommended repair:** implement one resolver with segment-by-segment validation, lstat/realpath containment checks, no-follow directory opening where supported, and post-open identity checks. Never pass untrusted `path` directly to `path.join` and trust the result. Add platform-specific symlink/junction and replacement-race tests.

### Gap 9 — Fixture, demo, and package-wide breaking migration

**Current gap:** current fixtures and demo PWA bundles assume one database or omit database identity. Package APIs and tests still encode old Content signatures.

**Recommended repair:** create fixtures with multiple root DBs, nested DBs, duplicate namespaces across DBs, and empty DBs. Migrate FSDB Core, FSDB HTTP, Subsystem ContentClient, Desktop, PWA, demos, tests, and documentation together. Remove old overloads and fallback code rather than maintaining a compatibility layer.

### Gap 10 — Normative specification alignment

**Current gap:** `fsdb-layout.md` and `content-api-v1.md` describe the existing single-database behavior and will contradict the target design if implementation starts without updating them.

**Recommended repair:** when implementation begins, update the FSDB layout specification to define nested database nodes and recursive discovery, and replace the Content API single-database identity/routes with the database-aware breaking contract. Do not add an FSDB disk-format marker. Keep the low-level FSDB HTTP adapter's one-handle-per-service boundary unless a separate requirement calls for a multi-database HTTP router.

These are implementation closure items, not reasons to add an installation-level database selector or to weaken the multi-database architecture.

## 11. Final design rules

```text
Installation Root
  ├── [FSDB]GameData
  │    ├── [STRUCT]Global
  │    ├── [FSDB]World
  │    │    └── [STRUCT]Maps
  │    └── [FSDB]Character
  │         └── [RESOURCE]Portraits
  └── [FSDB]ModData
       └── [STRUCT]Settings
```

- An installation may contain multiple root-level FSDBs and recursively nested FSDBs.
- Every FSDB is a first-class, independently addressable database.
- Physical nesting is organizational containment only; logical independence is mandatory.
- `listFsdbPaths({ root })` discovers all databases; it never chooses a default or opens them.
- `openFsdb({ root, path })` opens exactly one database; `path` is required.
- No installation-level configuration file selects one database. The installation tree is the source of truth.
- Parent, child, and sibling databases own separate tables, schemas, records, resources, references, snapshots, validation, and lifecycle.
- References never cross database boundaries.
- Opening one database never scans or validates another database's contents.
- `TableIdentity` and `FsdbObjectIdentity` remain local and do not contain `databasePath`.
- LoomRealm Content identity DOES contain `databasePath` for every record/group/resource.
- One installation Content View exposes many databases but never merges their namespaces.
- Desktop and PWA preserve the same database catalog and database-scoped Content identities.
- PWA bundling may flatten physical storage but MUST preserve `databasePath` in bundle entries and indexes.
- Empty databases remain discoverable through the database catalog.
- Tables never contain databases; RESOURCE subdirectories remain resource paths.
- Readers accept ASCII case-insensitive type markers; writers emit uppercase markers.
- This is a breaking migration: no old API compatibility shim, no default-first fallback, and no FSDB disk-format version marker.
