# Viewport State v1 — 独立逻辑呈现尺寸

> 层级：正式 child 契约；状态：**Normative candidate / Docs Freeze HOLD / not implemented**；2026-09-18。
> 组合：[Renderer Data Profile /1](./renderer-data-profile-v1.md)；决策：[ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；[Conformance](./viewport-state-conformance-v1.md)；[冻结账本](../30-implementation/viewport-core-freeze-ledger.md)。

## 1. Authority / scope

唯一 publisher 是 current Renderer participant 所绑定的**一个明确指定、身份稳定的 logical presentation surface**。Core 只观察 CSS logical pixels（不是设备像素），不认 DOM/Window/DPR、Map content box、camera 或游戏默认尺寸；同 participant 的所有 current Subsystem peers 观察同一源。更换真正的 Renderer participant 必须 stop/fence 旧源并重新 start；同 participant 仅 Control snapshot/Data carrier/G 改变不得随意换源。Viewport 观察不受 InputTarget、Activation、Interest、Frame、focus、input producer availability 门控，不 mint mutation permit。Main 不存/转发尺寸，Viewport 不修改 RenderDomain、Store、Projector。

## 2. Observation / wire / codec

```ts
export interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

Raw sample `{width,height}` 均必须 finite positive number，再分别 Math.floor；仅当 floor 后均为 positive safe integer 才接受。`640.9 → 640`；floor 为0、NaN、Infinity、负数、unsafe、missing/extra property不成为合法尺寸；source adapter 对 trusted raw sample 至少检验 object+own width/height+数值，不用 prototype/getters 读取不受信任字段。非法样本丢弃，保留上一合法样本，不发送 0/null/default；归一化后同值 suppress。DPR-only 而 CSS logical size 不变不发布。

Wire 唯一 exact own-key `{type,width,height}`、positive safe integer，不接受 wire fraction 或 extra/inherited fields；方向 Renderer→Subsystem。其他 type/namespace、common 1MiB/depth64、JSON unit、terminal 归 Profile 定义。`viewport.state` invalid value/shape/direction → child viewport protocol-fatal；`viewport.foo` → profile unknown。一次消息是完整 retained state，不是单个 resize action；无 seq、timestamp、ACK、retry token、scale、Map 字段。

## 3. 公共 API（完整增量）

```ts
// @loomrealm/renderer
export interface RendererViewportSource {
  start(emit: (sample: Readonly<{ width: number; height: number }>) => void): () => void;
}
// existing data/input positional arguments preserved; optional third source
createRendererControlHolder(data?, input?, viewport?);

// @loomrealm/data
export type RendererDataMessageV1 = UserInputMessageV1 | RenderUpdateMessageV1 | ViewportStateV1;
export type DataProtocolFamily = "profile" | "input" | "render" | "viewport";
export interface RendererViewportDataPeer { publishState(message: ViewportStateV1): void; }
// RendererDataPeer adds readonly viewport: RendererViewportDataPeer;
// SubsystemDataHandlers adds onViewportState(message): DataInboundDisposition | Promise<DataInboundDisposition>;

// @loomrealm/subsystem
export interface ViewportSize { readonly width: number; readonly height: number; }
export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
// SubsystemScope adds readonly viewport: Viewport;
```

Data `publishState()` returns void: coalesced samples have no per-sample fulfillment or remote ACK. Renderer MUST call only on current peer, Data internally consumes send outcome and peer.terminal; bad local caller message follows existing local-fatal send rule rather than fabricating remote invalid. Scope value is immutable/detached and Runtime-scoped, not Frame-scoped.

## 4. 唯一 publisher 算法

每 RendererDataPeer 独有 `{active:true,lastSent:null,inFlight:null,pending:null}`；Renderer participant 另持有唯一 `latestValid`。`inFlight` 表示**已经入原共享 writer 或等待该 send outcome**，`pending` 尚未 admission，宽高结构比较。单 JS event-loop 串行处理 offer/settle/retire；设置 inFlight 必须发生在调用 runtime.send 前。所有异步续体校验同 peer cursor identity 与 active。

```text
offer(V) inactive: ignore
offer(V), inFlight=null:
  V==lastSent  → pending=null, no send
  otherwise    → pending=null; inFlight=V; call runtime.send(V) once
offer(V), inFlight=A:
  pending=(V==A ? null : V)       // last observation replaces prior; A→B→A cancels B
settle sent(A), active:
  lastSent=A; inFlight=null; P=pending; pending=null
  if P!=null && P!=lastSent: inFlight=P; call runtime.send(P) once
settle terminal(A) / retire:
  active=false; inFlight=null; pending=null; no retry
fresh peer: fresh cursor(lastSent=null), offer(current latestValid if exists)
```

If B already admitted then C arrives, cannot revoke B; wait outcome then offer latest C. Other Input/Render units remain on same FIFO writer (physical concurrent sends≤1); Viewport contributes max 1 admitted/waiting + 1 pending regardless of burst length. Existing writer capacity 1024 is implementation fact, not protocol limit. No timer/debounce, second writer, ACK, replay queue, generic scheduler, infinite retry or cross-carrier pending migration. If writer becomes available, carrier remains current and its other traffic settles, latest valid size eventually converges; cannot guarantee convergence under permanently blocked shared writer. Retired cursor may not affect fresh cursor via old Promise.

## 5. Source/peer lifecycle and initial sample

`source.start(emit)` MUST synchronously emit current size before returning **when legal observation is available**; otherwise first available valid size MUST be emitted later. Source MUST sample upon surface becoming measurable/rebinding its same identity, not only on user resize, and emit on logical size changes. Renderer on participant replacement invalidates old token→best-effort stop→retire old peers→install new Control identity→start new source before Data reconciliation. Source synchronous bootstrap emission goes into one latest slot, not sender; after start returns valid stop function commit latest, then subsequent valid samples replace latest. Source start throw/bad return rejects bootstrap locally: discard staged value, fence callback, no Control/Data terminal, no invisible auto-restart in same participant; record failure for qualification. A missing source means no synthetic size.

Data peer current install is the only publisher start: only after `slot.current=peer` offer latest valid as fresh baseline; if no sample wait. Each current Subsystem peer has own new cursor; source never restarts solely on Data reconnect/new G or snapshot update. Old source callback, old carrier unit, async send completion fenced by participant token+current peer identity. Source start/stop/reentrant callback must pass identity check before any mutation. Peer loss clears sender cursor, not participant latest sample.

## 6. Retained Runtime capability

One Viewport manager/object per Runtime created **before** definition factory invocation, initial current=null. `subscribe(L)` while live synchronously invokes L(current) once, then only structural width/height changes; getter is already updated before callback. The returned unsubscribe is idempotent. Listener throw and rejecting thenable contained locally and do not block reader/others or cause Data terminal/unhandled rejection. Broadcast uses stable subscriber snapshot and verifies still-subscribed/live before each call; newly subscribed in a callback receives its own synchronous initial but not duplicate broadcast. New size/current returned as frozen detached object; consumer cannot mutate internal authority.

Only handler for `this.currentDataPeer===peer` and live Runtime can update retained size. On Data loss keep last size without null notification; fresh carrier always sends baseline, equal size suppresses author callback, different size updates then notifies. New G/Renderer while Runtime lives leaves same Viewport object but fences old peer. Last size after carrier loss is historical, not claim of current paintability. Shutdown/abort/terminal closes manager, clears subscriptions, invalidates late callback; postterminal `subscribe()` must return inert idempotent unsubscribe **without initial callback**. No Frame/Input/Render state mutation.

## 7. Boundary / release

Only `packages/data`, `packages/renderer`, `packages/subsystem` production code and their tests; no `game-libs/map`, Desktop/PWA adapter, Main, M13, platform-port edits. See [freeze ledger](../30-implementation/viewport-core-freeze-ledger.md) for exact files, identity gating, test IDs, stop conditions, signed docs SHA. Formal Docs Freeze not implied by this candidate's existence.