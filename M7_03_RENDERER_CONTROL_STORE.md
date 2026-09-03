# M7 / 03 — Renderer Control Store

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：03  
> 最近复核：2026-09-03  
> 前置：[M7 / 01 — Renderer Control Package](M7_01_RENDERER_CONTROL_PACKAGE.md)、[M7 / 02 — Main Authority Projection](M7_02_MAIN_AUTHORITY_PROJECTION.md)  
> 目标：建立 platform-neutral `@loomrealm/renderer` role package 的 M7 最小 slice，使 Renderer 能通过 `@loomrealm/renderer-control` 获得 Main committed authority，并以完整 Snapshot 原子维护只读 Control Store。

核心原则：

> **Renderer Control Store 是 Main authority 的只读 mirror，不是第二套 authority，也不是未来 Data/Input/Render 状态的总仓库。**

---

## 1. Scope

本步骤主要新增/修改：

```text
@loomrealm/renderer
```

直接消费：

```text
@loomrealm/renderer-control
@loomrealm/foundation   （仅在真实窄依赖需要时）
```

M7/03 不实现：

```text
Renderer Data plane
Data Connection provisioning
User Input producers
Frame Interest
Render Store
DOM / Canvas / WebGL
Content
Desktop/PWA composition
```

---

## 2. Package Position

```text
@loomrealm/renderer-control Renderer peer
              │
              │ accepted typed Snapshot / terminal
              ↓
      @loomrealm/renderer
              │
              └── Control Store
                    sessionId
                    revision
                    runtimes
                    stack
                    inputTarget
                    dataAuthorities
```

Business、Main、Subsystem 不直接操作 Renderer Control Store。

---

## 3. Minimal Control Store

M7 最小状态：

```ts
interface RendererControlState {
  readonly sessionId: string;
  readonly revision: number;
  readonly runtimes: readonly RendererRuntimeStateV1[];
  readonly stack: readonly RendererFrameStateV1[];
  readonly inputTarget: RendererInputTargetV1 | null;
  readonly dataAuthorities: readonly RendererDataAuthorityV1[];
}
```

精确 public type naming 在真实 consumer closure 时确定。

Store MUST NOT加入：

```text
connection object
WebSocket URL
Data endpoint/token
Frame Interest
Input producer state
Render state
DOM state
historical revisions
Frame call/return history
```

---

## 4. Atomic Snapshot Application

应用路径：

```text
renderer-control validates full Snapshot
→ Renderer role receives one accepted immutable Snapshot
→ atomic replace Control Store
→ observers see either old complete state or new complete state
```

禁止：

```text
set runtimes
then set stack
then set activation
then set inputTarget
```

这种 field-by-field exposure 会制造协议本身不存在的中间 authority state。

---

## 5. Session Semantics

Renderer 维护 current Session universe。

同 Session：

```text
new revision > current revision → atomically replace
```

新 Session：

```text
fresh successful hello Snapshot
→ discard old authority universe
→ atomically install new universe
```

旧 Session 的：

```text
Activation
InputTarget
DataAuthority
Runtime/Frame mirror
```

不得迁移到新 Session。

Renderer role不得把相同逻辑 key 当作跨 Session identity continuity 的依据。

---

## 6. Revision Semantics

Renderer 不分配 `AuthorityRevision`。

Renderer只消费：

```text
strictly newer revision
```

允许：

```text
R=10 → R=15
```

禁止：

```text
R=10 → R=10
R=10 → R=9
```

revision gap 不表示 lost event，也不能触发 replay/resync 请求，因为 v1 的 Snapshot 已自包含。

---

## 7. Control Loss

Control connection terminal 后，Renderer 不再拥有可证明的 current Main authority。

M7 Renderer role 必须立即在本地形成 fail-closed fact：

```text
ordinary input authority unavailable
InputTarget considered invalid
all DataAuthority considered invalid
```

M8+ 实际 Data Connections 出现后，同一 terminal handling seam 将负责请求 retire/close 这些连接。

