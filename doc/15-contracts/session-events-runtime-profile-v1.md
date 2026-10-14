# LoomRealm Session Events v1 Runtime Integration Profile

> 层级：正式契约 / Runtime Integration Profile  
> 状态：**Active / Normative / Frozen / Implemented / Not Qualified**
> Profile Version：1  
> 逻辑协议：[Session Events v1](./session-events-v1.md)  
> 相关：[Hostra Launcher Profile v1](./nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](./pwa-launcher-profile-v1.md)、[Session Events Conformance](./session-events-conformance-v1.md)  
> 最近复核：2026-10-14

本文冻结 Session Events v1 在当前 LoomRealm Runtime/Product 中的**实现接缝**。它不改变 Session Events 的 logical semantics，也不扩大 Main 的 application authority。

本 Profile 是 Hostra/PWA 既有冻结 profile 之上的**后续 additive capability profile**：历史 profile 中的 Control/State/Data/Content ABI 与 qualification evidence 不被重写；仅本文件明确列出的 Session Events seam 被新增。若旧 profile 的“当前 capability 枚举”未包含 Session Events，以本文件对 Session Events slice 的更具体规则为准；除此之外旧 profile 继续完整有效。

本 Profile 冻结的是 current product 所需的 physical placement / provisioning / lifecycle seam 与 cross-package observable behavior。它**不冻结** package-private factory/class/function 名称、内部文件布局、map/queue 数据结构、重连 scheduler/backoff 算法或其他不影响 observable semantics 的实现细节。

核心结论：

```text
logical contract
    still allows dedicated or multiplexed carrier

current Hostra/PWA v1 product realization
    MUST use a dedicated Session Events carrier per Runtime

future multiplex optimization
    MAY be introduced by a later physical profile
    MUST NOT change author-facing semantics
```

---

## 1. Current Physical Placement

当前 v1 implementation subject 固定：

```text
Hostra Desktop
    LoomRealm Desktop process
        Main
        RealmStateAuthority
        SessionEventHub
        RuntimeHosting

    Node Runner × N
        Runtime-scoped RealmStateClient
        Runtime-scoped SessionEventClient

PWA
    Session Worker
        Main
        RealmStateAuthority
        SessionEventHub
        RuntimeHosting

    Dedicated Subsystem Worker × N
        Runtime-scoped RealmStateClient
        Runtime-scoped SessionEventClient
```

这是 current product profile，不是 universal architecture requirement。SessionEventHub 未来 MAY 拆到独立 Process/Worker，或者 State/Events MAY multiplex 同一 carrier；只要 Session Events v1 logical observables 不变即可。

Main、Realm State、SessionEventHub 即使物理共置，也保持三个不同 logical roles：

```text
Main              = Control Authority
Realm State       = Shared Business State Authority
SessionEventHub   = transient routing/delivery mechanics only
```

---

## 2. Main Session-fatal Seam

`@loomrealm/main` MUST expose the following narrow platform capability：

```ts
export interface MainSessionEventsFatalSource {
  subscribe(listener: () => void): () => void;
}

export interface MainPlatform {
  // existing capabilities...
  readonly realmStateFatal?: MainRealmStateFatalSource;
  readonly sessionEventsFatal?: MainSessionEventsFatalSource;
}
```

Rules：

```text
MainSessionEventsFatalSource carries one infrastructure-fatal fact only
it carries no Event business payload, channel, type, subscription id or transport detail
SessionEventHub MUST self-terminal before the fatal fact is latched/reported
Main remains the only Session terminal / Runtime unwind authority
```

For a composition that installs Session Events v1, `sessionEventsFatal` MUST be supplied before `runMain()` starts。

The source is a **latched one-shot fact**：

```text
first Hub invariant-fatal
    → latch fatal
    → notify every currently subscribed Main listener at most once

subscribe after fatal already latched
    → listener MUST be scheduled asynchronously at most once
```

`subscribe()` MUST NOT invoke the listener synchronously in the caller stack。Returned unsubscribe MUST be idempotent。

Hub construction failure before READY is bootstrap failure and MUST NOT be reported through this live-Hub fatal source。

---

## 3. Required Runtime Capability Order

Session Events v1 logical contract requires every live Subsystem Runtime to own exactly one Runtime-scoped `SessionEventClient`。This Profile only freezes how the current products make that required logical capability usable before business code runs。

For every Runtime, business Definition import/initialization MUST NOT occur until：

```text
Session Event Hub READY
AND
Runtime-scoped SessionEventClient exists
AND
its required initial physical Event binding is usable
```

Canonical order：

```text
Platform PREPARE complete
→ Realm State READY
→ SessionEventHub READY
→ create Runtime physical container
→ establish required Runtime Event binding
→ create/attach Runtime-scoped SessionEventClient
→ import business Definition Module
→ runSubsystem(... scope.events ...)
```

Initial Event binding failure before business import is Runtime/bootstrap provisioning failure。After business Runtime begins, later Event binding loss follows Session Events v1 `BINDING_UNAVAILABLE` / `binding-terminal` semantics and does not by itself fail Runtime、Frame or Session。

