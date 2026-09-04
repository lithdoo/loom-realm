# M9 / 04 — Desktop Data Vertical Integration

> 状态：**Implementation Boundary Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用真实 Hostra Node Runner + provisioning IPC + Data WebSocket 跑通 M8 role-facing Data seam；Renderer 端保持 deterministic/test hosting，不提前进入 M14 BrowserWindow product composition。

> **M9 vertical 的新证据是 physical Broker/IPC/WS；Main、Renderer Control、Subsystem host 与 `@loomrealm/data` 必须继续走 production code。**

---

## 1. Vertical Shape

```text
Hostra PREPARE
→ real Main Session
→ real Node Runner
→ real Runtime Control WebSocket
→ real Subsystem host ready
→ Main DataAuthority(S,1,P)

real Renderer Control production peers
→ test/deterministic Renderer host
→ real Renderer holder
→ RendererDataBinding.acquire(S,1,P)

Runner SubsystemDataBinding.acquire()
→ real provisioning IPC
→ Desktop Broker
→ real Data WebSocket pair
→ paired commit
→ real RendererDataPeer + SubsystemDataPeer
```

`P = loomrealm.renderer-data/1`。

Renderer Control physical WebSocket / BrowserWindow 仍留 M14。

---

## 2. Initial Install

Must prove：

```text
Runtime not ready → no install
Runtime ready → Main authority appears
Renderer and Subsystem waits become available
Broker provisions one exact candidate
both sides prepared
commit-time revalidation passes
both role Bindings resolve
real Data peers install
```

No child Input/Render traffic is required for M9 closure。

---

## 3. Authority Race

At least cover：

```text
start candidate S/1/P
→ Main authority removed before commit
→ physical establishment finishes late
→ candidate disposed
→ no role install
```

同样覆盖 Renderer participant replacement；old Renderer candidate不得在 new participant 下 install。

---

## 4. Data Loss / Recovery

```text
current Data WS closes
→ both Data peers terminal/clear
→ Runtime/Frame/Renderer Control stay valid
→ Main S/1/P unchanged
→ fresh physical candidate
→ fresh paired commit
→ fresh peers current
```

Must show no replay/resume and no Main revision change solely for reconnect。

---

## 5. Runner Provisioning Cases

Must cover：

```text
Subsystem acquire pending does not block Runtime Control/Frame
provision revoked before commit
Runner prepared ACK arrives stale
Data WS connect failure can be absorbed as candidate failure
provisioning channel terminal surfaces Data capability failure only
Runtime process exit still follows existing Runtime failure path
```

Provisioning IPC loss本身不得伪装成 Runtime Control loss。

---

## 6. Cardinality / Cutover

Create concurrent candidates for one S and prove：

```text
at most one commit winner
losers disposed
no two current pairs
late loser events cannot disturb winner
```

Different subsystem slots remain independent。

---

## 7. M9 Non-goals

Vertical MUST NOT require：

```text
BrowserWindow
Hostra physical RendererControlBinding
User Input business state
Render Store/Manager
Content service
loom.map
PWA MessageChannel
same-key Runtime restart path
```

Those belong to later milestones。

---

## 8. CI Shape

Add one focused gate：

```text
npm run test:m9
```

It should compose existing package tests with the real Hostra M9 vertical, while keeping：

```text
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
```

green。

---

## 9. Closure

M9/04 关闭时，Desktop 在没有 BrowserWindow/Input/Render/Content 的情况下已经证明真实 Node child late provisioning + Data WS + paired commit 可以正确实现 M8 Data seam 和 Frozen Connection lifecycle。
