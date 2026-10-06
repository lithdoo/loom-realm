# `@loomrealm/game-launcher-pwa` 设计

> 状态：Implementation Boundary Frozen；仅已实现 Realm State projection，完整 M16/M17 尚未交付  
> 最近复核：2026-10-07  
> 正式契约：[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../doc/15-contracts/pwa-launcher-profile-v1.md)  
> 产品组合：[PWA 产品组合设计](../../doc/20-modules/pwa-host/DESIGN.md)  
> 消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../doc/decisions/0026-session-scoped-platform-instance.md)

核心原则：

> **本包只负责 PwaPlatform 内部的 Game PREPARE / PwaLaunchPlan / Worker Runner integration primitives；它不是 PWA 产品、installer、Service Worker、Renderer host 或 Session owner。**

如本页与正式 PWA Profile 冲突，以正式 Profile 为准。

---

## 1. Package Position

```text
apps/pwa Session Worker
        ↓
session-scoped PwaPlatform.prepareGame({ installationId })
        ↓
@loomrealm/game-launcher-pwa
    ├── read published installation facts
    ├── @loomrealm/game-package parse/validate
    ├── launch.pwa.json parse/validate
    ├── exact Game ↔ PWA key-set join
    ├── Executable Index resolution/preflight
    ├── freeze PwaLaunchPlan
    ├── project LogicalGameBootstrap
    └── project PreparedRealmStateDefinition
        ↓
PreparedPwaGame
        ↓
PwaPlatform installs frozen plan
        ↓
Main sees only logical bootstrap + platform ports
```

Dependencies MAY include existing logical/runtime host packages such as：

```text
@loomrealm/game-package
@loomrealm/realm-state
@loomrealm/subsystem/host
@loomrealm/foundation
@loomrealm/transport-messageport
```

MUST NOT be depended on by `@loomrealm/main` or business game packages。

---

## 2. Owned Surface

本包 owns：

```text
PwaLaunchManifestV1 schema/parser
PWA executable logical module validation
published-installation Launcher reader integration
exact subsystem key-set join
Executable Index resolver/preflight
immutable PwaLaunchPlan
LogicalGameBootstrap projection
PreparedRealmStateDefinition projection
plan lookup helpers for concrete RuntimeHosting
Worker Runner bootstrap validation helpers
Runner executable import/ABI validation integration
Runner provisioning helpers
```

本包 does NOT own：

```text
external bundle/file/ZIP/network acquisition
PWA installation writes / staging / publish / uninstall / GC
Service Worker registration/update/routes
Browser Window lifecycle
Main authority
RealmStateAuthority lifecycle ownership
Renderer host
DataAuthority generation/profile
full DataConnectionBroker policy
Content semantics
```

---

## 3. Product-facing Prepare Shape

PwaPlatform is the product-facing consumer。Canonical request is frozen：

```ts
interface PwaPrepareGameRequestV1 {
  readonly installationId: string;
}
```

Conceptual internal API：

```ts
interface PreparedPwaGame {
  readonly logicalBootstrap: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
  readonly launchPlan: PwaLaunchPlan;
}

async function preparePwaGame(
  request: PwaPrepareGameRequestV1,
  dependencies: PwaPrepareDependencies,
): Promise<PreparedPwaGame>;
```

`PwaPrepareDependencies` is a concrete PwaPlatform-internal capability set for reading the selected published installation and Host policy；it is not a universal `GameSource` abstraction。

Product caller MUST NOT pass `ValidatedGameEntryV1`。

Launcher MUST internally obtain Game Entry and invoke `@loomrealm/game-package`。

---

## 4. Published Installation Reader Boundary

Launcher reads only already-published installation facts：

```text
installation state/generation
Game Entry text/value
launch.pwa.json text/value
Executable Index
selected executable integrity/MIME/currentness facts
```

Launcher MUST NOT：

```text
write OPFS
publish installation
request storage persistence
uninstall/GC objects
accept raw ZIP/File/network package
```

Those belong to `apps/pwa` installer/storage composition。

---

## 5. Manifest

