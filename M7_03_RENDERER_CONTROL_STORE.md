# M7 / 03 — Renderer Control Holder

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：03  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：建立 `@loomrealm/renderer` 的最小 M7 slice；只保存当前 peer 与已接受 Snapshot，关闭 hello handoff/replacement/terminal race，不提前建立 Store framework、Data/Input/Render architecture。

> **Renderer M7 authority state exactly = current peer identity/reference + `RendererAuthoritySnapshotV1 | null`。协议 legality由 renderer-control peer维护；role只拥有 currentness 与原子安装/撤销。**

---

## 1. Scope

新增：

```text
@loomrealm/renderer
```

Runtime dependency：

```text
@loomrealm/renderer-control
```

M7 不实现 Data plane、Input/Interest、Render Store、Content、DOM/Canvas/WebGL、Desktop/PWA composition。

---

## 2. Frozen State

逻辑上只有一个不可分割 current record：

```ts
current:
  | {
      readonly peer: RendererControlPeerIdentityOrReference;
      readonly snapshot: RendererAuthoritySnapshotV1;
    }
  | null;
```

实现 MAY internally用两个字段，但外部不可观察 half transition。

不得新增：

```text
RendererControlState duplicate DTO
authorityUsable/inputUsable/dataUsable flags
connectionState enum
appliedRevision duplicate field
history/per-field caches
```

```text
current != null → current Main authority proof available
current == null → no usable Main authority
```

---

## 3. Protocol State Is Not Reimplemented

Renderer peer负责：

```text
wire/schema validation
whole Snapshot validation
hello/session establishment
connection-local revision monotonicity
duplicate/regression terminal
```

Role application path：

```text
peer accepts immutable Snapshot
→ if peer identity is still current
→ replace current.snapshot atomically
```

Role MUST NOT再次实现 revision/session/schema/lifetime-history validator。

---

## 4. Initial Hello Handoff

冻结为 two-step handoff，不增加 staging framework：

```text
new Renderer peer
→ renderer.hello(id=1)
→ validated initial Snapshot R returned/resolved
```

此时 peer 尚未向 role暴露 later state。

Role原子安装：

```text
old = current
current = {peer:newPeer, snapshot:R}
```

安装完成后才：

```text
start/iterate newPeer later accepted renderer.state sequence
```

因此 R+1 不会在 R/newPeer尚未 current 时被 callback 丢失。

Later-state消费 surface使用 lazy `AsyncIterable`、explicit start或等价机制；不得为了 handoff建立第二个 queue/Store。

---

## 5. Atomic Snapshot Replacement

Renderer只能观察：

```text
old complete current snapshot
or
new complete current snapshot
```

不得逐字段 set `runtimes/stack/inputTarget/dataAuthorities`。

Immutable Snapshot whole-reference replacement足够；无 reducer/transaction/store framework。

---

## 6. Replacement / Old Peer Races

Main负责主动 retire/close old carrier；Renderer role同时用 peer identity保护 current state。

B 安装后：

```text
A late Snapshot → ignore
A late terminal → ignore for current B state
A already-inFlight message arriving physically → ignore if A no longer current
```

只有：

```text
terminalPeer === current.peer
```

才原子执行：

```text
current = null
```

Renderer role不负责决定 Main currentness，也不通过本地 close恢复/撤销另一 peer authority。

---

## 7. Control Loss / Session Terminal

Current peer terminal无论原因：

```text
carrier loss
replacement retirement
representation failure
Main Session terminal retirement
```

role统一：

```text
current = null
```

这立即表示：

```text
InputTarget unavailable
DataAuthority unavailable
ordinary input authority unavailable
```

M8+ real Data connections出现后，其 consumer再对 current authority loss做 retire/close；M7 不预建 registry。

Render presentation保留最后画面属于未来 Render Store，不属于 Control holder。

---

## 8. No Public Subscription Yet

M7没有真实 M8/M10/M11下游 consumer要求 observer API，因此不冻结：

```text
subscribe(listener)
EventEmitter
selector/reducer API
Store transaction API
AsyncIterator on holder
history/time-travel
```

M7 tests只需要最窄 current read surface。M8真实 Renderer Data consumer出现后再按实际调用方式增加通知 surface。

---

## 9. Package Boundary

`@loomrealm/renderer` MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/runtime-control
@loomrealm/platform-ports
@loomrealm/game-package
@loomrealm/game-launcher-*
concrete Hostra/PWA
Node process APIs
```

M7不预建 `data/input/render/content/platform` 空模块。

---

## 10. Recommended Source Shape

```text
packages/renderer/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  └─ control.ts
└─ test/
```

`control.ts` 可以只是 peer orchestration + current record；若代码很小无需 class。

禁止 StoreManager / ObserverHub / RendererContext framework。

---

## 11. Tests

必须覆盖：

```text
hello returns initial Snapshot before later-state consumption
peer + R installed atomically
later Snapshot whole replacement
B replaces A
A late Snapshot ignored
A already-inFlight late delivery ignored after B current
A terminal cannot clear B
current B terminal clears current atomically
Session terminal retirement observed as ordinary current terminal
representation-failure terminal clears current
no duplicate Control DTO
no second revision/session validator
no public subscription framework
```

---

## 12. Frozen Closure

M7/03 实施完成条件：

```text
@loomrealm/renderer exists
state exactly one current peer+Snapshot record or null
initial handoff cannot lose first later state
replacement/late-delivery/terminal identity-safe
current terminal revokes local authority atomically
no second protocol state machine
no duplicate DTO
no premature observer/Data/Input/Render framework
```

除 ADR 0027 Reopen Rule外，不允许实施阶段新增第二套 control state abstraction。