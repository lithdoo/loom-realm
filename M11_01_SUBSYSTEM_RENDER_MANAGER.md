# M11 / 01 — Subsystem RenderManager

> 状态：**Implemented / Requalification Pending**（current implementation subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`；`a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f` 仅为历史 Closed subject）
> 阶段：M11 Render  
> 落地顺序：01  
> 最近复核：2026-09-15
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)  
> Target correction：[ADR 0035](doc/decisions/0035-render-domain-existing-node-update.md)
> 目标：冻结 Subsystem-owned business Render Domain 的 exact author surface 与 local correctness；编码阶段只允许 private realization choices。

> **M11/01 只建立 business Render authority。publication、Renderer replica、presentation 与 Content 均不属于本步。**

> **Current notice：** subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 修复 revision rollover 收敛、数组 closed-shape 校验和单次 COW 应用；本地 `npm run test:m11` 已通过，hosted Node 20/24 尚待同一 subject 复验。旧 [M11 run 34998417265](https://github.com/lithdoo/loom-realm/actions/runs/34998417265) 只证明 `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`。

---

## 1. Position

```text
Subsystem business state
→ one internal RenderManager responsibility
→ business Render Domains
→ authoritative desired Render state / transient Event intent
```

Subsystem 是 business Render authority。Main、Renderer、Frame、Data carrier 都不拥有 business Render Domain lifecycle。

`RenderManager` 是 internal ownership boundary，不要求实现为独立 framework/service class；可以由一个私有对象或等价闭包/records实现，只要 authority 唯一。

---

## 2. Minimal Exact Author Surface

ADR 0035 target 的 M11 root exports 精确为：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
RenderDomainUpdate
```

以及 `SubsystemScope.createRenderDomain(...)`。

Exact shape：

```ts
// implementation-private declaration dependencies; not root re-exports
import type { RenderEventV1, RenderNodeV1 } from "@loomrealm/data";
import type { JsonValue } from "@loomrealm/wire";

export type RenderNode = RenderNodeV1;

export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderEvent {
  readonly targetKey: string;
  readonly name: string;
  readonly data: RenderEventV1["data"];
}

interface RenderStringDelta {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface RenderDataDelta {
  readonly set?: Readonly<Record<string, JsonValue>>;
  readonly remove?: readonly string[];
}

interface RenderNodeUpdate {
  readonly key: string;
  readonly attrs?: RenderStringDelta;
  readonly data?: RenderDataDelta;
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly RenderNodeUpdate[];
}

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}

interface SubsystemScope {
  readonly signal: AbortSignal;
  createInputListener(options: CreateInputListenerOptions): InputListener;
  createRenderDomain(initialState: RenderDomainState): RenderDomain;
}
```

`RenderStringDelta`、`RenderDataDelta`、`RenderNodeUpdate` 不从 package root 导出；不得为对称性增加 supporting root aliases。`RenderNode` 直接投影 Frozen `RenderNodeV1`，不复制第二套 recursive tree schema。`RenderManager` 是 SDK internal implementation，不是 author service。

`update()` 只修改 Domain `zIndex` 与已存在 node 的 attrs/data 顶层 members；node key/tag/children 和 tree structure 不可修改。结构变化继续使用 `replace()`。zIndex-only update 合法，因为 `zIndex` 已是 Domain-level authoritative state；删除它会留下只能靠完整 roots replace 表达的能力缺口。完整 input shape、presence、4096 node-op 和 representability规则以 ADR 0035 与 frozen implementation specification为准。

Author 不提供、不观察、不管理：

```text
domainId
generation
Registry
revision
Snapshot / Patch
publication cursor
carrier identity
```

---

## 3. Synchronous Local Commit

以下 API 全部是同步 local operation：

```text
createRenderDomain
replace
update
emit
close
```

对携带 author value 的调用固定：

```text
validate
→ detach caller-owned value
→ atomic local commit / bounded Event offer
→ return
```

`close()` 无 caller value，只做同步 atomic lifetime transition。

不得：

```text
await Data / Renderer
return publication Promise
expose revision/send outcome
freeze or mutate caller-owned object
retain caller-owned mutable object by reference
```

成功提交后，调用方后续修改原始 object/array 不得改变已提交 Domain state 或 Event intent。内部 authoritative snapshot 必须 detached；具体 clone/freeze representation 是 private mechanics。

---

## 4. Author Validation / Errors

任何成功 local commit 都必须能无损表示为合法 Frozen Render Update v1 application state/event。

因此 `createRenderDomain` / `replace` / `update` / `emit` 在 local commit 前验证相应：

