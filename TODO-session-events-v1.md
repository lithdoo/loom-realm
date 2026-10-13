# Session Events v1 implementation handoff

> 状态：Active handoff / contract frozen / implementation not started / qualification not started  
> Normative inputs：[Session Events v1](./doc/15-contracts/session-events-v1.md)、[Runtime Integration Profile v1](./doc/15-contracts/session-events-runtime-profile-v1.md)、[Conformance](./doc/15-contracts/session-events-conformance-v1.md)

本文只用于当前实现交接。实现完成并进入 Current module docs 后应删除本文件；规范事实仍由 `doc/15-contracts` 与 `doc/10-architecture` 拥有。

本文**不是新的 Contract**。它可以给出推荐实现形状，但不得把 package-private 命名、文件布局、测试脚本名称、workflow 文件名或 reconnect scheduler 误升级成公共 ABI。

## 1. Agent mandate

Agent MUST implement and qualify the frozen design。Agent MUST NOT redesign：

```text
required Runtime scope.events capability
channel/type author API
routing/filter semantics
subscription lifecycle
publish evidence
failure codes / SessionEventError surface
limits
Main fatal ownership
Hostra/PWA physical Event binding profile
State/Event atomicity or ordering
```

Agent MAY choose：

```text
package-private factory/class/type names
internal file layout
map/index/queue structures
private wire frame representation
private request/subscription/binding identifiers
reconnect scheduler/backoff or no automatic reconnect
root npm script names
CI workflow filename/matrix layout
```

provided the normative contracts、repository testing policy and current physical profile are preserved。

发现真正的 observable semantic / public ABI / frozen physical-seam 缺失时必须停止在该点并修 Contract/Profile；不得用 platform-specific behavior 静默补洞。

## 2. Executable subject

Implementation/qualification subject MUST cover the affected behavior owners，至少包括：

```text
@loomrealm/session-events implementation
@loomrealm/subsystem author + host integration
@loomrealm/main fatal integration
Hostra Runner/RuntimeHosting + Desktop composition
PWA Runner/RuntimeHosting + Session Worker composition
Session Events v1 qualification tests
root build/test/qualification integration
CI coverage for the exact subject
```

Current repository locations are expected to include `packages/session-events`、`packages/subsystem`、`packages/main`、`packages/game-launcher-hostra`、`apps/desktop`、`apps/pwa` and a Session Events qualification test area；exact test/workflow filenames are implementation organization, not protocol ABI。

`packages/game-package`、Game Entry、Hostra/PWA launch manifests MUST NOT gain Session Event channel registry/history/configuration。

## 3. Target package boundary

Create package：

```text
@loomrealm/session-events
```

Its **public author-facing exports** MUST include the Contract-defined：

```text
SessionEvent
SessionEventClient
SessionEventListener
SessionEventSubscription
SessionEventSubscriptionClose / reason
SessionEventFailure / SessionEventFailureCode
SessionEventError
isSessionEventFailure
```

The package MUST own realization roles for：

```text
logical limits/validation
one Session-scoped SessionEventHub
trusted in-process Runtime binding
one Runtime-scoped replaceable SessionEventClient
binding generation/currentness fencing
remote client binding
remote Hub-side serving binding
publish dispatched-vs-result evidence
MessageCarrier-compatible remote protocol
PWA MessagePort carrier adaptation
```

Those **roles and behaviors are required**；their package-private symbol names are not frozen by this handoff。Following existing Realm State naming conventions is recommended where it improves consistency, but consistency does not create a new public contract。

A conforming physical binding must expose behavior equivalent to：

```text
publish request
    local dispatch evidence separate from definitive Hub result

subscribe request
    definitive establishment result

binding terminal observation
    fences old results/events/subscriptions

close
    retires the physical binding
```

The implementation needs enough dispatch evidence to map：

```text
not dispatched + binding loss → BINDING_UNAVAILABLE
already dispatched + definitive publish result lost → OUTCOME_UNKNOWN
```

Exact internal TypeScript interface/class/function names remain implementation freedom。

## 4. Subsystem integration

