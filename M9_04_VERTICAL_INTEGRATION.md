# M9 / 04 — Desktop Data Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md)  
> 冻结决策：[ADR 0028](doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用 production Main authority sink + real Hostra Node Runner provisioning IPC + real two-sided Data WebSocket relay跑通现有 M8 role-facing seam；Renderer hosting保持 deterministic/test，不提前进入 M14 BrowserWindow。

> **M9 vertical新增的是 authority→Broker→IPC/WS physical closure；M8 role code与 Frozen protocol mechanics不重写，M10/M11 child business baseline不提前声明。**

---

## 1. Workspace / Placement

M9 is the first real consumer that requires the Desktop composition root。

Repository adds：

```text
apps/desktop/
    private Desktop composition workspace
    owns DataConnectionBroker / Renderer-side Data binding realization
    owns M9 deterministic Renderer physical host fixture/composition
```

Root npm workspace list expands from：

```text
packages/*
```

into：

```text
packages/*
apps/*
```

Do not create PWA/CLI code solely for symmetry。`apps/desktop` at M9 is not yet the full Electron/BrowserWindow product entry；M14 completes that composition。

---

## 2. Production Vertical Shape

```text
Hostra PREPARE
→ real Main Session
→ real Node Runner / Runtime Control WS
→ real Subsystem host ready
→ Main committed DataAuthority(S,1,P)

real Renderer Control production peers
→ deterministic/test physical Renderer candidate
→ Main accepts exact Renderer token T
→ DataConnectionAuthoritySink.replace({T, S/1/P, HostedRuntime})
→ Desktop Broker

createHostraRuntimeHosting(... onRuntimeDataProvisioner)
→ private WeakMap<HostedRuntime, HostraRuntimeDataProvisioner>

Desktop Broker
→ Renderer candidate WS
→ Runner candidate WS via provisioner.prepare
→ paired prepared
→ commit-time Main-view revalidation
→ sole-current install
→ Renderer delivery + Runner post-install commit notification
→ M8 RendererDataBinding / SubsystemDataBinding
→ real RendererDataPeer / SubsystemDataPeer
```

`P = loomrealm.renderer-data/1`。

Hostra physical RendererControlBinding WebSocket + BrowserWindow remain M14。

---

## 3. Test Renderer Boundary

M9 deterministic Renderer host MUST still use production：

```text
@loomrealm/renderer-control peers
@loomrealm/renderer holder
RendererDataBinding public acquire surface
@loomrealm/data RendererDataPeer
```

Only the **physical Renderer hosting/bootstrap** is test/deterministic。

The Platform candidate that physically received Main-issued Renderer Control token T owns the matching Renderer-side Data delivery cells。It cannot self-declare current；only current `DataConnectionAuthorityView.rendererControlToken == T` makes its candidates installable。

---

## 4. Initial Authority / Install Trace

Must prove：

```text
Session start → sink.replace(null)
Runtime not ready → no S entry
Runtime ready commit → logical Main S/1/P exists
no current Renderer → sink still null
Renderer accepted → sink non-null names exact T + exact HostedRuntime + S/1/P
published view/entries cannot mutate after replace
Broker prepares both WS sides
Runner prepare ACK
commit-time latest-view revalidation
sole-current installation
Bindings resolve current-deliverable carriers
real Data peers install
```

Sink updates do not change `rendererRevision` by themselves。

---

## 5. Authority Invalidations

Production vertical covers：

```text
candidate preparing
→ Main removes S/1/P
→ sink full replace
→ late physical prepare success
→ candidate cannot install
```

Renderer replacement：

```text
A current token T1
→ Main accepts B token T2
→ same Main mutation replaces sink T1→T2
→ A pending/current Data loses install/current status
→ late A work cannot affect B
```

Current Renderer terminal with no replacement：

```text
sink.replace(null)
→ all Data current/pending retire/invalidate
```

Exact HostedRuntime replacement is driven only in Broker contract harness；production M9 does not invent same-key Runtime restart。

---

## 6. Sink Contract Evidence

Focused Main/Platform tests MUST prove：

```text
dataConnections absent keeps M1–M8 behavior
provided sink receives initial null
replace is synchronous/non-blocking/non-throwing
full view entries are exact/unique/deterministic
published view and entries array are detached immutable snapshots
HostedRuntime is preserved by exact reference identity
current Renderer auth-consumed token retained only while current
live retained token participates in duplicate opaque-material defense
Runtime/DataAuthority mutation refreshes the full view
Session terminal null occurs before async physical cleanup
sink operation alone never bumps Renderer revision
```

No test EventBus or public authority registry is allowed as production architecture evidence。

---

## 7. Runner Handoff / Provisioning Cases

Must prove：

```text
onRuntimeDataProvisioner fires before RuntimeHosting.launch resolves exact HostedRuntime
Desktop exact-map uses that HostedRuntime object
Data endpoint absent from Runtime bootstrap
prepare connects Data WS and keeps carrier role-private
0..1 prepared-uncommitted + 0..1 committed-current-deliverable bound
second prepare while pending exists rejects without replacing pending identity
Broker revokes old pending before attempting replacement
prepare cancellation/revoke is identity-safe
post-install provisioner.commit resolves via committed ACK
commit delivery failure after install retires the new pair
old current is never resurrected after new install
late committed/prepared ACK cannot re-install stale candidate
committed-undelivered carrier cannot accumulate unbounded application traffic
provisioning IPC terminal is Data-only
child exit remains existing Runtime failure fact
```

---

## 8. Relay / Cardinality / Resource Cases

Must prove：

```text
Renderer-only prepared → not current
Runner-only prepared → not current
pre-install application bytes → candidate fail/dispose
one implementation slot per S
per-S 0..1 pending + 0..1 current
same-S concurrent candidate requests → one pending owner; newcomers reject/dispose
loser late events cannot disturb winner
different S slots independent
one relay side terminal → whole pair retires
late retired bytes/send completion cannot affect replacement
Broker does not parse Data application JSON
finite application buffering while role reader/delivery is delayed
pre-install buffer overflow disposes candidate
post-install buffer overflow retires whole pair
no buffered old traffic replay/migration
```

The exact finite buffer constant is adapter-private and is not part of the public port or Data protocol。

---

## 9. Proactive / Loss Same-generation Replacement

Proactive：

```text
A role peers current
→ one B pending candidate prepared privately under same S/1/P with no Binding waiter required
→ install B / retire A
→ old role peers terminal
→ fresh M8 acquire receives B if B remains deliverable
```

Loss：

```text
A WS loss
→ A whole-pair retired
→ Runtime/Frame/Renderer Control/Main S/1/P unchanged
→ fresh B may install under same S/1/P
```

Must prove：

```text
no generation change
no Renderer revision change solely for physical replacement
no resume token
no old traffic/unsent queue migration
fresh @loomrealm/data peer object / connection-local state
```

M9 MUST NOT claim fresh User Input Interest/State publication or Render snapshot/domain baseline。Those business/profile child semantics are qualified by M10/M11。

---

## 10. Post-install Delivery Failure

Required explicit trace：

```text
A current
→ B paired prepared
→ install commit retires A and makes B current
→ Runner commit notification fails
→ B current→retired
→ no A rollback/resurrection
→ Runtime/Frame/Main authority unchanged
```

This closes the IPC half-commit ambiguity。

---

## 11. Broker Contract Harness

In addition to the production vertical, a small Desktop Broker harness directly drives frozen immutable sink views to cover abstract cases production M9 cannot naturally create：

```text
wrong/stale G/P
same-key different HostedRuntime object
Renderer token replacement races
same-S concurrent candidate requests
pending candidate replacement requires explicit revoke
post-install delivery failure
finite-buffer overflow before/after install
stale late traffic/ACK
```

Harness MUST NOT add fake Runtime restart/generation allocator to `@loomrealm/main` and MUST NOT introduce a production multi-candidate queue merely to test concurrency。

---

## 12. M9 Non-goals

M9 vertical MUST NOT require：

```text
BrowserWindow / Electron product shell
Hostra physical RendererControlBinding product realization
User Input business manager/baseline qualification
Render Store/Manager/baseline qualification
Content service
loom.map
PWA MessageChannel
production same-key Runtime restart
generation allocator
multi-pending candidate scheduler
BackpressureManager / application flow-control protocol
```

---

## 13. CI Shape

Add one root gate：

```text
npm run test:m9
```

It MUST include：

```text
platform-ports M9 API/boundary tests
Main authority-sink tests
Hostra provisioner/IPC tests
Desktop Broker contract harness
real M9 physical vertical
```

And keep green：

```text
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
npm run docs:build
npm run docs:check-links
```

No giant E2E replaces package/role evidence。

---

## 14. Frozen Closure

M9/04 is implementation-closed when repository placement、immutable authority snapshot、bounded slot/resource state、production vertical、contract harness and exact CI evidence above leave no architecture choice to be invented during coding。Private file/class names and finite buffer constants remain implementation freedom。
