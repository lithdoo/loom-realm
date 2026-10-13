# Session Events v1 implementation handoff

> 状态：Active handoff / contract frozen / implementation not started / qualification not started  
> Normative inputs：[Session Events v1](./doc/15-contracts/session-events-v1.md)、[Runtime Integration Profile v1](./doc/15-contracts/session-events-runtime-profile-v1.md)、[Conformance](./doc/15-contracts/session-events-conformance-v1.md)

本文只用于当前实现交接。实现完成并进入 Current module docs 后应删除本文件；规范事实仍由 `doc/15-contracts` 与 `doc/10-architecture` 拥有。

## 1. Agent mandate

Agent MUST implement and qualify the frozen design。Agent MUST NOT redesign：

```text
channel/type author API
routing/filter semantics
subscription lifecycle
publish evidence
failure codes
limits
Main fatal ownership
Hostra/PWA physical Event binding profile
State/Event atomicity or ordering
```

发现规范缺失时必须停止在该点并修 contract；不得用 platform-specific behavior 静默补洞。

## 2. Executable subject

Implementation subject MUST include：

```text
packages/session-events
packages/subsystem
packages/main
packages/game-launcher-hostra
apps/desktop
apps/pwa
test/session-events-v1
package.json
.github/workflows/session-events.yml
```

`packages/game-package`、Game Entry、Hostra/PWA launch manifests MUST NOT gain Session Event channel registry/history/configuration。

## 3. Target package surface

Create：

```text
packages/session-events
```

Package name：

```text
@loomrealm/session-events
```

The package MUST own：

```text
SessionEvent / SessionEventClient / SessionEventSubscription public types
SessionEventError + isSessionEventFailure
validation and exact logical limits
SessionEventHub
replaceable Runtime-scoped SessionEventClient
binding generation fencing
remote carrier protocol/server/client binding
MessagePort-capable realization needed by PWA
```

Internal file layout is implementation freedom；public observable semantics are not。

## 4. Subsystem integration

`@loomrealm/subsystem` MUST：

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}
```

Author package SHOULD re-export Session Events author types from `@loomrealm/session-events` in the same style it currently re-exports `RealmStateClient`。

`@loomrealm/subsystem/host` MUST require a Runtime Event capability alongside the required State capability。Business Definition import/initialization must occur only after both required initial capabilities are usable。

Runtime termination MUST terminal the logical Event client and must not leave live listener delivery lanes。

## 5. Main integration

Add and export：

```ts
interface MainSessionEventsFatalSource {
  subscribe(listener: () => void): () => void;
}
```

Add to `MainPlatform`：

```ts
readonly sessionEventsFatal?: MainSessionEventsFatalSource;
```

Concrete products implementing Session Events MUST supply it before `runMain()`。

Main MUST treat the first Event Hub fatal fact like another Session-fatal infrastructure input：Main alone commits Session terminal/unwind。Main MUST NOT inspect Event channels/types/payloads/subscriptions。

## 6. Hostra implementation

Current v1 target：

```text
LoomRealm Desktop process
    SessionEventHub

per Runtime
    dedicated private loopback Events WebSocket
    independent from Runtime Control and Realm State WS
```

Use the frozen host-owned environment seam：

```text
LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT
```

Required implementation points：

```text
RuntimeHosting listener ready before Runner spawn
strict endpoint capability validation
Runner copies + scrubs env before business import
required initial Event binding before Definition import
source.subsystemKey bound from launch request/runtime identity
post-start binding loss Event-local only
replaceable client fencing / fresh subscribe / no replay
```

Do not add Events fields to the historical M6 Control bootstrap semantic envelope merely for convenience。

## 7. PWA implementation

Current v1 target：

```text
Session Worker
    SessionEventHub

per Runtime
    dedicated Events MessagePort
```

`PwaRunnerBootstrapV1` MUST remain closed and unchanged。

Extend the existing Runner provisioning control with the frozen messages from the Runtime Integration Profile：

```text
session-events/install
session-events/result
```

The transferred MessagePort carries all Session Events logical traffic。The provisioning port carries only installation/result control and MUST NOT carry business Event payloads。

Initial Event install acknowledgement MUST complete before Definition import。Replacement binding may be provisioned later to the same logical client；old subscriptions remain terminal and there is no replay。

## 8. Qualification tests

Create：

```text
test/session-events-v1/qualification.test.mjs
```

Package tests SHOULD be split by behavior where useful, including validation、Hub/routing、client/binding、carrier、overflow and platform adapters。

Qualification MUST execute all assertions in `session-events-conformance-v1.md`, including real physical boundaries for：

```text
Hostra child process + WebSocket Event carrier
PWA Dedicated Worker + MessagePort Event carrier
Main fatal ownership
pre-resolve subscription terminal races
OUTCOME_UNKNOWN / no automatic retry
binding replacement fencing
serial async listener lanes
overflow bounds
payload isolation/source authenticity
```

## 9. Canonical root gates to add

Root `package.json` MUST add canonical commands with these names：

```text
build:session-events-stack
test:session-events
test:session-events:qualification:run
test:session-events:qualification
```

Expected intent：

```text
build:session-events-stack
    build @loomrealm/session-events + all directly affected framework/product subjects

test:session-events
    package + integration tests for the implementation subject

test:session-events:qualification:run
    execute frozen Session Events v1 qualification assertions against already-built subject

test:session-events:qualification
    build stack + run qualification
```

The Agent MUST also run applicable existing regression/desktop/PWA/docs gates according to `doc/30-development/testing.md` and qualification staleness rules。

## 10. CI

Create：

```text
.github/workflows/session-events.yml
```

It MUST run the frozen package/qualification subject on repository-supported Node environments and include platform-appropriate coverage for Hostra and PWA。Exact matrix should follow current repository CI policy rather than copy historical Realm State evidence blindly。

## 11. Documentation completion

Only after implementation exists：

```text
add Session Events to doc/20-modules current implementation navigation
mark implementation status accurately
record exact qualification subject/evidence under the repository's current qualification rules
remove this temporary handoff file
```

Do not mark Qualified before same-subject executable evidence exists。

## 12. Exit condition

The handoff is complete only when：

```text
architecture decision required by implementation Agent = 0
contract tests pass
Hostra product profile passes
PWA product profile passes
existing affected regressions pass
docs links/build pass
implementation status = Implemented
qualification status = Qualified only with exact current evidence
```
