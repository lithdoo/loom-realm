# M7 / 03 — Renderer Control Store

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：03  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md)  
> 目标：建立 `@loomrealm/renderer` 的 M7 最小 slice：保存 current renderer-control peer 已接受的完整 Snapshot；不复制协议状态机，不提前建立 Data/Input/Render store framework。

核心原则：

> **Renderer M7 state 就是一份 `RendererAuthoritySnapshotV1 | null` 加 current peer identity。不要再造一个字段完全相同的 `RendererControlState`，也不要再验证一遍 protocol revision。**

---

## 1. Scope

新增/修改：

```text
@loomrealm/renderer
```

直接消费：

```text
@loomrealm/renderer-control
```

M7 不实现：

```text
Renderer Data plane
Data Connection provisioning
User Input / Interest
Render Store
Content
DOM / Canvas / WebGL
Desktop/PWA composition
```

---

## 2. Minimal State

M7 role state保持：

```ts
currentPeer: peer identity/reference | null
currentSnapshot: RendererAuthoritySnapshotV1 | null
```

不定义重复 alias：

```text
RendererControlState  ❌
```

也不加入：

```text
authorityUsable flag
inputUsable flag
dataAuthorityUsable flag
connectionState enum
history
per-field caches
```

含义天然为：

```text
currentSnapshot !== null → current Main authority可用
currentSnapshot === null → no usable Main authority
```

---

## 3. Protocol State Is Not Reimplemented

`@loomrealm/renderer-control` Renderer peer 已经完成：

```text
wire/schema validation
whole Snapshot relation validation
hello/session establishment
current-connection revision monotonicity
duplicate/regression rejection
```

因此 Renderer role application path只有：

```text
peer accepts immutable Snapshot
→ if peer is current
→ currentSnapshot = snapshot
```

Renderer Store MUST NOT再次实现：

```text
revision > currentRevision protocol check
session protocol parser
Snapshot schema validator
Activation lifetime history validator
```

内部 assertion MAY存在，但不能形成第二个拒绝/terminal authority。

---

## 4. Atomic Replacement

Renderer 只能看到：

```text
old complete Snapshot
or
new complete Snapshot
```

禁止：

```text
set runtimes
set stack
set inputTarget
set dataAuthorities
```

逐字段暴露中间状态。

直接替换 immutable Snapshot 即可实现原子性；M7 不需要 reducer/transaction/store framework。

---

## 5. Connection / Session Replacement

Renderer role 只决定哪个 peer 是 current。

新成功连接成为 current 时：

```text
currentPeer = new peer
currentSnapshot = new peer accepted hello Snapshot
old peer later output is ignored
```

旧 Session authority 不 merge、不迁移。

Protocol session/revision legality由 peer判断；Renderer role不再维护第二份 `appliedRevision` 状态。

---

## 6. Control Loss

Current peer terminal：

```text
if terminal belongs to currentPeer:
    currentPeer = null
    currentSnapshot = null
```

这一个动作已经表示：

```text
InputTarget unavailable
DataAuthority unavailable
ordinary input authority unavailable
```

M8+ 如果存在真实 Data Connections，再由对应 consumer 对 `currentSnapshot → null` 做 retire/close；M7 不创建 placeholder Broker 或 connection registry。

未来 Render presentation 是否保留最后画面属于 Render Store，不属于 Control Store。

---

## 7. Data / Input Semantics Are Deferred Consumers

M7 可以读取 Snapshot 中的：

```text
inputTarget
dataAuthorities
```

但不执行：

```text
InputManager
Frame Interest gate
Data connection establishment
Render lifecycle
```

M7 Main vertical 默认 `dataAuthorities=[]`。非空 DataAuthority 的 wire/store representation 可由 renderer-control/renderer fixture 测试覆盖，不因此引入真实 Data policy。

---

## 8. No Public Subscription Yet

M7 没有真实 M8/M10/M11 consumer 要求公开 observer API。

因此 M7 不冻结：

```text
subscribe(listener)
EventEmitter
selector API
reducer dispatch
AsyncIterator
history/time-travel
```

测试只需要读取 current Snapshot 的最窄方式；该读取 surface可以保持 package-internal/test-visible，或者仅冻结一个简单 getter（若真实 integration确实需要）。

等 M8 Renderer Data binding 成为第一个真实下游消费者后，再根据真实调用方式关闭 observer/notification surface。

---

## 9. Package Boundary

`@loomrealm/renderer` MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/runtime-control
@loomrealm/game-package
@loomrealm/game-launcher-*
concrete Hostra/PWA packages
Node process APIs
```

M7 不预建 `data/`、`input/`、`render/`、`content/`、`platform/` 空模块。

---

## 10. Source Shape

建议最小形状：

```text
packages/renderer/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  └─ control.ts
└─ test/
```

`control.ts` 内部可以只是 current peer + current Snapshot orchestration；若代码足够小甚至无需额外 class。

禁止提前创建 StoreManager / ObserverHub / RendererContext framework。

---

## 11. Tests

至少覆盖：

```text
hello accepted Snapshot becomes current atomically
later accepted Snapshot replaces atomically
new current peer replaces old peer
old peer output cannot mutate current Snapshot
current peer terminal clears Snapshot
no duplicate RendererControlState representation
no second revision/session validator
no Data/Input/Render implementation leakage
```

revision gap/regression 本身属于 renderer-control peer tests，不在 Renderer Store 重复测试协议规则。

---

## 12. Step Closure

M7/03 complete when：

```text
@loomrealm/renderer package exists
state is currentPeer + RendererAuthoritySnapshotV1|null
Snapshot replacement is atomic
peer replacement is first-class
current peer terminal clears usable authority
no public subscription framework is frozen
no duplicate protocol/session/revision state machine exists
package can join M7 deterministic vertical
```