M7 不需要真实 Data Connection object，也不要为了未来能力创建 placeholder Broker。

Presentation state在未来可以按 Render protocol 独立保留最后合法画面；M7 Control Store 不拥有该逻辑。

---

## 8. InputTarget Is Authority, Not Input State

Store 中 `inputTarget` 只是 Main authority mirror。

Renderer later computes effective ordinary input from：

```text
InputTarget
× matching Data Connection
× mirrored active Frame/Activation
× Frame Interest
× local Producer availability
```

在 M7：

```text
InputTarget can be stored
but no User Input is sent
```

不要提前实现 InputManager。

---

## 9. DataAuthority Is Logical Only

Store 中 DataAuthority：

```text
subsystemKey
generation
dataProfile
```

M7 只要求：

```text
current authorities can be queried/read as immutable state
replacement/removal follows atomic Snapshot
control loss invalidates them
```

M7 不创建 physical Data connection。

M8 的 Renderer Data integration 必须消费这个 Store，而不是自己重新推导 Main policy。

---

## 10. No Stack-op Interpretation

Renderer 只观察 current facts：

```text
stack
frame lifecycle
activationId
inputTarget
```

不得根据：

```text
call
return
push
pop
unwind
resume reason
```

重建另一套 Frame state machine。

这保证 failure unwind 和 stack authority仍唯一留在 Main。

---

## 11. Observer Surface

M7 可能需要最小 read/subscribe capability 供后续 Renderer slices 消费，但 public API 必须保持窄。

允许的方向：

```text
getCurrentSnapshot()/getState()
subscribe to atomically committed Store replacement
```

不应暴露：

```text
mutable store object
per-field mutation callbacks
arbitrary reducer dispatch
generic event bus
history/time-travel API
```

精确 public surface 等第一批真实 M8/M10 consumers 出现时再冻结。

---

## 12. Lifecycle

Renderer Control role lifecycle 最小模型：

```text
not connected
→ connecting/hello pending
→ current
→ terminal
```

精确状态是否需要公开，由实现决定；不要为了 UI convenience 扩大 package contract。

重要事实：

```text
protocol peer terminal
→ current Main authority proof is lost
→ role fail closed
```

Renderer role不得自动使用 cached Snapshot恢复 ordinary authority。

---

## 13. Package Boundary

`@loomrealm/renderer` MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/runtime-control
@loomrealm/game-package
@loomrealm/game-launcher-*
concrete Hostra/PWA package
Node process APIs
```

后续 Data/Input/Render slices可按 package architecture 增加对应 capability dependencies，但 M7 不提前建立完整 dependency graph。

---

## 14. Source Shape

M7 建议先保持极小：

```text
packages/renderer/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ src/
│  ├─ index.ts
│  └─ control-store.ts
└─ test/
   └─ control-store.test.mjs
```

必要时再拆 control integration 文件。

不要提前创建：

```text
input/
render/
data/
content/
platform/
```

空目录或 dormant abstractions。

---

## 15. Tests

至少覆盖：

```text
initial hello Snapshot installs atomically
newer same-session Snapshot replaces atomically
revision gap accepted
duplicate/regressive revision not applied
new Session replaces whole universe
InputTarget identity changes only through whole Snapshot
DataAuthority replacement/removal atomic
control terminal invalidates authority usability
old connection cannot mutate current Store
no stack-op interpretation
Store contains no physical Data material
```

测试可以直接使用 renderer-control Renderer peer + MemoryCarrier，避免真实 browser transport。

---

## 16. Step Closure

M7/03 complete when：

```text
@loomrealm/renderer package exists
Renderer Control Store exists
initial/current Snapshot atomically applied
session/revision semantics correct
control loss fails closed
no Data/Input/Render implementation leaked into M7 slice
renderer package can participate in transport-independent E2E
```

完成后进入：

```text
M7_04_VERTICAL_INTEGRATION.md
```