---

## 4. Hostra / Node Runner Event Binding

Current Hostra v1 Session Events realization MUST use a **dedicated private WebSocket carrier per Runtime**。

It MUST NOT multiplex Events onto：

```text
Runtime Control WebSocket
Realm State WebSocket
Renderer Data
Content bearer
Hostra application RPC
```

### 4.1 Host-owned endpoint seam

The existing frozen M6 Control bootstrap envelope MUST NOT be expanded for Session Events。

Concrete Hostra composition MUST provide Event binding material through the dedicated host-owned environment value：

```text
LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT
```

This Profile **explicitly extends** the Hostra safe synthesized host-owned environment set by exactly this Session Events key。It does not authorize arbitrary new inherited environment variables and does not change historical M6 bootstrap semantics。

The value MUST be generated by RuntimeHosting and MUST NOT come from Game Entry、launch manifest、parent environment or business code。

Runner MUST：

```text
copy the value to a local variable
→ delete LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT from process.env
→ strict-validate endpoint
→ establish the required initial Event binding
→ only then import business Definition Module
```

Endpoint grammar for the current Hostra profile：

```text
scheme      = ws:
hostname    = 127.0.0.1
port        = explicit non-empty TCP port
username    = empty
password    = empty
query/hash  = empty
path        = '/' + 43 base64url characters
```

RuntimeHosting MUST create/listen the Events WebSocket endpoint before spawning the Runner。

The path capability MUST be generated from at least 256 bits of host-owned unpredictable material and MUST be independent from bootstrapToken、Runtime Control capability、Realm State capability and Content credentials。

### 4.2 Runtime identity / source

The Hostra parent side already knows the launch request `subsystemKey`。The Event server MUST bind that logical Runtime identity to the physical Event connection and derive `source.subsystemKey` from it。

The Runner MUST NOT transmit an authoritative business `source.subsystemKey` claim。

### 4.3 Binding replacement

Only one Event binding is current for one Runtime-scoped SessionEventClient at a time。

After the current binding terminals while Runtime remains live：

```text
old subscriptions → binding-terminal
client remains logically live
operations while unbound → BINDING_UNAVAILABLE
fresh physical connection MAY be attached to the same client
fresh subscribe required
no replay
```

The concrete Hostra composition MAY attempt background physical rebinding while the Runtime remains live。Automatic rebinding is **not required** by Session Events v1 or by this current physical profile。If implemented, reconnect timing/backoff remains private and MUST NOT queue/retry author operations、revive old subscriptions、replay events or create unbounded resources。

---

## 5. PWA / Worker Event Binding

Current PWA v1 realization MUST use a **dedicated private MessagePort per Runtime Event binding**。

The frozen `PwaRunnerBootstrapV1` closed schema MUST remain unchanged。In particular Session Events MUST NOT add a new field to that bootstrap envelope。

The existing `provisioningPort` remains provisioning-only；Session Event business requests/events MUST NOT travel on it。

### 5.1 Additive provisioning messages

This Profile **explicitly extends** the PWA Runner provisioning message set with exactly the following Session Events installation/result messages。This is an additive provisioning-control slice；it does not reopen `PwaRunnerBootstrapV1` and it does not permit Session Events business protocol frames on `provisioningPort`。

Session Worker → Runner：

```ts
interface PwaInstallSessionEventsV1 {
  readonly formatVersion: 1;
  readonly type: "session-events/install";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly bindingId: string;
  readonly port: MessagePort;
}
```

Runner → Session Worker：

```ts
interface PwaSessionEventsResultV1 {
  readonly formatVersion: 1;
  readonly type: "session-events/result";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly bindingId: string;
  readonly ok: boolean;
}
```

`requestId` and `bindingId` are platform-private currentness/correlation material and MUST NOT enter business events or `SessionEvent.source`。

The provisioning protocol MUST reject/fence：

```text
wrong subsystemKey
unknown/duplicate requestId
stale bindingId
late result from replaced binding
second concurrent current Event binding
non-MessagePort install payload
```

### 5.2 Initial installation barrier

For first Runtime startup：

```text
Session Worker creates MessageChannel
→ Hub serves port1 bound to subsystemKey
→ transfer port2 using session-events/install
→ Runner validates install
→ Runner creates/attaches Runtime-scoped SessionEventClient
→ Runner replies session-events/result(ok=true)
→ only then business Definition Module may be imported
```

Initial install reject、timeout、MessagePort transfer failure、provisioning loss or Hub failure before successful acknowledgement MUST fail Runtime/bootstrap provisioning before business import。

### 5.3 Replacement binding

After a live Event binding terminals, Session Worker MAY provision a fresh dedicated Event MessagePort through the same provisioning control seam while the Runtime remains live。

A replacement install attaches a fresh binding to the same logical SessionEventClient；it MUST NOT reactivate old subscriptions or replay missed events。