```ts
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

`module` is an installation-local executable logical path following the exact syntax and graph rules in the formal PWA Profile。

Game/manifest cannot configure：

```text
Worker Runner entry/options
Service Worker
CSP
absolute/external executable URL
MessagePorts
storage path
credentials
```

---

## 6. PREPARE

```text
open complete/current installation
→ obtain Game Entry
→ validate Game Package
→ project PreparedRealmStateDefinition
→ obtain + validate launch.pwa.json
→ exact key-set join
→ validate every selected logical module
→ validate required relative ESM graph through Executable Index
→ validate same-origin/private executable realization capability
→ freeze PwaLaunchPlan
→ freeze LogicalGameBootstrap
→ return PreparedPwaGame
```

PREPARE failure guarantees：

```text
zero business Subsystem Worker
zero business Definition Module import
zero Runtime Control application connection
```

---

## 7. `LogicalGameBootstrap`

Main-facing projection contains only：

```text
subsystemKeys
initial { subsystemKey, input }
```

MUST NOT contain：

```text
GameEntry document brand/formatVersion
Realm State records
installationId
PwaLaunchPlan
logicalModule/moduleUrl
Worker/Port/Service Worker material
```

---

## 8. `PwaLaunchPlan`

`PwaLaunchPlan` is Host-private、immutable and session-scoped。

For each subsystem it binds at least：

```text
subsystemKey
installationId / installation generation
logicalModule
private executable identity material
```

It MAY contain other Host-private validated facts required by concrete RuntimeHosting, but MUST NOT contain business mutable state。

Main never receives it。

---

## 9. RuntimeHosting Integration

Concrete `RuntimeHosting` lives in `apps/pwa` / PwaPlatform composition, not in Main and not as a second long-lived launcher object。

Main-facing launch remains：

```text
RuntimeHosting.launch({ subsystemKey, bootstrapToken }, signal)
```

Concrete PWA hosting：

```text
lookup frozen PwaLaunchPlan
→ construct Runtime/State/provisioning MessageChannels
→ create Host-owned generic Worker Runner
→ send frozen PwaRunnerBootstrapV1
→ expose HostedRuntime
```

The canonical `PwaRunnerBootstrapV1` schema is owned normatively by the formal PWA Profile；this package MAY provide its parser/validator/build helper。

---

## 10. Worker Runner

Host-owned Runner is the Dedicated Worker constructor entry。

Runner sequence：

```text
validate PwaRunnerBootstrapV1
→ verify expected Service Worker generation via runtime-info
→ construct RuntimeControlBinding
→ construct Runtime-scoped RealmStateClient
→ construct SubsystemDataBinding from provisioning port
→ construct same-origin PWA ContentClient
→ resolve/import exact planned business module
→ validate default SubsystemDefinitionFactory
→ runSubsystem(...)
```

Business module MUST NOT search for bootstrap material through global variables or own the Worker entry。

---

## 11. Executable Graph

This package MUST enforce the v1 graph rule during PREPARE：

```text
install-time enumerable
relative static ESM specifiers only
resolved dependency stays inside current installation
all modules present in Executable Index
```

Reject：

```text
bare package imports
absolute/external imports
blob:/data: imports
non-enumerable dynamic imports
runtime import-map/npm resolution dependency
```

Do not add an import-map manager、npm resolver or package registry to this package。

---

## 12. Provisioning Integration

Runner provisioning remains distinct from application planes。

This package MAY provide parsing/build helpers for formal：

```text
PwaInstallSubsystemDataV1
PwaRevokeSubsystemDataV1
```

It MUST NOT mint Data generation/profile and MUST NOT interpret Data transfer failure as Runtime/Frame failure。

---

## 13. Content Boundary

This package may cause Runner construction of a PWA same-origin `ContentClient`, but it does not own Content API semantics or Service Worker Content implementation。

Business API stays：

```text
scope.content.record(...)
scope.content.resource(...)
```

PWA MUST NOT distribute Desktop bearer tokens merely to reuse a concrete Desktop Content binding。

---

## 14. Error Domains

At minimum keep distinguishable：

```text
Game Package validation
PWA manifest/join
installation incomplete/invalid
executable syntax/graph/resolution/integrity
Service Worker generation mismatch
Worker bootstrap validation
Worker creation/supervision
module load/ABI
Runtime Control bootstrap
platform provisioning
```

Do not collapse Game Package validation into generic module failure。

---

## 15. Tests Owned by This Package

Package/unit tests should cover：

```text
product request uses installationId, not ValidatedGameEntry input
manifest closed schema
exact key-set join
module syntax validation
relative graph enumeration
bare/absolute/external/dynamic import rejection
all selected executable entries resolve before Worker side effect
PwaLaunchPlan immutable/private
logicalBootstrap excludes physical facts
PreparedRealmStateDefinition projection
PwaRunnerBootstrapV1 closed-schema validation
planned module selected exactly
Definition default export ABI validation
provisioning schema/currentness validation
```

Real Service Worker、nested Worker、Renderer、storage、BFCache and cross-platform E2E belong to `apps/pwa` M16/M17 qualification rather than package-only unit tests。

---

## 16. Package Boundary Guard

MUST NOT expand into：

```text
PWA product mega-package
PWA installer/storage owner
PWA Renderer host
PWA DataAuthority owner
Service Worker framework
all-platform launcher registry
universal GameSource
TransportRegistry
runtime package manager/import-map manager
```

Complete product remains `apps/pwa` composition root。

---

## 17. Final Invariants

1. product caller addresses one published `installationId`；
2. Launcher internally consumes Game Package；
3. Game/PWA subsystem key sets join exactly；
4. all executable syntax/graph resolution closes before business Worker side effect；
5. prepared result contains frozen logical bootstrap、state projection and private plan；
6. Main never sees installation/module/Worker/Port facts；
7. concrete RuntimeHosting consumes the frozen plan；
8. Worker Runner is Host-owned constructor entry；
9. Runner bootstrap schema comes from the formal PWA Profile；
10. Runner constructs same-origin PWA ContentClient, not Desktop bearer distribution；
11. provisioning stays distinct from application protocols；
12. this package does not own installer、Renderer、Content service、Main or Realm State authority。
