# M8 / 03 — Subsystem / Renderer Data Role Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md)  
> 正式契约：[Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [`@loomrealm/data` design](packages/data/DESIGN.md)  
> 目标：让 `@loomrealm/subsystem/host` 与 `@loomrealm/renderer` 成为 `@loomrealm/data` 的真实 role consumers，只关闭 current Data lifetime/currentness；不提前实现 M10 InputManager、M11 RenderManager 或 public Store framework。

> **M8 role state只回答“哪个 Data peer当前可用”；Input/Render业务状态仍属于后续 milestone。**

---

## 1. Subsystem Host

`RunSubsystemOptions` 增加 optional：

```text
data?: SubsystemDataBinding
```

Binding absent时保持现有 M4/M6 Runtime/Frame行为，不使用 fake/no-op Binding。

Runtime ready后，若 Binding存在，host启动一个独立的 pending Data acquire；**Runtime Control reader / Frame handling不得 await Data provisioning**：

```text
start data.acquire(signal)
→ Runtime/Frame processing continues
→ receive {carrier,G,P}
→ recheck host still ready/current
→ construct DataCurrentBindingV1 with launch.subsystemKey
→ createSubsystemDataPeer(...)
→ install as current Data peer
```

Subsystem Data local state只需：

```text
currentDataPeer | null
at most one pending acquire
```

Peer terminal：

```text
if terminal peer is current → clear current
Runtime/Frame authority unchanged
if host still ready + Binding healthy → reconcile one fresh acquire
```

Old/stale peer terminal不得清除新的 current Data peer。

---

## 2. Renderer Integration

M8扩展现有 Control holder的 package-internal orchestration；不创建 public Renderer Store/Session framework。

唯一新增 composition seam 是 construction-time optional `RendererDataBinding`：

```text
createRendererControlHolder(data?: RendererDataBinding)
```

等价的一字段 construction options MAY 使用，但语义必须是 exactly one optional typed Binding。不得增加 mutable `registerDataBinding()`、service locator、generic RendererPlatform/RendererServices。

真实需要的 Data state：

```text
per subsystemKey:
    0..1 current RendererDataPeer
    0..1 pending acquire
```

每次 accepted whole Control Snapshot安装后，用 `snapshot.dataAuthorities` 做 exact reconciliation：

```text
installed peer has no exact current S/G/P
→ retire it

exact current S/G/P already installed
→ keep

current authority exists but no peer
→ acquire(S,G,P)
```

Acquire resolve前后必须重新确认：

```text
same Control peer is still locally current
AND exact S/G/P is still in current Snapshot
AND acquire was not aborted
```

任一不成立：close returned carrier，禁止安装。

Reconciliation必须 non-blocking：

```text
install accepted Control Snapshot
→ synchronously compute desired Data changes
→ abort/retire stale Data work
→ start missing acquire work
→ return to Control state consumption
```

Control Snapshot consumption MUST NOT await Data acquire、peer close或 physical provisioning。Data 永远不能 backpressure Renderer Control authority updates。

---

## 3. Control Parent Authority

Current Renderer Control peer replacement / terminal：

```text
abort all pending Data acquires
retire all current Renderer Data peers
clear local Data current state
```

Old Control peer的 late Snapshot / terminal / late Data acquisition不能影响新 Control peer下的 Data state。

反方向不成立：

```text
Data peer terminal
✗ clear Renderer Control
✗ change Main Runtime/Frame authority
✗ synthesize DataAuthority replacement
```

---

## 4. `@loomrealm/data` Consumption

Role integration必须直接使用：

```text
createSubsystemDataPeer(...)
createRendererDataPeer(...)
```

不得复制：

```text
JSON parse / 1MiB/depth validation
role direction validation
one-reader dispatcher
serialized writer
terminal first-wins
```

M8不扩 `@loomrealm/data` public surface，除非真实 role implementation出现无法避免的缺口。

---

## 5. Child Protocol Boundary

M8只关闭 Data currentness / carrier lifecycle，不宣称 M10/M11 child role semantics完成。

因此 M8 implementation / vertical：

```text
does not publish Input Interest
has no Input producer/listener business API
has no Render Domain/Store business API
does not use child traffic to claim M8 closure
```

不要为了让 peer“看起来完整”提前创建：

```text
InputManager
RenderManager
DesiredInterest registry
Render registry/store
producer registry
coalescing queues
```

若 peer constructor在 M8需要内部 handlers，只使用最小 fail-closed glue。M8 qualification不得发送 child application traffic来证明 closure；收到 ordinary well-formed child traffic时也不得伪造 M10/M11 business state。不得据此宣称 User Input / Render Update role conformance。

---

## 6. Fresh Carrier

Same `S/G/P` 下 fresh current carrier：

```text
old Data peer retired
→ fresh acquire
→ fresh @loomrealm/data peer
```

禁止：

```text
reuse old peer
migrate old pending writer queue
replay old wire bytes
inherit old publication cursor
```

M10/M11在各自 milestone负责 fresh Desired Interest / Render baseline materialization。

---

## 7. Dependency Changes

M8 target：

```text
@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/data

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
    @loomrealm/platform-ports
    @loomrealm/data
```

仍禁止 role反向依赖 Main 或 concrete Hostra/PWA。

---

## 8. Tests

Subsystem：

```text
Binding absent keeps Runtime/Frame path green
Data acquire pending does not block Runtime Control / Frame handling
ready + Binding → one Data peer
old peer terminal cannot clear replacement peer
Data terminal does not fail Runtime/Frame
same-generation fresh carrier creates fresh peer
```

Renderer：

```text
construction-time optional RendererDataBinding; no mutable registration/service locator
Snapshot adds S/G/P → acquire/install without blocking Control consumption
Snapshot removes S/G/P → retire
G1 → G2 → retire G1 + acquire G2
late G1 acquire cannot install
Control A replaced by B → all A Data retired
A late Data terminal cannot affect B
Data terminal alone keeps Control current
Binding absent keeps M7 holder behavior
```

---

## 9. Frozen Closure

M8/03 complete when Subsystem/Renderer are real `@loomrealm/data` consumers with exact currentness, replacement and terminal isolation, while M10/M11 business state remains genuinely absent rather than represented by placeholder frameworks。
