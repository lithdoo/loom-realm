# FSDB Nested and Multi-Database Architecture

> Status: **Design proposal — revised and design-reviewed; implementation is not yet complete or normative.**
> Scope: nested FSDB layout, explicit database addressing, Root-scoped FSDB HTTP v2, and database-aware LoomRealm Content API v2.
> Implementation baseline: \`feat/fsdb-case-insensitive-directory-types\`.
> Breaking contracts: FSDB Core API, FSDB HTTP service API / v2 routes, Content API v2, and PWA installation bundle v2.
> Storage compatibility: no FSDB on-disk format-version marker is introduced.

## 1. Summary

One installation/container root may contain multiple top-level FSDBs and arbitrarily nested FSDBs. Every FSDB is an independently addressable database. Physical nesting is organizational only; it does not create logical ownership, inheritance, or cross-database references.

The architecture has four distinct responsibilities:

1. **Core resolution and opening:** discover logical paths when needed, then open exactly one database by explicit path.
2. **FSDB HTTP v2:** expose every database below one filesystem Root through one HTTP Server. Resolve and open a database lazily from each request path; do not start one server per database.
3. **LoomRealm Content API v2:** make databasePath part of every record/group/resource identity. Desktop and PWA expose the same logical contract through different storage implementations.
4. **Packaging:** enumerate and package every database at build time. Preserve databasePath in every packaged content entry; do not introduce a runtime database catalog.

The Core API is deliberately breaking:

~~~ts
export interface OpenFsdbOptions {
  /** Filesystem container root, not an individual FSDB directory. */
  readonly root: string;

  /** Required logical path to exactly one FSDB. */
  readonly path: string;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;

export interface ListFsdbPathsOptions {
  readonly root: string;
}

export function listFsdbPaths(
  options: ListFsdbPathsOptions,
): Promise<readonly string[]>;
~~~

The Root-scoped FSDB HTTP service is:

~~~ts
export interface ServeFsdbOptions {
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
}

export function serveFsdb(
  options: ServeFsdbOptions,
): Promise<FsdbHttpService>;
~~~

One call to serveFsdb creates one Server for one canonical filesystem Root. It does not enumerate or open every database at startup. The first request for a database opens that database; subsequent requests reuse its handle.

At the LoomRealm Content boundary, databasePath is explicit:

~~~ts
export interface ContentObjectIdentity {
  readonly databasePath: string;
  readonly namespace: string;
  readonly key: string;
}

export interface ContentClient {
  record(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentRecord>;
  group(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentGroup>;
  resource(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentResource>;
}
~~~

There is deliberately no Runtime database catalog, no ContentClient.databases(), no /databases endpoint, no per-database availability state, and no default database. A caller must already know the logical databasePath it wants to read.

Desktop uses FSDB Core directly and lazily creates a per-database Content index inside one installation-level Content View. PWA packages all database content at build time and persists databasePath in its Content Index. Neither platform merges database namespaces.

The following distinctions are intentional:

- listFsdbPaths() is a build-time / tooling discovery primitive, not a Runtime catalog.
- FSDB HTTP v2 is a Root-level filesystem service, not the LoomRealm Content API.
- Desktop Content Service is a separate installation-level service; it does not call the FSDB HTTP service over loopback.
- PWA does not promote Node-only FSDB Core into a browser storage abstraction.
- Empty databases are valid FSDBs. They produce no PWA content entries and cannot be distinguished from absent databases through the Content API because no database-listing API exists.

No installation-level file selects one FSDB. No databasePath is added to GameEntryV1 or launcher manifests. No FSDB disk-format marker is introduced. Old single-database Core and Content call signatures are not retained as compatibility overloads.

## 2. Goals and non-goals

### 2.1 Goals

1. Allow multiple top-level FSDBs under one installation/container Root.
2. Allow an FSDB directory to contain child FSDB directories recursively.
3. Discover all database paths deterministically without scanning table or resource contents.
4. Open exactly one database through required root + path.
5. Serve all databases below one Root through one FSDB HTTP Server.
6. Make each database independently addressable through LoomRealm Content.
7. Keep tables, references, resources, snapshots, validation, read leases, and lifecycle local to one database.
8. Preserve the existing TableIdentity and FsdbObjectIdentity model inside a database.
9. Keep Desktop and PWA logically equivalent while allowing their storage implementations to differ.
10. Keep installation/game/launcher manifests independent of database selection.

### 2.2 Non-goals

- Merging tables from different databases into one namespace.
- Parent/child inheritance, overlays, joins, cross-database foreign keys, or cross-database resource resolution.
- Opening a database as a side effect of opening its parent, child, or sibling.
- A Runtime database catalog, database-list endpoint, availability map, or database enumeration API.
- A default database or first-discovered-database fallback.
- One FSDB HTTP Server per database.
- Making Node-only @loomrealm/fsdb a browser/PWA storage abstraction.
- A configuration file or manifest field selecting one database for an installation.
- A compatibility overload for the old root-only openFsdb() API or positional ContentClient methods.
- Database writes, transactions, or cross-database publication.
- An FSDB on-disk format-version marker.

The installation-level Desktop Content View is an access surface, not an aggregate database. It retains database identity and independent handles rather than flattening namespaces.

## 3. Directory model

### 3.1 Database and table nodes

A container Root may contain multiple top-level FSDB directories. Each FSDB directory may contain child FSDB directories and its own four table types:

~~~text
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
├── [FSDB]ModData/
│   ├── [STRUCT]Settings/
│   └── [RESOURCE]Assets/
└── [FSDB]Cache/
    └── [STRUCT]Entries/
~~~

The logical grammar is:

~~~text
ContainerRoot
└── FSDB(DatabaseName)
    ├── FSDB(DatabaseName)       zero or more; recursive
    ├── STRUCT(TableName)        zero or more
    ├── EXTEND(TableName)        zero or more
    ├── GROUP(TableName)         zero or more
    └── RESOURCE(TableName)      zero or more
~~~

Each [FSDB] directory starts a new database scope. Each nested database follows the same directory rules recursively.

### 3.2 Database boundaries are recognized only at database-root level

The type marker is interpreted according to the current directory's role:

- Direct children of an FSDB root may be child [FSDB] databases or one of the four table types.
- A table is not a container for another database.
- Directories below a [RESOURCE] table are resource-key path segments, not FSDB/table nodes.
- A resource directory literally named [FSDB]World is still ordinary resource content. The [FSDB] prefix has database meaning only when it appears as a direct child of an FSDB root.
- Resource subdirectories never create a database or metadata scope.

A discovery walk MUST recurse only through direct [FSDB] children of an FSDB root. It MUST NOT recursively walk arbitrary directories and infer database boundaries from names found inside tables.

### 3.3 Directory type marker casing

The case-insensitive type-marker rule applies to all five physical type markers:

~~~text
[FSDB] [STRUCT] [EXTEND] [GROUP] [RESOURCE]
~~~

- Readers MUST recognize the ASCII type marker without regard to ASCII letter case.
- Writers SHOULD emit uppercase type markers.
- Case folding applies only to the marker inside brackets.
- DatabaseName, TableName, Key, and ResourceKey remain case-sensitive logical names and use the existing NFC / NameSegment rules.
- Physical directories such as [FSDB]GameData and [fsdb]GameData represent the same logical child database name. If both exist as separate physical entries, resolution MUST fail as ambiguous / duplicate; it MUST NOT choose one arbitrarily.
- The same duplicate-identity rule applies to table type markers, for example [STRUCT]角色 and [struct]角色.

Uppercase output is a writer convention, not a requirement to rename existing lowercase data.

### 3.4 Reserved HTTP database delimiter

The Root-scoped HTTP routes use the literal path segment $db to mark the end of databasePath.

This delimiter is unambiguous because the existing FSDB NameSegment rule rejects names beginning with $. Therefore $db cannot be a valid DatabaseName, TableName, Key, or ResourceKey segment.

The route parser recognizes the literal raw segment $db as a structural delimiter before decoding ordinary path segments. A percent-encoded spelling such as %24db is not an alternate delimiter spelling.

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

Existing .extend.meta declarations in EXTEND and GROUP tables resolve STRUCT table names only within the same opened FSDB.

For example:

~~~text
[FSDB]GameData/
├── [STRUCT]Character/
└── [FSDB]World/
    ├── [STRUCT]Character/
    └── [EXTEND]CharacterSkills/
~~~

The CharacterSkills table inside World resolves struct: "Character" to World's own [STRUCT]Character. It cannot resolve the parent database's table.

Resource keys are likewise local to the database containing the RESOURCE table. A value in one database cannot use this mechanism to resolve a resource from another database.

If data needs to be shared between databases, content must be duplicated or coordinated by a higher-level installer / packaging system. Cross-database sharing is not an FSDB feature.

## 5. Database path, resolution, and discovery

### 5.1 Meaning of root and path

root is the filesystem container Root. It is not the selected database directory.

path is a logical database path relative to root. Each segment names one FSDB directory, without the physical [FSDB] prefix.

Example:

~~~text
root = "/games/example"
path = "GameData/World"

physical target =
  /games/example/
    [FSDB]GameData/
      [FSDB]World/
~~~

Other examples:

| path | Selected physical directory |
|---|---|
| GameData | [FSDB]GameData |
| ModData | [FSDB]ModData |
| GameData/World | [FSDB]GameData/[FSDB]World |
| GameData/World/Region | [FSDB]GameData/[FSDB]World/[FSDB]Region |

The same canonical logical databasePath is used by LoomRealm Content identities. It is relative to the installation Root, not an OS path and not a physical directory name.

### 5.2 Path syntax and canonicalization

The path field is required and MUST be a non-empty string.

- / is the only logical separator.
- Each segment is a DatabaseName / NameSegment without [FSDB].
- Each segment is canonicalized to NFC and validated by the existing FSDB NameSegment rules.
- DatabaseName matching remains case-sensitive.
- Empty segments, leading or trailing separators, repeated separators, ., .., backslashes, absolute paths, and OS-specific path syntax are forbidden.
- The Core API receives a logical string, not a URL. URL percent-decoding is not part of Core path handling.
- A path MUST NOT be passed directly to a generic filesystem join and trusted as safe.
- Canonical databasePath is the NFC-normalized segments joined with literal /.

Examples:

~~~text
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
~~~

The pure NameSegment and databasePath rules MUST have one browser-safe implementation authority. Extract the existing name/path validation into a Node-independent FSDB names subpath (for example, @loomrealm/fsdb/names) and use it from Core, HTTP, Subsystem ContentClient, and PWA installer/build code. This subpath MUST NOT import Node filesystem, stream, or crypto modules. The Node-only FSDB Core package remains Node-only; exposing pure name validation does not make its storage implementation a browser abstraction.

### 5.3 Explicit resolution rules

openFsdb({ root, path }) resolves exactly one target:

1. Resolve the caller-supplied container Root to its canonical real directory once.
2. Validate and NFC-canonicalize the logical path segments.
3. For the first segment, locate a direct child whose physical name is [FSDB] plus that logical DatabaseName.
4. For every subsequent segment, repeat the same lookup inside the previously selected FSDB directory.
5. Match the [FSDB] marker case-insensitively, but match the NFC DatabaseName case-sensitively.
6. Each selected component MUST be a real directory, not a symbolic link, junction, or other indirection.
7. Duplicate physical candidates that canonicalize to the same logical DatabaseName MUST fail resolution; the resolver MUST NOT pick one arbitrarily.
8. Every resolved component MUST remain beneath the canonical container Root.
9. The final resolved directory is the only FSDB passed to the Core single-database scanner.

A missing segment, invalid segment, ambiguous match, non-directory candidate, or unsafe indirection is a resolution failure. There is no fallback to another database and no default selection.

The container Root itself is caller-supplied and trusted; it may be canonicalized through a caller-intended symlink. Descendant database directories and recognized FSDB objects MUST NOT be followed through symlinks or junctions.

The supported deployment threat model assumes the prepared installation tree is not concurrently modified by an untrusted actor during discovery/open. Implementations MUST perform segment-by-segment validation and physical containment checks, reject symlink/junction candidates, and revalidate the selected physical identity before scanning. If hostile concurrent directory replacement must be supported, descriptor-relative no-follow traversal is a separate platform-specific security requirement; path-string checks alone MUST NOT be described as a complete defense against that threat.

### 5.4 Recursive database discovery

Core exposes a deterministic discovery operation:

~~~ts
export interface ListFsdbPathsOptions {
  readonly root: string;
}

export function listFsdbPaths(
  options: ListFsdbPathsOptions,
): Promise<readonly string[]>;
~~~

Normative behavior:

- Resolve and validate the container Root once.
- Start with direct [FSDB] children of the Root.
- For each discovered FSDB directory, inspect only its direct children for further [FSDB] directories, and recurse only through those database directories.
- Never interpret directories inside [STRUCT], [EXTEND], [GROUP], or [RESOURCE] tables as databases. A resource key segment named [FSDB]Something remains ordinary resource content.
- Return canonical logical paths relative to Root, without type markers.
- Return paths in deterministic Unicode code-point order by the complete canonical logical path.
- Validate each database path segment, marker casing, duplicate logical child names, directory type, and no-symlink rule.
- Discovery does not scan table contents, build snapshots, validate table metadata, open database handles, or calculate content hashes.
- A discovered database is opened and validated independently by openFsdb({ root, path }).
- An empty result is valid. It does not imply a default database.
- Physical tree/name errors that prevent unambiguous discovery, such as duplicate logical child names or a symlinked database directory, MUST be reported rather than silently skipped.
- A malformed table inside one discovered database is an error when that database is opened; it does not change the result of directly opening a valid sibling or parent database.

Discovery and opening are separate operations. listFsdbPaths is intended for packaging/build tooling and explicit filesystem inspection. Desktop Runtime and FSDB HTTP request handling do not need to enumerate all database paths before serving a known databasePath. No Runtime catalog is derived from this function.

## 6. Core API and single-database ownership

### 6.1 Required open options

Replace the current root-only API:

~~~ts
// Old API — intentionally removed.
interface OpenFsdbOptions {
  readonly root: string;
}
~~~

with:

~~~ts
export interface OpenFsdbOptions {
  readonly root: string;
  readonly path: string;
}
~~~

Usage:

~~~ts
const db = await openFsdb({
  root: installationRoot,
  path: "GameData/World",
});
~~~

The following forms are deliberately unsupported:

~~~ts
openFsdb({ root: installationRoot }); // path is required
openFsdb({ root: installationRoot, option: { path: "GameData" } }); // no option wrapper
openFsdb({ root: selectedFsdbDirectory, path: "" }); // empty path is invalid
~~~

There is no implicit default database and no first-matching-FSDB behavior.

### 6.2 Discovery and opening are separate

listFsdbPaths({ root }) enumerates logical database paths. openFsdb({ root, path }) opens exactly one of them. Neither operation implicitly invokes the other.

A caller that needs to process all databases should generally open and close them one at a time:

~~~ts
const paths = await listFsdbPaths({ root: installationRoot });

for (const path of paths) {
  const db = await openFsdb({ root: installationRoot, path });
  try {
    await packageDatabase(db, path);
  } finally {
    await db.close();
  }
}
~~~

This avoids retaining every database handle during packaging. A caller that deliberately opens several databases concurrently owns every returned handle and MUST close all successfully opened handles, including when aggregate preparation fails partway through.

### 6.3 Database-local identities remain unchanged

One FsdbDatabase handle represents exactly one selected database. Existing identities remain local:

~~~ts
TableIdentity = (TableKind, TableName)

FsdbObjectIdentity =
  (kind, table, key)
  | (kind, table, metadataName)
~~~

Do not add databasePath to TableIdentity, FsdbObjectIdentity, or individual FSDB entry descriptors.

The following APIs remain local to the supplied FsdbDatabase handle:

- describeFsdb(db)
- getFsdbSnapshotId(db)
- listFsdbEntries(db)
- openFsdbObject(db, identity, signal)

Each opened database owns its own snapshot, fingerprint, read leases, and OPEN / STALE / CLOSED lifecycle. A stale or closed handle does not stale or close another database handle.

The caller that opened a handle owns its close lifecycle. The aggregate Content View and Root-scoped HTTP service are owners of the handles they create internally.

### 6.4 Scanner boundary

The Core scanner remains single-database:

~~~text
openFsdb({ root, path })
        |
        v
resolve exactly one physical [FSDB] directory
        |
        v
scanFsdb(selectedPhysicalDatabaseRoot)
        |
        v
one FsdbDatabase handle
~~~

Recursive database traversal belongs to listFsdbPaths, not to scanFsdb. Opening a parent never scans a child; opening a child never scans its parent.

## 7. FSDB HTTP v2: one Root, one Server, many databases

### 7.1 Service boundary

The Root-scoped FSDB HTTP service is a breaking service/API change and uses the v2 wire route. Its public options are:

~~~ts
export interface ServeFsdbOptions {
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
}

export interface FsdbHttpService {
  readonly server: Server;
  readonly address: {
    readonly host: string;
    readonly port: number;
  };
  readonly origin?: URL;
  close(): Promise<void>;
}

export function serveFsdb(
  options: ServeFsdbOptions,
): Promise<FsdbHttpService>;
~~~

Rules:

- One service owns one canonical filesystem Root and one Node HTTP Server.
- One service serves any number of root-level and nested FSDBs beneath that Root.
- The service MUST NOT start one HTTP Server per database.
- The service validates/canonicalizes Root at startup but does not enumerate or open every database.
- An empty Root is valid; requests for missing database paths return not found.
- The service owns all database handles it lazily opens.
- Default host remains 127.0.0.1; default port remains 0.
- The service does not expose a filesystem path or database handle to the client.

The existing createFsdbHttpHandler(db) remains a low-level borrowed, single-handle handler for callers that explicitly need to embed a single database handler. It is not used by the Root-scoped serveFsdb service and is not a substitute for the multi-database Root service. The old serveFsdb({ root, path }) single-database service signature is removed rather than overloaded.

The existing frozen /fsdb/v1 handler route is not silently reinterpreted. The Root-scoped service uses /fsdb/v2.

### 7.2 v2 routes and database boundary

The v2 route shape is:

~~~http
GET|HEAD /fsdb/v2/{databasePathSegments}/$db
GET|HEAD /fsdb/v2/{databasePathSegments}/$db/{kind}/{table}/{entrySegments...}
~~~

Examples:

~~~http
GET /fsdb/v2/GameData/$db
GET /fsdb/v2/GameData/$db/struct/Character/Pikachu
GET /fsdb/v2/GameData/World/$db
GET /fsdb/v2/GameData/World/$db/struct/Map/town
GET /fsdb/v2/ModData/$db/resource/Assets/logo
~~~

The first route returns the selected database's existing Descriptor. The second route reads one entry or metadata object from that database.

Route rules:

- databasePath has one or more logical NameSegment path segments.
- The literal raw segment $db terminates databasePath.
- Exactly one $db delimiter is permitted, and it must occur before kind/table/key.
- kind remains one of struct, extend, group, resource.
- struct, extend, and group ordinary keys contain exactly one key segment.
- resource keys contain one or more segments after the table name.
- Metadata routes retain the existing $info, $extend, and $desc semantics.
- There is no /fsdb/v2 default database route and no /fsdb/v2/databases catalog route.
- A request cannot use a parent database as an implicit fallback when a child database path is missing.

### 7.3 URL encoding and parsing

Each database path segment is encoded independently using UTF-8 percent encoding. The slash between logical segments remains a literal URL path separator.

Canonical client construction:

~~~text
logical databasePath
→ split on logical /
→ encode each segment independently
→ join with literal /
→ append literal /$db
~~~

Do not encode the entire databasePath as one segment such as GameData%2FWorld.

Server parsing:

~~~text
raw origin-form request-target
→ split raw path on literal /
→ locate literal raw $db delimiter
→ percent-decode each ordinary segment exactly once
→ UTF-8 decode
→ NFC canonicalization and NameSegment validation
→ resolve databasePath through Core
→ perform local FSDB identity lookup
~~~

Rules:

- A decoded slash or backslash inside one segment is invalid; percent encoding cannot manufacture a path separator.
- Malformed percent escapes, invalid UTF-8, empty segments, dot segments, forbidden NameSegment characters, and invalid route shape return 400.
- A non-empty query string is rejected, matching the existing FSDB HTTP request contract.
- Invalid request-target, route shape, percent encoding, UTF-8, or logical path syntax returns 400.
- Unsupported methods return 405 with Allow: GET, HEAD.
- A missing database path or missing object returns 404.
- Ambiguous physical candidates or unsafe database-directory indirection return 409; the service MUST NOT choose a candidate.
- A selected database that fails FSDB Well-formed validation returns 422.
- A database that becomes STALE, or a transient read/open I/O failure, returns 503.
- An unexpected internal failure returns 500.
- Error responses use the existing empty-body style, include Cache-Control: no-store, and never disclose an absolute filesystem path or raw filesystem error message.

Successful responses retain the existing FSDB HTTP MIME, ETag, conditional request, GET/HEAD, and immutable snapshot semantics where they remain meaningful. These status mappings and headers are part of the v2 contract, not deferred implementation choices.

### 7.4 Lazy handle cache and concurrency

The service maintains an internal single-flight cache keyed by canonical databasePath:

~~~ts
const databases = new Map<string, Promise<FsdbDatabase>>();
~~~

Request flow:

~~~text
request
  |
  v
parse and canonicalize databasePath
  |
  v
lookup databasePath in handle cache
  |                         |
  | hit                     | miss
  v                         v
reuse open handle       openFsdb({ root, path })
                            |
                            v
                       cache Promise
  |                         |
  +------------+------------+
               |
               v
       read selected object
~~~

Normative lifecycle:

- Concurrent first requests for the same canonical path MUST share one opening Promise.
- Different database paths MUST open independently; one slow or malformed database MUST NOT block healthy siblings.
- A rejected open Promise is removed from the cache so a later request can retry.
- A successfully opened handle remains cached until service shutdown. Do not use an LRU that silently closes and reopens a database: reopening would create a new snapshot identity and change the service's static-snapshot semantics.
- If a cached database becomes STALE, requests fail for that database. The service MUST NOT silently reopen it and substitute a new snapshot.
- A database's read leases and stale state remain local to that database.
- The service does not eagerly open all databases and does not maintain a separate database catalog.

### 7.5 Server shutdown and ownership

service.close() is idempotent and returns the same in-progress shutdown operation to concurrent callers.

Shutdown order:

1. Transition the service to closing and stop admitting new requests.
2. Stop accepting new HTTP connections.
3. Abort or drain active request work so that no new read lease is admitted.
4. Await active handlers and all database-opening Promises already admitted.
5. Close every successfully opened database handle.
6. Resolve close() only after owned resources are released.

A database Promise that resolves while shutdown is in progress MUST still be included in cleanup. A failed opening Promise does not create a handle to close.

If startup/listen fails, the service closes its Server and every resource it has already acquired before rejecting. The public Server field is an escape hatch for address inspection and Node server configuration; it does not transfer lifecycle ownership.

## 8. LoomRealm Content API v2

### 8.1 Content identity

The breaking Content contract adds databasePath to every database-backed record/group/resource identity:

~~~ts
export interface ContentObjectIdentity {
  readonly databasePath: string;
  readonly namespace: string;
  readonly key: string;
}

export interface ContentClient {
  record(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentRecord>;
  group(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentGroup>;
  resource(identity: ContentObjectIdentity, options?: ContentReadOptions): Promise<ContentResource>;
}
~~~

Example:

~~~ts
const result = await scope.content.record({
  databasePath: "GameData/World",
  namespace: "struct.Map",
  key: "town",
});
~~~

Logical database-backed identity is:

~~~text
databasePath + kind + namespace + key
~~~

Do not encode databasePath by prefixing or concatenating it into namespace. Namespace retains its existing meaning.

Manifest remains installation-level and has no databasePath.

### 8.2 Content v2 routes

The Content API uses /_lr/v2. The database path is represented as multiple URL path segments and terminated by the literal $db delimiter:

~~~http
GET /_lr/v2/games/{installationId}/manifest

GET /_lr/v2/games/{installationId}/databases/{databasePathSegments}/$db/records/{namespace}/{key}
GET /_lr/v2/games/{installationId}/databases/{databasePathSegments}/$db/groups/{namespace}/{key}
GET /_lr/v2/games/{installationId}/databases/{databasePathSegments}/$db/resources/{namespace}/{resourceKeySegments...}
~~~

Examples:

~~~http
GET /_lr/v2/games/{id}/databases/GameData/$db/records/struct.Config/common
GET /_lr/v2/games/{id}/databases/GameData/World/$db/records/struct.Map/town
GET /_lr/v2/games/{id}/databases/ModData/$db/resources/resource.Assets/logo
~~~

Route rules:

- databasePath consists of one or more canonical NameSegment values.
- $db is the literal raw delimiter; it cannot be a valid database name.
- Encode each database path segment independently. Do not encode the whole path into one segment.
- Decode each ordinary segment exactly once, then validate it using the shared FSDB name rules.
- A decoded slash or backslash inside one segment is invalid.
- record/group keys remain one logical segment; resource keys remain slash-separated hierarchical segments.
- Manifest has no database path.
- There is no database catalog route and no default database route.

Content v2 status mapping for database-backed reads:

| Condition | HTTP status / Content result |
|---|---|
| Invalid route or databasePath syntax | 400 / CONTENT_REQUEST_INVALID |
| Missing database path or content entry | 404 / CONTENT_NOT_FOUND |
| Ambiguous physical database path | 409 / CONTENT_CONFLICT |
| Selected database fails FSDB validation | 422 / CONTENT_INVALID |
| Selected database is STALE or temporarily unavailable | 503 / CONTENT_UNAVAILABLE |
| Unexpected internal failure | 500 / CONTENT_UNAVAILABLE |

Existing authentication, permission, installation-state, size-limit, and integrity semantics remain in force. Manifest remains installation-scoped.

### 8.3 Runtime discovery policy

ContentClient requires the caller to supply databasePath. It does not expose a database-listing method.

The Runtime/game code must know the logical path it intends to read, for example through its own authored content contract or code-level convention. Runtime discovery of arbitrary database names is explicitly out of scope.

This is a deliberate trade-off:

- It keeps Content identity explicit and small.
- It avoids a second installation manifest or a database registry.
- It avoids synchronizing a catalog between Desktop, PWA Bundle, IndexedDB, and Service Worker.
- It means Content API callers cannot distinguish an empty database from a missing database using a catalog query. Both produce CONTENT_NOT_FOUND for a read of a nonexistent entry.

If a future product requirement needs dynamic Runtime enumeration or empty-database existence queries, that is a separate Content API capability and must be designed explicitly in a later contract version. It MUST NOT be approximated by inferring databases from content entries.

### 8.4 Cache and version identity

Logical Content cache identity is:

~~~text
installationId + databasePath + kind + namespace + key
~~~

contentVersion is the representation validator for the bytes at that identity; it is not a substitute for databasePath and is not the logical identity by itself.

- Desktop and PWA MUST include databasePath in every lookup and cache key for database-backed content.
- ETag and X-Loom-Content-Version continue to describe the returned bytes.
- Identical bytes in different databases MAY share content-addressed physical storage.
- Such physical deduplication MUST NOT merge logical identities or cache entries.
- Manifest cache identity remains installation-level.

### 8.5 Desktop: one installation Content View, lazy per-database indexes

Desktop uses the prepared installation's canonicalRoot as the container Root. It MUST remove the current exactly-one-FSDB-root assumption.

The Content View owns a per-database cache:

~~~ts
interface PreparedDatabaseContent {
  readonly db: FsdbDatabase;
  readonly index: ReadonlyMap<string, ContentIndexEntry>;
}

interface PreparedDatabaseSlot {
  /** Resolves when the owned Core handle has opened. */
  readonly open: Promise<FsdbDatabase>;
  /** Resolves when the local Content Index has been built. */
  readonly prepared: Promise<PreparedDatabaseContent>;
}

interface PreparedDesktopContentViewState {
  readonly installationId: string;
  readonly installationRoot: string;
  readonly databases: Map<string, PreparedDatabaseSlot>;
  readonly ownedDatabases: Set<FsdbDatabase>;
}
~~~

The outer map is keyed by canonical databasePath. Each database's index remains local to that database. The aggregate logical identity is therefore still databasePath + kind + namespace + key without redundantly prefixing namespace.

Request flow:

~~~text
Content request
  |
  v
validate databasePath
  |
  v
get or single-flight open database
  |
  v
openFsdb({ root: installationRoot, path: databasePath })
  |
  v
build that database's local Content Index
  |
  v
resolve local FsdbObjectIdentity
  |
  v
read lease, verify contentVersion, return Content response
~~~

Rules:

- Database handles and indexes are created lazily on the first request for that path.
- Concurrent first requests for the same path share one preparation Promise.
- Index construction is owned by the Content View, not by an individual request AbortSignal. A disconnected first requester MUST NOT cancel shared preparation needed by other requests.
- A failed database open MUST NOT prevent healthy siblings from being opened or served.
- The per-path slot separates the open Promise from the Content-index preparation Promise.
- If openFsdb rejects before returning a handle, remove that slot so a later request can retry.
- Once a handle has been acquired, add it to ownedDatabases immediately. If index construction then fails, retain the slot's rejected prepared Promise and retain the handle for shutdown; do not open a replacement snapshot under the same view.
- If the acquired handle is STALE, retain that failed state for the lifetime of the view and do not silently reopen a new snapshot. A later request MUST NOT turn a stale snapshot into a different snapshot under the same view.
- Shutdown snapshots and awaits all still-pending slot.open Promises, then closes every handle in ownedDatabases after active read leases have drained.
- Closing the installation Content View stops new reads, waits for pending opens and active leases, then closes all successfully opened handles.
- Do not call listFsdbPaths() at Desktop Runtime startup; a known Content databasePath is resolved directly by Core.
- Do not create a database availability catalog or installation-wide failure state.

Desktop Content Service remains one service per prepared installation. It uses FSDB Core directly; it MUST NOT create one FSDB HTTP Server per database or call its own FSDB HTTP endpoint over loopback.

### 8.6 PWA: preserve database identity through bundle and storage

PWA remains browser-native in its storage and Content realization. Node-only @loomrealm/fsdb is not imported into the browser runtime.

The breaking Bundle shape is:

~~~ts
export interface PwaBundleContentEntryV2 {
  readonly databasePath: string;
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly mime: string;
  readonly body: Blob;
}

export interface PwaBundleExecutableEntryV2 {
  readonly logicalModule: string;
  readonly mime: "text/javascript" | "application/javascript";
  readonly body: Blob;
}

export interface PwaInstallationBundleV2 {
  readonly formatVersion: 2;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly content: readonly PwaBundleContentEntryV2[];
  readonly executables: readonly PwaBundleExecutableEntryV2[];
}
~~~

There is intentionally no databases catalog array in PwaInstallationBundleV2.

Build pipeline:

1. Call listFsdbPaths({ root }) against the source installation.
2. Process the returned canonical paths in deterministic order.
3. Open one database at a time with openFsdb({ root, path }).
4. Extract that database's records, groups, and resources.
5. Put the owning databasePath on every emitted content entry.
6. Close the database before moving to the next path.
7. Publish the completed Bundle only after all databases have been processed successfully.

An empty database emits no content entries. Because the Content API has no database catalog, its existence is not observable in PWA Runtime. This matches the chosen Content contract; it is not represented by a synthetic record or empty placeholder.

Installer requirements:

- Validate every databasePath using the shared canonical databasePath rules.
- Validate each content entry's kind, namespace, key, MIME, body, and structured content as before.
- Treat (databasePath, kind, namespace, key) as the complete logical content identity.
- Allow the same kind/namespace/key in different databases.
- Reject duplicates only when the full database-scoped identity is equal.
- Persist databasePath in every database-backed StoredContentIndexEntry.
- Keep manifest entries installation-level and without databasePath.
- Keep OPFS object storage content-addressed by bytes; do not use the content hash as a substitute for logical identity.
- Keep installation publication atomic. If any source database fails to open or package, the Bundle build fails and no incomplete Bundle is published.

Service Worker requirements:

- Parse the Content v2 route and databasePath using the same segment and delimiter rules.
- Match the full database-scoped identity.
- Keep manifest matching installation-level.
- Return the same logical Content response semantics as Desktop for a given installed Bundle.
- Do not synthesize or expose a database catalog.

PWA persistence migration:

- The Bundle format is version 2.
- The IndexedDB installation schema/version MUST be advanced for the new persisted Content Index shape.
- Existing v1 installations cannot be assigned a correct databasePath by guessing. They MUST be treated as requiring reinstall or explicit invalidation; they MUST NOT be silently served through v2 with an implicit default database.
- OPFS content objects may continue to be deduplicated by SHA-256 and cleaned using the existing installation ownership protocol.

### 8.7 Game Package and launcher boundary

GameEntryV1 remains unchanged in responsibility: it describes logical game topology / initial state. Launcher manifests remain responsible for executable bindings.

Neither contract selects one FSDB. No additional installation selection document is introduced. The installation Root is enumerated by the source packaging pipeline.

The Content API's databasePath is a read identity supplied by the Runtime caller, not a game-launch configuration field.

## 9. Versioning and migration policy

This is an intentional breaking migration. The old single-database APIs are not retained through overloads or fallback behavior.

### 9.1 FSDB Core

- openFsdb() now requires root + path.
- listFsdbPaths() is added.
- FsdbDatabase remains a one-database opaque handle.
- TableIdentity and FsdbObjectIdentity remain database-local.
- The physical FSDB layout gains nested database directories without a disk format-version marker.

### 9.2 FSDB HTTP

- The Root-scoped multi-database service is the v2 service and uses /fsdb/v2 routes.
- serveFsdb() accepts root rather than root + path.
- One service owns one Root and one Server.
- The frozen /fsdb/v1 handler route is not reinterpreted as a multi-database route.
- createFsdbHttpHandler(db), if retained, remains an explicitly single-handle embedding primitive and is not used by the Root-scoped service.
- The v2 package design and conformance contract must be documented separately from the frozen v1 behavior.

### 9.3 LoomRealm Content

- ContentClient methods change from positional namespace/key arguments to ContentObjectIdentity.
- Record/group/resource identities and routes include databasePath.
- The new wire contract uses /_lr/v2.
- Manifest remains installation-level.
- No v1 route is silently reinterpreted and no v1 compatibility endpoint is required for the new Runtime.

### 9.4 PWA Bundle and persistence

- PwaInstallationBundleV2 uses formatVersion 2.
- Stored database-backed Content Index entries require databasePath.
- IndexedDB schema/version advances.
- Existing v1 PWA installations require reinstall or explicit invalidation; no default database is inferred.

### 9.5 Unchanged contracts

- GameEntryV1 remains unchanged.
- Launcher manifests remain unchanged.
- FSDB table and object identity formats remain unchanged inside each database.
- FSDB on-disk format does not gain a version marker.
- No installation-level database-selection file is introduced.

## 10. Security, failure isolation, and lifecycle matrix

### 10.1 Path and URL security

- Core receives logical paths and never URL-decodes them.
- HTTP parsers split raw paths before decoding ordinary segments.
- Each segment is decoded exactly once and then validated.
- A decoded slash or backslash cannot create a new path segment.
- Database path resolution walks one [FSDB] child at a time.
- The Root is canonicalized once; all selected database components must remain beneath it.
- Descendant database directories and recognized FSDB objects cannot be symlinks or junctions.
- No client-controlled physical path is returned or used as an unchecked filesystem path.
- The prepared installation tree is assumed not to be concurrently mutated by an untrusted actor during discovery/open, as stated in 5.3.

### 10.2 Failure isolation

| Condition | Core | FSDB HTTP v2 | Desktop Content | PWA |
|---|---|---|---|---|
| Missing database path | Open fails | 404 | 404 / CONTENT_NOT_FOUND | 404 / CONTENT_NOT_FOUND |
| Missing content entry | null lease | 404 | 404 / CONTENT_NOT_FOUND | 404 / CONTENT_NOT_FOUND |
| Empty database | Opens successfully | Descriptor has no tables/entries | Content read returns not found | Emits no entries; reads return not found |
| Malformed selected database | That open fails | 422 | 422 / CONTENT_INVALID for that path; siblings remain usable | Whole Bundle build fails atomically |
| Duplicate physical candidates | Resolution/discovery fails | 409 | 409 / CONTENT_CONFLICT for that path; siblings remain usable | Bundle build fails if discovery is ambiguous |
| Database becomes stale after open | That handle becomes STALE | 503 for that path | 503 / CONTENT_UNAVAILABLE for that path | Installed immutable bytes are unaffected |
| Malformed sibling not selected | Does not affect direct open of valid DB | Does not affect requests to valid DB | Does not affect requests to valid DB | Whole source Bundle build fails because packaging includes all discovered DBs |

The PWA row is intentionally different at build time: a Bundle is one atomic installation artifact. This does not create a runtime dependency between databases or merge their identities.

### 10.3 Error and lifecycle rules

- Invalid URL/path syntax is a client error.
- Missing database or content is not found.
- Ambiguous physical resolution is a conflict, never an arbitrary selection.
- A stale database is unavailable; it is not transparently reopened.
- Filesystem paths and raw OS errors are not exposed to clients.
- A failure in one database MUST NOT mark the whole Desktop installation unavailable.
- A failure in one PWA source database prevents publication of the incomplete installation Bundle.
- Read leases are always closed, including abort and error paths.
- Server/view shutdown waits for admitted work and closes every owned handle exactly once.

Exact v2 HTTP status codes, problem payloads, headers, and conditional-request precedence are frozen in the corresponding v2 conformance contract before implementation is considered complete.

## 11. Implementation map and conformance gates

### 11.1 Core

| Hotspot | Required change |
|---|---|
| packages/fsdb/src/index.ts | Require root + path; export listFsdbPaths(); keep handle identities local |
| packages/fsdb/src/scanner.ts | Separate container Root resolution, selected database resolution, recursive discovery, and single-database scan |
| packages/fsdb/src/names.ts | Extract browser-safe canonical NameSegment/databasePath rules; no Node-only dependency in the shared subpath |
| packages/fsdb/test/fsdb.test.mjs | Add nested discovery, explicit path, duplicate marker, no-symlink, and independent lifecycle tests |

### 11.2 FSDB HTTP

| Hotspot | Required change |
|---|---|
| packages/fsdb-http/src/public.ts | Change serveFsdb() to Root-scoped v2 service; own the Server and lazy database cache |
| packages/fsdb-http/src/router.ts | Parse variable-depth databasePath using the literal $db delimiter |
| packages/fsdb-http/src/http.ts | Reuse existing read/ETag/stream semantics after selecting the database handle |
| packages/fsdb-http/DESIGN-v2.md | Freeze v2 route, status, cache, ownership, concurrency, and shutdown semantics |
| packages/fsdb-http/CONFORMANCE-v2.md | Test multi-root-database routing, nested paths, same local identities, and service shutdown |

The existing v1 design/conformance contract remains historical and is not silently rewritten to claim that v1 routes support multiple databases.

### 11.3 Runtime Content and Desktop

| Hotspot | Required change |
|---|---|
| packages/subsystem/src/content.ts | Add ContentObjectIdentity and object-shaped ContentClient methods |
| packages/subsystem/src/host/content-client.ts | Validate databasePath and construct Content v2 URLs |
| ContentClient call sites and demos | Migrate every record/group/resource call to explicit databasePath |
| apps/desktop/src/content-service.ts | Replace single db with lazy databasePath-keyed per-database views; keep one installation Content Server |
| apps/desktop/test/content-service.test.mjs | Test same local identity in different databases, lazy open, failure isolation, and close |

### 11.4 PWA

| Hotspot | Required change |
|---|---|
| apps/pwa source Bundle builder | Enumerate source database paths and package each database's entries with databasePath |
| apps/pwa/src/installation-bundle.ts | Introduce PwaInstallationBundleV2 and PwaBundleContentEntryV2 |
| apps/pwa/src/installer.ts | Validate databasePath and deduplicate by full logical identity |
| apps/pwa/src/installation-store.ts | Persist databasePath and advance IndexedDB schema/version |
| apps/pwa/src/service-worker-content.ts | Parse Content v2 routes and match database-scoped identities |
| PWA integration tests | Test identical local identities across databases, Bundle atomicity, and v1 reinstall behavior |

### 11.5 Normative documents

Before implementation is described as complete:

- Update fsdb-layout.md to define nested database nodes, marker casing, path grammar, and database independence.
- Publish FSDB HTTP v2 design and conformance documents; preserve the frozen v1 contract as v1 history.
- Publish Content API v2 as a new contract; do not silently rewrite v1 semantics.
- Document PWA Bundle v2 and IndexedDB migration behavior.
- Keep this document as the cross-layer architecture proposal and implementation map.

### 11.6 Required implementation gates

1. **Core gate:** deterministic recursive discovery and explicit path opening pass; opening a parent never scans a child; parent, child, and sibling snapshots/lifecycles remain independent.
2. **FSDB HTTP gate:** one Server serves multiple root and nested databases; same local identities in different databases resolve independently; no database catalog or per-database Server exists.
3. **Content API gate:** every database-backed read requires databasePath; Content v2 routes parse unambiguously; no namespace prefix trick or default fallback exists.
4. **Desktop gate:** one installation Content View lazily serves at least two databases with identical local identities; a broken database does not block healthy siblings.
5. **PWA gate:** Bundle, IndexedDB, and Service Worker preserve databasePath; duplicate detection is database-scoped; publication remains atomic.
6. **Parity gate:** for a shared fixture, Desktop and PWA return the same bytes, MIME, contentVersion, and logical identity for each database-backed Content request.
7. **Lifecycle gate:** all pending opens, active read leases, and owned handles are accounted for during close; stale handles are not silently replaced.
8. **Documentation gate:** FSDB layout, FSDB HTTP v2, Content API v2, and PWA Bundle v2 contracts agree with this architecture before release.

## 12. Design review: elegance and closure

### 12.1 Why the design is coherent

The design has one explicit identity boundary at each layer:

~~~text
Filesystem:
  canonical Root + databasePath
        |
        v
FSDB Core:
  one FsdbDatabase handle
  local TableIdentity / FsdbObjectIdentity
        |
        +------------------------------+
        |                              |
        v                              v
FSDB HTTP v2                    LoomRealm Content v2
one Root / one Server           one installation Content View
databasePath in route           databasePath in Content identity
        |                              |
        v                              +----------------------+
raw FSDB representation                |                      |
                                       v                      v
                                    Desktop                  PWA
                                Core + local index       Bundle + OPFS
                                lazy DB handles          DB-scoped Index
~~~

This is intentionally not one universal database manager. Core owns database resolution and one-database snapshots. The FSDB HTTP service owns its Root-scoped Server and lazy handles. Desktop Content owns its installation-scoped view and per-database indexes. PWA owns immutable installed objects and a database-scoped Content Index.

The boundaries are small and composable:

- Database discovery is separate from database opening.
- A database handle represents exactly one database.
- databasePath is added only at cross-database boundaries; it is not injected into FSDB-local identities.
- One HTTP Server routes to many databases without opening all databases at startup.
- Content API identity is explicit and independent of storage layout.
- Desktop and PWA share Content semantics without sharing storage implementation.
- Content-addressed storage deduplicates bytes without deduplicating logical identities.

### 12.2 Deliberate trade-offs

The following are explicit product/design constraints, not unresolved gaps:

1. **No Runtime enumeration.** A caller must know databasePath. Dynamic discovery is not part of ContentClient.
2. **Empty vs absent is not observable through Content.** Both return not found for a read. FSDB Core and FSDB HTTP can still open an empty database and return its Descriptor.
3. **PWA packaging is all-or-nothing.** A malformed source database prevents publication of the complete Bundle. Desktop can still serve healthy databases independently because it opens them lazily.
4. **Static snapshots do not auto-recover.** A STALE handle is not silently replaced by a newly opened snapshot.
5. **The source installation tree is trusted against concurrent hostile mutation during resolution.** Stronger descriptor-relative race protection is a separate platform-specific security requirement, not something path-string validation alone can promise.
6. **The FSDB HTTP Root service and Desktop Content Service are distinct servers/contracts.** The former exposes low-level FSDB data; the latter provides authorized Runtime Content. Desktop does not proxy through FSDB HTTP.

These constraints avoid a runtime catalog, a second selection manifest, availability bookkeeping, per-database servers, cross-database storage providers, and duplicated database lifecycle managers.

### 12.3 End-to-end closure checklist

A database-backed Content read has a complete path:

1. The caller supplies canonical databasePath, namespace, and key.
2. ContentClient validates the logical identity and builds a v2 URL with per-segment encoding.
3. The server parses raw path segments, recognizes the literal $db delimiter, decodes each ordinary segment once, and validates the canonical path.
4. Desktop resolves exactly that database through Core; PWA matches the same databasePath in its persisted Content Index.
5. The selected database's local kind/namespace/key identity is resolved without cross-database fallback.
6. The selected bytes are read or loaded, schema/MIME rules are applied, and contentVersion is verified.
7. The response uses the same logical identity and version semantics on Desktop and PWA.
8. Read leases, pending opens, and database handles are released through their owning service's close lifecycle.

No step requires a default database, a runtime database catalog, an installation selector, or a merged namespace.

### 12.4 Acceptance fixture

Use a shared fixture containing:

~~~text
Game/
├── [FSDB]GameData/
│   ├── [STRUCT]Config/
│   │   └── common.json
│   ├── [RESOURCE]NotADatabase/
│   │   └── [FSDB]Something/
│   │       └── ordinary.txt
│   ├── [FSDB]World/
│   │   └── [STRUCT]Config/
│   │       └── common.json
│   └── [FSDB]Character/
│       └── [STRUCT]Config/
│           └── common.json
├── [FSDB]ModData/
│   └── [STRUCT]Config/
│       └── common.json
└── [FSDB]Empty/
~~~

The fixture MUST prove:

- GameData, GameData/World, GameData/Character, ModData, and Empty are independent database paths.
- The same local namespace/key can exist in every database without collision.
- Empty opens in Core and has an empty Descriptor.
- Empty produces no PWA Content Index entries and reads return not found.
- [FSDB]Something below a RESOURCE table is not discovered as a database.
- One Root-scoped FSDB HTTP Server serves descriptors and entries from all non-empty databases.
- Desktop and PWA return the correct distinct bytes for each databasePath.
- A malformed selected database does not affect direct opening or Desktop reads from healthy siblings.
- PWA source Bundle publication fails atomically if any discovered database cannot be packaged.
- Closing each service closes every handle it owns and does not close handles owned by another service.

### 12.5 Final design rules

- An installation may contain multiple root-level FSDBs and recursively nested FSDBs.
- Every FSDB is a first-class, independently addressable database.
- Physical nesting is organizational containment only.
- listFsdbPaths({ root }) discovers paths for build/tooling; it does not open databases or create a Runtime catalog.
- openFsdb({ root, path }) opens exactly one database; path is required.
- One Root-scoped FSDB HTTP v2 service owns one Root and one Server and lazily opens databases by request path.
- The literal $db route segment separates databasePath from the local FSDB route.
- No per-database HTTP Server, default database, runtime database catalog, or availability map is introduced.
- Parent, child, and sibling databases own separate tables, schemas, records, resources, references, snapshots, validation, and lifecycle.
- References never cross database boundaries.
- Opening one database never scans or validates another database's contents.
- TableIdentity and FsdbObjectIdentity remain local and do not contain databasePath.
- LoomRealm Content v2 identity includes databasePath for every record/group/resource.
- Manifest remains installation-level.
- Desktop uses one installation Content View with lazy per-database handles and indexes.
- PWA preserves databasePath in Bundle entries and persisted Content Index entries.
- PWA may deduplicate physical bytes by content hash but MUST NOT merge logical identities.
- Empty databases are valid but are not enumerable through Runtime Content.
- Tables never contain databases; RESOURCE subdirectories remain resource paths.
- Readers accept ASCII case-insensitive type markers; writers emit uppercase markers.
- This is a breaking API/protocol migration; no old single-database fallback is retained.
- No FSDB on-disk format-version marker or installation-level database selector is introduced.

**Design review verdict:** the cross-layer architecture is coherent and closed at the identity, routing, ownership, failure-isolation, packaging, and lifecycle boundaries. The explicit trade-offs above are accepted. Implementation is not complete until every gate in 11.6 passes and the v2 wire/conformance contracts freeze the exact observable HTTP behavior.
