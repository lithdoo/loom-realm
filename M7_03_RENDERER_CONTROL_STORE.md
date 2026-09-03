# M7 / 03 — Renderer Control Store

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：03  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md)  
> 目标：建立 `@loomrealm/renderer` 的 M7 最小 slice：保存 current renderer-control peer 已接受的完整 Snapshot；关闭 hello handoff、replacement 与 terminal race；不复制协议状态机，不提前建立 Data/Input/Render framework。

核心原则：

> **Renderer M7 authority state只有 `currentPeer + RendererAuthoritySnapshotV1 | null`。协议 legality由 peer判断；role只决定哪个 peer 是 current，并原子安装/撤销已接受 Snapshot。**

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

M7 不实现 Renderer Data plane、Input/Interest、Render Store、Content、DOM/Canvas/WebGL、Desktop/PWA composition。

---

## 2. Minimal State

```ts
currentPeer: peer identity/reference | null
currentSnapshot: RendererAuthoritySnapshotV1 | null
```

不定义：

```text
RendererControlState duplicate DTO
authorityUsable/inputUsable/dataUsable flags
connectionState enum
appliedRevision duplicate field
history/per-field caches
```

含义：

```text
currentPeer != null && currentSnapshot != null → current Main authority proof available
otherwise                                  → no usable Main authority
```

两个字段的更新属于同一 role-level atomic transition；不得暴露 peer 已换而 Snapshot 仍旧、或 Snapshot 已换而 peer 仍旧的中间可观察状态。

---

## 3. Protocol State Is Not Reimplemented

Renderer peer已经完成：

```text
wire/schema validation
whole Snapshot relation validation
hello/session establishment
current-connection revision monotonicity
duplicate/regression terminal
```

Renderer role路径只有：

```text
peer accepts immutable Snapshot
→ if peer is current
→ replace currentSnapshot
```

Renderer role MUST NOT再次实现 revision/session/schema/lifetime-history validator。

内部 assertion可存在，但不能形成第二个 protocol rejection authority。

---

## 4. Atomic Snapshot Replacement

Renderer只能观察：

```text
old complete current state
or
new complete current state
```

不得逐字段 set runtimes/stack/inputTarget/dataAuthorities。

immutable Snapshot引用整体替换即可；不需要 reducer/transaction/store framework。

---

## 5. Hello Handoff Is Two-phase but Minimal

new peer hello成功后，必须先取得 validated initial Snapshot R，**尚未开始向 role暴露 later state**。

Renderer role原子执行：

```text
oldPeer = currentPeer
currentPeer = newPeer
currentSnapshot = R
```

只有这个安装完成后：

```text
start/consume newPeer later accepted renderer.state sequence
```

因此不会出现：

```text
R+1 callback arrives
→ role尚未安装 R/newPeer
→ R+1被丢弃或错误归属
```

实现优先使用 peer提供的 lazy later-state consumption，而不是为了 handoff增加 staging Store/queue framework。

---

## 6. Replacement / Old Peer Races

Main会主动 retire/close old Control Connection；Renderer role同时以 peer identity保护本地 currentness。

newPeer安装后：

```text
oldPeer later Snapshot → ignore
oldPeer terminal       → ignore for current state
```

只有：

```text
terminal peer === currentPeer
```

才执行：

```text
currentPeer = null
currentSnapshot = null
```

这样 replacement 与旧 carrier terminal race不会错误清除新 authority。

Renderer role不负责向旧 peer发送 close；Main replacement authority负责主动 retirement。Renderer可自行释放旧 peer本地资源，但不能改变 Main currentness。

---

## 7. Control Loss

current peer terminal 后清空 `currentPeer + currentSnapshot`，即可表示：

```text
InputTarget unavailable
DataAuthority unavailable
ordinary input authority unavailable
```

M8+ real Data Connections出现后，下游 consumer再对 current Snapshot撤销做 retire/close；M7 不创建 placeholder Broker/registry。

Presentation是否保留最后合法画面属于 Render Store，不属于 Control authority。

---

## 8. Representation Failure

如果 Main因 current Snapshot不可表示而主动 terminalize Control Connection，Renderer侧只观察 ordinary current-peer terminal：

```text
currentPeer/currentSnapshot → null
```

Renderer不尝试：

```text
request smaller Snapshot
truncate local state
resync by revision
reconstruct from old Snapshot
```

恢复只有 fresh connection + hello current Snapshot。

---

## 9. Data / Input Deferred

M7可持有 Snapshot 中的 `inputTarget/dataAuthorities`，但不执行 InputManager、Interest gate、Data connection 或 Render lifecycle。

M7 Main vertical固定 `dataAuthorities=[]`；非空 fixture只验证 representation/atomic storage。

---

## 10. No Public Subscription Yet

M7没有真实 M8/M10/M11 consumer要求 observer API，因此不冻结：

```text
subscribe(listener)
EventEmitter
selector/reducer API
AsyncIterator on Store
history/time-travel
```

测试只需要最窄 current Snapshot read surface。等 M8真实 Renderer Data binding出现后再由实际调用方式决定 observer surface。

---

## 11. Package Boundary

`@loomrealm/renderer` MUST NOT依赖：

```text
@loomrealm/main
@loomrealm/runtime-control
@loomrealm/game-package
@loomrealm/game-launcher-*
concrete Hostra/PWA
Node process APIs
```

M7不预建 `data/ input/ render/ content/ platform/` 空模块。

---

## 12. Source Shape

```text
packages/renderer/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  └─ control.ts
└─ test/
```

`control.ts` 可以只是 peer + Snapshot orchestration；若代码足够小无需 class。

禁止 StoreManager / ObserverHub / RendererContext framework。

---

## 13. Tests

至少覆盖：

```text
hello initial Snapshot returned before later state consumption begins
peer + initial Snapshot installed atomically
later accepted Snapshot whole replacement
new peer replaces old peer
old peer late Snapshot ignored
old peer terminal cannot clear new current
current peer terminal clears peer + Snapshot together
representation-failure terminal behaves like control loss
no duplicate RendererControlState
no second revision/session validator
no public subscription framework
```

revision gap/regression legality只在 renderer-control peer tests验证。

---

## 14. Step Closure

M7/03 complete when：

```text
state is exactly currentPeer + Snapshot|null
hello handoff cannot lose R+1
peer replacement/old-terminal race is identity-safe
current terminal clears authority atomically
no second protocol state machine
no duplicate Control DTO
no premature observer/Data/Input/Render framework
package can join real M7 vertical
```