# M8 / 04 — Data Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用 deterministic paired Data Bindings + MemoryCarrier 跑通真实 Main authority → Renderer Control → role-facing current Data seam → real `@loomrealm/data` peers；验证 role currentness/replacement/failure isolation，不声称已实现 Platform authority-feed 或 Desktop Broker commit-time revalidation。

> **Test fixture只模拟“Platform 已有可交付 current pair”这一 seam；Main authority、Renderer Control、role reconciliation 与 Data peers必须走生产代码路径。Fixture 不得被当作 Main DataAuthority 的第二事实源。**

---

## 1. Frozen Vertical

```text
real Main Session
→ Runtime becomes ready
→ Main commits DataAuthority(S,G,P)
→ real Renderer Control Snapshot publication
→ Renderer reconciles RendererDataBinding(S,G,P)

real Subsystem host ready
→ SubsystemDataBinding waits for current pair

Deterministic paired Binding fixture
→ treats Renderer-requested S/G/P only as a deterministic test pairing selector
→ MemoryCarrier endpoint pair
→ Renderer acquire resolves one endpoint
→ Subsystem acquire resolves paired endpoint + G/P
→ createRendererDataPeer / createSubsystemDataPeer
```

不允许测试直接构造 Main Snapshot、直接写 Renderer current state或绕过 role Binding。

这里**不 qualification**：

```text
Platform obtains authoritative S/G/P from Main
candidate authentication/provisioning
commit-time current Runtime / current Renderer / DataAuthority revalidation
```

这些属于 M9 Broker。M8 fixture MAY 使用由真实 Renderer Control 驱动产生的 Renderer acquire `S/G/P` 作为 test-only pairing selector，但该值不因此成为 Platform authority source。

---

## 2. Deterministic Paired Binding Fixture

Fixture只拥有 test physical coordination：

```text
pending Renderer acquire requests
pending Subsystem acquire for target Runtime
MemoryCarrier pair creation
pair resolution / abort / close facts
Binding terminal trigger
```

Fixture不得：

```text
mint generation/profile
claim Renderer request is authoritative Main state
claim commit-time authority revalidation coverage
change Main Runtime state
change Renderer current participant
parse Data application protocol
keep application replay history
```

一个 pair commit只产生两个 matching endpoints；extra/stale endpoint必须 dispose。

---

## 3. Initial Authority / Installation

证明：

```text
Runtime before ready
→ no Main DataAuthority
→ no Renderer Data acquire

Runtime ready commit
→ Main publishes S/G1/P
→ Renderer requests exact S/G1/P
→ Subsystem and Renderer receive one paired carrier
→ both create real @loomrealm/data peers
```

Data connection建立与否不改变 Runtime ready fact或 Frame authority；pending Subsystem acquire也不得阻塞 Runtime Control/Frame handling，pending Renderer acquire不得阻塞 later Control Snapshot consumption。

---

## 4. Late / Stale Acquisition Race

制造：

```text
Renderer starts acquire S/G1/P
→ Main removes/replaces authority
→ old acquire resolves late
```

必须：

```text
old carrier closed/disposed
G1 peer not installed
new/current authority unaffected
```

同样覆盖 Control peer replacement：old participant的 pending Data acquire永远不能安装到 new participant state。

---

## 5. Data Loss Isolation

Current Data carrier loss：

```text
Data peer terminal
→ local current Data cleared
→ Main Runtime still ready
→ Frame/Stack/InputTarget authority unchanged
→ Renderer Control remains current
→ Main DataAuthority S/G/P remains current
```

若 Binding仍 healthy，role reconciliation可等待 fresh same-generation pair。

这必须是 M8 的核心 pass condition；不得把 Data loss升级为 Runtime failure。

---

## 6. Same-generation Fresh Carrier

```text
S/G/P authority remains current
→ Data A current
→ A retires/lost
→ fresh pair B
→ B current under same G
```

证明：

```text
no Main generation bump
no Renderer revision bump solely for reconnect
fresh Data peers are new objects
old unsent traffic not migrated/replayed
```

M8不要求 Input/Render fresh baseline，因为它们分别属于 M10/M11。

---

## 7. Authority Replacement

```text
G1 current
→ Main commits authority removal/replacement
→ Renderer Snapshot changes
→ old Renderer Data peer retires
→ old pending acquire aborted
```

若 future fresh Runtime产生 G2：

```text
G2 > G1
→ only G2 may install
```

Renderer participant A → B 且 `S/G/P`不变：

```text
A Data retires because parent participant changed
B obtains fresh pair under same G
```

---

## 8. Capability Absence / Terminal

分别证明：

```text
RendererDataBinding absent
→ Renderer Control still functional; no Data

SubsystemDataBinding absent
→ Runtime/Frame still functional; no Data

Binding non-abort rejection
→ no busy retry loop
→ Runtime/Frame/Control authority remains valid
```

M8不要求 M6 Hostra Runtime-only composition提供 fake Data Binding。

---

## 9. No Child-role Claim

Vertical不得通过 fake Input/Render state制造“完整 Profile product”证据。

M8 trace到：

```text
Data peer installed / retired / replaced / terminal
```

为止。

User Input state/effectiveness在 M10 qualification；Render registry/snapshot/revision在 M11 qualification；Hostra/PWA transport equivalence在 M14/M16。

---

## 10. CI Shape

保留独立 evidence：

```text
main DataAuthority tests
platform-ports Data Binding tests
subsystem-host Data integration tests
renderer Data integration tests
@loomrealm/data existing package regression
M8 deterministic paired vertical
M1–M7 regression
```

不要把所有语义只放进一个巨型 E2E。

---

## 11. Frozen Closure

M8/04 complete when：

```text
real ready Runtime creates Main DataAuthority
real Renderer Control carries it
real role Bindings consume one deterministic already-current paired MemoryCarrier seam
real @loomrealm/data peers install on both sides
stale acquire cannot install
Data loss is isolated from Runtime/Frame/Control authority
same-generation fresh carrier works without replay or generation bump
Renderer replacement retires old participant Data without changing G
capability-absent paths remain valid
M8 does not claim Platform authority-feed / commit-time paired-install qualification
```