If the provisioning seam itself is unavailable, the logical Event client remains live-but-unbound and new author operations fail `BINDING_UNAVAILABLE` until a fresh binding can be installed or Runtime terminates。

The profile does not require automatic replacement scheduling；whether and when composition provisions a fresh binding is private product policy as long as logical fail-fast/fencing/recovery semantics remain unchanged。

### 5.4 Plane separation

PWA Session Worker ↔ Subsystem Worker current planes become：

```text
Runtime Control application carrier
Realm State private binding
Session Events private binding
Runner provisioning control
Renderer Data application carrier(s)
```

`provisioningPort` only transfers/acks capability installation。It MUST NOT carry `publish`、subscription delivery、business event payload or Session Events logical request/response frames。

---

## 6. Dedicated Carrier Is Current Profile, Not Universal Semantics

For current Hostra/PWA v1 qualification：

```text
Hostra Session Events = dedicated private WebSocket
PWA Session Events    = dedicated private MessagePort
```

Therefore current product qualification does **not** require a State+Events multiplexed physical carrier implementation。

The logical Session Events v1 contract continues to permit multiplexing。If a later profile introduces multiplexing, it MUST separately qualify：

```text
logical namespace/correlation isolation
independent flow control
independent evidence/failure interpretation
no public cross-plane ordering
no State starvation from Event/Diagnostics traffic
```

No business/author API change is allowed solely because the carrier becomes multiplexed。

---

## 7. Package / Dependency Boundary

Target package：

```text
@loomrealm/session-events
```

It owns：

```text
SessionEvent author types
SessionEventError / failure guards
validation / logical limits
SessionEventHub realization
Runtime-scoped replaceable SessionEventClient realization
binding generation fencing
carrier protocol
remote binding/server mechanics
MessagePort-capable realization needed by PWA
```

This Profile freezes those ownership roles and required behaviors, **not** package-private constructor/factory/type names used to realize them。

`@loomrealm/subsystem`：

```text
re-exports author-facing Session Events types required by its public author surface
SubsystemScope.events: SessionEventClient
@loomrealm/subsystem/host receives a required Runtime Event capability
business Definition never sees Hub/carrier/process material
```

`@loomrealm/main` only receives `MainSessionEventsFatalSource`；it does not receive channels、events、subscriptions or Event binding material。

`@loomrealm/platform-ports` does not need a universal Session Events transport port for v1；concrete RuntimeHosting/composition owns Hostra/PWA physical binding realization just as executable placement remains concrete-platform work。

---

## 8. Cleanup / Lifetime

Runtime termination ordering MUST ensure：

```text
stop admitting/replace Event client binding
→ SessionEventClient terminal(client-terminal semantics for its subscriptions)
→ retire physical Event carrier/server attachment
→ continue existing Runtime physical convergence
```

Session termination / product close MUST：

```text
SessionEventHub terminal
→ subscriptions hub-terminal while observable
→ stop Event admission
→ retire all Runtime Event carrier endpoints/ports
→ continue Main-owned Session/Runtime cleanup
```

Physical Event binding loss alone MUST NOT call `requestTermination()` or synthesize Main Runtime failure。

---

## 9. Current Profile Qualification

In addition to Session Events v1 conformance, the current physical profile MUST prove：

```text
Main fatal seam
- Hub self-terminal precedes latched sessionEventsFatal report
- pre-READY Hub failure is bootstrap failure, not live fatal callback
- fatal callback causes Main-owned Session terminal/unwind

Hostra
- dedicated Events WS is distinct from Control/State/Data/Content
- endpoint is loopback + capability path and scrubbed before business import
- source identity derives from bound launch subsystemKey
- required initial binding exists before Definition import
- binding loss does not fail Runtime by itself
- fresh binding can be deliberately attached without old subscription revival/replay

PWA
- PwaRunnerBootstrapV1 remains closed and unchanged
- dedicated Events MessagePort is installed through provisioning control
- Event payload never traverses provisioningPort
- install ack precedes business Definition import
- stale/wrong binding install/result is fenced
- fresh replacement binding does not revive subscriptions/replay history
```

Qualification MUST prove replacement capability and fencing；it MUST NOT require a particular automatic reconnect scheduler/backoff policy。

---

## 10. Final Invariants

1. Current Hostra/PWA v1 use dedicated Session Events carriers；
2. logical contract still permits future multiplexing without author API change；
3. Hostra does not expand the frozen M6 Control bootstrap for Events；
4. PWA does not expand the frozen `PwaRunnerBootstrapV1` for Events；
5. initial Event binding is required before business Definition import；
6. later Event binding loss is Event-local and does not itself fail Runtime/Session；fresh replacement is supported but automatic reconnect policy is not normative；
7. source identity is derived from the bound logical Runtime, never publisher payload；
8. `sessionEventsFatal` is a narrow latched fact into Main, not a second control authority；
9. Event business traffic never uses Runner provisioning control；
10. Main、State、Events physical co-location does not merge authority or ordering；
11. internal factory/class/file naming remains implementation detail unless separately promoted into a public Contract。