`@loomrealm/subsystem` public author surface MUST expose：

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}
```

`scope.events` is required for every successfully bootstrapped live business Runtime；it is not optional feature detection。

The author package MUST make the Contract-defined author-facing Session Events types/error classification available in the normal `@loomrealm/subsystem` dependency direction so business Definition source need not import host/platform internals。

`@loomrealm/subsystem/host` MUST receive a required Runtime Event capability that provides：

```text
one Runtime-scoped SessionEventClient
Runtime-terminal convergence for that client/subscriptions
```

The exact package-private capability type/name is implementation freedom。

Business Definition import/initialization MUST occur only after required State + Event initial capabilities are usable。Runtime termination MUST terminal the Event client and must not leave live listener delivery lanes。

## 5. Main integration

Add and export the frozen public platform seam：

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

Current frozen v1 target：

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

Required behavior：

```text
RuntimeHosting listener ready before Runner spawn
strict endpoint capability validation
Runner copies + scrubs env before business import
required initial Event binding before Definition import
source.subsystemKey bound from launch request/runtime identity
post-start binding loss Event-local only
fresh physical binding can attach to same logical client
old subscriptions stay terminal / no replay / generation fencing
```

Hostra MAY attempt automatic background physical rebinding, but this is not required。If implemented it MUST NOT queue/retry author operations、revive subscriptions、replay events or create unbounded resources。

A launcher-local WebSocket carrier adapter analogous to Realm State is a reasonable implementation choice；its exact symbol name is private。

Do not add Events fields to the historical M6 Control bootstrap semantic envelope merely for convenience。

## 7. PWA implementation

Current frozen v1 target：

```text
Session Worker
    SessionEventHub

per Runtime
    dedicated Events MessagePort
```

`PwaRunnerBootstrapV1` MUST remain closed and unchanged。

Extend the existing Runner provisioning control with the frozen physical messages from the Runtime Integration Profile：

```text
session-events/install
session-events/result
```

The transferred MessagePort carries all Session Events logical traffic。The provisioning port carries only installation/result control and MUST NOT carry business Event payloads。

Initial Event install acknowledgement MUST complete before Definition import。A fresh replacement binding may later be provisioned to the same logical client；old subscriptions remain terminal and there is no replay。

Automatic replacement scheduling is not required；the implementation must only preserve the capability to install a fresh binding correctly when composition chooses to do so。

## 8. Qualification tests

Qualification MUST execute all assertions in `session-events-conformance-v1.md`, including real physical boundaries for：

```text
required scope.events capability/bootstrap barrier
Hostra child process + WebSocket Event carrier
PWA Dedicated Worker + MessagePort Event carrier
Main fatal ownership
pre-resolve subscription terminal races
SessionEventError structural classification
OUTCOME_UNKNOWN / no automatic retry
binding replacement fencing
serial async listener lanes
overflow bounds
payload isolation/source authenticity
```

Tests SHOULD be split by the nearest behavior owner where useful：validation、Hub/routing、client/binding、carrier、overflow、Subsystem/Main integration and platform adapters。

A path such as：

```text
test/session-events-v1/
```

is recommended for current repository consistency, but the exact filename/layout is not normative。Qualification validity comes from exact subject + coverage + evidence, not a filename。

## 9. Root gates

The Agent MUST add discoverable root-level gates that provide these functions：

```text
build affected Session Events stack
test package + integration behavior
run qualification against already-built exact subject
build + run full Session Events qualification
```

Recommended names for consistency：

```text
build:session-events-stack
test:session-events
test:session-events:qualification:run
test:session-events:qualification
```

These names are implementation/CI interface recommendations, **not Session Events protocol invariants**。Equivalent repository-consistent names are acceptable if documentation/CI use one canonical source of truth。

The Agent MUST also run applicable existing regression/desktop/PWA/docs gates according to `doc/30-development/testing.md` and qualification staleness rules。

## 10. CI

CI MUST execute the frozen package/integration/qualification subject on repository-supported environments and include platform-appropriate Hostra/PWA coverage。

A dedicated workflow such as：

```text
.github/workflows/session-events.yml
```

is recommended, not contractually required。Exact workflow filename and matrix layout SHOULD follow current repository CI policy；coverage/evidence is normative, filename is not。

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
architecture/public-contract decision required by implementation Agent = 0
frozen physical-profile decision required by Agent = 0
internal naming/structure remains implementation freedom
contract tests pass
Hostra product profile passes
PWA product profile passes
existing affected regressions pass
docs links/build pass
implementation status = Implemented
qualification status = Qualified only with exact current evidence
```