```text
plain JSON representation
identifier/string rules
zIndex range
Domain-wide Node key uniqueness
stable live-key tag
business Node-key one-shot
Render tree / attrs / data structure
Frozen Render v1 hard limits
```

此外：

```text
live business Domains / Subsystem instance <= 256
```

错误分类保持最小：

```text
invalid shape / semantic usage / stale target / closed handle → TypeError
hard-limit overflow                                  → RangeError
```

失败必须 local-atomic：

```text
invalid create  → no Domain created; no publication caused by this call
invalid replace → previous authoritative state unchanged; no publication caused by this call
invalid update  → previous authoritative state/work unchanged; no publication caused by this call
invalid emit    → no Event intent queued/sent
```

Author usage error：

```text
!= Data fatal
!= Runtime failure
!= Frame failure
```

不新增 Render-specific error hierarchy。

---

## 5. Lifetime / Identity

必须保持：

```text
Frame create  != Domain create
Frame active  != Domain show
Frame suspend != Domain hide
Frame close   != Domain destroy
Data retire   != Domain destroy
```

若业务希望 Domain 与 Frame 同生共死，只能由业务代码显式 `close()`。

`close()`：

```text
idempotent
atomically removes the Domain from RenderManager live business Registry
atomically ends the business Domain lifetime
all later replace/update/emit → TypeError
Runtime terminal → eventually closes every still-live Domain
```

`close()` 后该 Domain 立即不再属于 desired Render publication set；current-carrier pending/output cleanup 与 wire Registry removal顺序由 M11/02 冻结。

SDK mint 的 `domainId` 是 author-invisible wire projection identity，不是 business handle identity。每次 mint 必须满足 Frozen v1 `domainId` representation/length，且一个 Subsystem Runtime instance 内从不复用已经 mint 过的值。

普通情况下一个 live business Domain 保持当前 wire `domainId`。只有 Frozen Render v1 明确要求 fresh wire identity 的异常边界（revision exhaustion）才允许为同一仍-live business Domain mint fresh `domainId`；business handle/lifetime 不因此改变，具体 rollover 见 M11/02。不得把这一条扩张成 generic business↔wire identity translation layer。

Node key 使用更强 local invariant：

```text
unique across one current Domain state
live key keeps stable tag
once removed from a business RenderDomain lifetime
→ same key cannot be introduced again in that business RenderDomain lifetime
```

该规则故意强于 wire minimum，以避免 author mutation validity 依赖 emitted history，也避免 business-key → wire-key translation layer。

fresh Data generation 可以重新导出仍 live 的 business keys；这不是 key reuse。

---

## 6. Event Boundary

`emit(event)` 先要求：

```text
Domain still live
targetKey exists in current business authoritative state
event shape/limits valid
```

否则 `TypeError` / `RangeError`，且不产生 Event intent。

成功 `emit` 只表达：

```text
ordered intent
transient
non-authoritative
no historical replay guarantee
```

Event 不改变 Domain state/revision。是否最终发送由 M11/02 current-carrier bounded publication 决定；author 不获得 delivery receipt。

---

## 7. Abstraction Budget

允许：

```text
one internal RenderManager responsibility per Subsystem instance
RenderDomain handles
Domain records
minimal tree/index validation helpers
minimal detached immutable authoritative snapshots
minimal existing-node COW candidate helpers
private domainId minting
```

禁止：

```text
public RenderManager / service locator
Generic Store / Observable / EventBus
virtual DOM / reconciler
component/plugin registry
layout / animation engine
Content/resource resolver
Render RPC
Frame→Domain implicit registry
Data carrier reader/writer
generic business↔wire identity translation layer
cross-Domain transaction framework
```

---

## 8. Done

M11/01 必须证明：

```text
exact five Render root exports + createRenderDomain compile
all author operations synchronous local-only
caller-owned values detached before commit
live Domain count bound
create/replace/update validation local-atomic
zIndex-only and existing-node attrs/data update accepted; structural update rejected
replace/update/emit after close reject; close idempotent
close immediately removes Domain from live desired business Registry
SDK domainId valid and never reused within Runtime instance
Node identity/tag/one-shot invariants
emit requires current business target
Frame/Data independence
Runtime cleanup
Business Definition depends only on @loomrealm/subsystem
```

ADR 0035 已按真实 M14 workload evidence 显式重开并重新冻结 target public author shape。编码阶段不得再次讨论 public shape、lifetime、identity、validation/error model；除非证明 ADR 0035、本冻结文档与 Frozen Render v1 存在 correctness contradiction。
