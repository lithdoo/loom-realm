# M9 / 04 — Desktop Data Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用 production Main authority sink + real Hostra Node Runner provisioning IPC + real Data WebSocket relay 跑通 M8 role-facing seam；Renderer hosting保持 deterministic/test，不提前进入 M14 BrowserWindow。

> **M9 vertical 新增的是 authority→Broker→IPC/WS physical closure；M8 role code与 Frozen protocol mechanics不重写。**

---

## 1. Vertical Shape

```text
Hostra PREPARE
→ real Main Session
→ real Node Runner / Runtime Control WS
→ real Subsystem host ready
→ Main committed DataAuthority(S,1,P)

Main current Renderer acceptance
→ DataConnectionAuthoritySink.replace({rendererControlToken, S/1/P, HostedRuntime})
→ Desktop Broker

createHostraRuntimeHosting(... onRuntimeDataProvisioner)
→ app-private HostedRuntime → provisioner mapping

Desktop Broker
→ Renderer candidate WS
→ Runner candidate WS through provisioner
→ paired prepare
→ commit-time sink-view revalidation
→ paired commit
→ M8 RendererDataBinding / SubsystemDataBinding
→ real RendererDataPeer / SubsystemDataPeer
```

`P = loomrealm.renderer-data/1`。

Renderer Control physical WebSocket / BrowserWindow remains M14。

---

## 2. Renderer Test Host Boundary

M9 test Renderer hosting MUST use production：

```text
renderer-control peers
@loomrealm/renderer holder
RendererDataBinding consumption
@loomrealm/data RendererDataPeer
```

Only physical Renderer hosting is deterministic/test。

The same test Platform candidate that receives a Main-issued `rendererControlToken` owns the matching Renderer-side Data delivery cell。It never self-declares current；only the Main sink view makes that token installable。

---

## 3. Initial Install

Must prove：

```text
Runtime not ready → sink has no S entry → no install
Runtime ready commit → sink view includes exact S/1/P + HostedRuntime
current Renderer exists → sink view names exact accepted token
Broker prepares both WS endpoints
Runner provisioner reports prepared
commit-time revalidation succeeds
Broker installs sole current pair
Bindings resolve committed carriers
real Data peers install
```

No Input/Render child traffic is needed for M9 product vertical closure。

---

## 4. Authority Invalidations

At least cover：

```text
candidate preparing
→ Main removes S/1/P
→ sink.replace(new view)
→ candidate finishes late
→ commit rejected/disposed
```

And：

```text
Renderer A current / candidate A
→ Main accepts Renderer B
→ sink switches token A → B
→ A current/pending Data retire/invalidate
→ late A cannot install again
```

Exact HostedRuntime replacement in a synthetic Broker test must similarly invalidate old runtime-bound candidate/current material；production M9 does not invent a Runtime restart path。

---

## 5. Proactive Cutover / Recovery

Prove installation does not depend on role acquire waiter：

```text
A role peers current
→ Broker prepares/commits B same S/1/P
→ A pair retires/closes
→ existing role peers terminal
→ fresh M8 acquire receives already-committed B
```

Also cover loss-triggered recovery：

```text
current Data WS loss
→ whole pair retired
→ Runtime/Frame/Renderer Control/Main authority unchanged
→ fresh candidate under same S/1/P
→ fresh peers
```

No replay/resume and no Main revision change solely for physical replacement。

---

## 6. Runner Provisioning Cases

Must cover：

```text
Desktop receives provisioner before HostedRuntime can become Main-authoritative
exact HostedRuntime maps to exact provisioner
provision revoked before commit
Runner prepared ACK arrives stale
candidate WS connect failure is Data-only
provisioning IPC terminal disables Runner Data only
child process exit still follows existing Runtime failure path
```

No Runtime Control provisioning RPC。

---

## 7. Relay / Cardinality Cases

Must cover：

```text
Renderer-only connected → not current
Runner-only connected → not current
pre-commit application bytes → candidate fail/dispose
concurrent candidates same slot → at most one winner
loser late events cannot disturb winner
one relay side terminal → whole pair retires
late retired bytes do not reach replacement
independent subsystem slots do not interfere
```

---

## 8. M9 Non-goals

Vertical MUST NOT require：

```text
BrowserWindow
Hostra physical RendererControlBinding product realization
User Input business state
Render Store/Manager
Content service
loom.map
PWA MessageChannel
production same-key Runtime restart
new generation allocator
```

---

## 9. CI Shape

Add focused gate：

```text
npm run test:m9
```

Keep green：

```text
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
```

No giant E2E replaces package/role evidence。

---

## 10. Closure

M9/04 is closed when real Main authority propagation、exact HostedRuntime→Runner provisioner mapping、paired Data WS relay and existing M8 Bindings/peers form one deterministic Desktop physical vertical without BrowserWindow/Input/Render/Content。
