# ADR 0035：RenderDomain existing-node authoritative update

> 状态：Accepted  
> 日期：2026-09-15  
> 影响范围：M11 Subsystem author surface、Render publication、Renderer private Patch realization、M14/M15 requalification  
> 依赖：[ADR 0004](./0004-client-state-rendering-pipeline.md)、[ADR 0022](./0022-render-update-v1-freeze-closure.md)、[ADR 0032](./0032-game-library-example-boundary.md)  
> 实施规范：[Render 移动延迟与核心链路改造设计](https://github.com/lithdoo/loom-realm/blob/main/RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md)

## Context

M11 首次实现把 author surface 冻结为 `RenderDomain.replace/emit/close`。真实 M14 retained Map workload 已证明，普通移动只改变少量 camera/player 字段，却必须重新构造、验证、detach、编码和解析包含数百个 tile 的完整 Snapshot；当前样本中完整 Snapshot 约 `37 KiB`，等价 existing-node Patch 约 `446 B`。

该证据同时满足：

- ADR 0004 的“大型场景 State 序列化成为主要性能瓶颈”；
- ADR 0004 的“节点级 Patch 能显著降低开销且不破坏恢复和安全语义”；
- ADR 0032 的“M14 workload exposes a measurable correctness/performance gap in existing public capability”。

Render Update v1 已冻结 existing-node update Patch、zIndex、per-carrier baseline、revision、Event barrier、reconnect Snapshot 和 failure semantics。缺口只在 Subsystem author capability 与 sender realization，不需要新 wire message 或新协议版本。

## Decision

### 1. M11 author surface 增加一个 authoritative operation

Accepted target surface：

```ts
import type { JsonValue } from "@loomrealm/wire";

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
```

Package root 只新增命名类型 `RenderDomainUpdate`；三个 supporting delta/node declarations 不从 root 导出。`replace/emit/close` 保持不变。

`update()` 只表达：

- Domain `zIndex`；
- 已存在 node 的 attrs/data 顶层成员 set/remove。

它不能 insert/remove/move node，不能修改 node key/tag/children。结构变化继续使用 `replace()`。

保留 `zIndex` 是 Domain 能力闭环：它已经是 `RenderDomainState` 的 authoritative member；缺少 zIndex-only update 会迫使唯一的非结构 Domain mutation重新提交完整 roots。

### 2. `update()` 是同步 local authoritative commit

`update()` 与 `replace()` 具有相同 author boundary：

```text
validate closed author shape and lifetime
→ detach caller-owned set values
→ build isolated authoritative candidate
→ validate final Snapshot and worst-case Patch representability
→ atomic local state/work commit
→ return void
```

失败分类固定为：shape、semantic、missing/retired target、closed handle 使用 `TypeError`；hard-limit overflow 使用 `RangeError`。失败不修改 authoritative state、pending publication work 或 cursor。

Optional member 以 own-property presence 判定；显式 `undefined` 非法。空 update 非法；zIndex-only update 合法；同一调用中 node key 不得重复。完整接受/拒绝集合、4096 node-op 上限、message probe、detach 和 atomicity 以实施规范第 5 节为准。

作者仍不观察或管理：

```text
domainId / generation / revision
Snapshot / Patch / Registry
carrier / cursor / send outcome
```

### 3. Publication 复用 Frozen Render Update v1

`RenderManager` 保持完整 authoritative Domain state。成功 author update：

- 无 peer：只提交 local state，fresh peer 用 Registry + latest Snapshot；
- current Domain 未 baseline：收敛进 latest queued Snapshot；
- baseline Snapshot in-flight：其后保留 latest Snapshot，不生成未知 baseRevision Patch；
- current Domain 已 baseline：ordinary update materialize 为现有 `RenderPatchV1`；
- queue pressure：Event 可按 Frozen policy 丢弃，authoritative work 最终收敛为 latest Snapshot；
- carrier replacement、send failure、revision exhaustion和 close：沿用 ADR 0022 / M11 publication recovery。

一次 ordinary author update 保持一次 pending state work；不做 Patch algebra、自动 tree diff 或 history/replay。完整 transition、Event overflow 和 bounded coalescing 算法以实施规范第 6 节为准。

Render Update v1 仍只有：

```text
render.domains
render.snapshot
render.patch
render.event
```

本 ADR 不修改 Data/Wire schema、direction、hard limits、ACK/replay 或 protocol version。

### 4. Renderer 和 Map 变化保持 private/downstream

Renderer 可为 update-only Patch 使用 private copy-on-write builder，但 public Store/Presentation 语义、revision continuity、逐 op candidate validation 和 atomic commit 不变。Object identity 只允许作为 private structural-equality fast path，不成为 M13 contract。

Map 继续是 `game-libs/map` business consumer。camera、tiles、motion、projection window 与 animation 不进入 Core；Map 只通过 public `RenderDomain.update()` 提交 authoritative delta。M15 继续由 Hostra 拥有 Electron/BrowserWindow；qualification observation hook 不携带 application authority。

## Supersession Boundary

本 ADR 只修正：

- M11/01 把 exact author operations 永久冻结为 `replace/emit/close` 的结论；
- M11/02 把 Patch-vs-Snapshot 完全留作 sender heuristic、导致 author 无法表达 retained existing-node delta 的结论。

以下事实不被 supersede：

- ADR 0004 的 declarative state / local presentation authority split；
- ADR 0006 的 Frame/Render lifetime decoupling；
- ADR 0022 的 Frozen Render Update v1 wire semantics；
- ADR 0031 的 business-owned Web Component boundary；
- ADR 0032 的 framework/game-library/example ownership；
- ADR 0034 与 frozen Hostra M15 physical design。

## Qualification and Current Status

本 ADR 是 docs-only accepted correction。接受本 ADR 不把尚未实现的 `update()` 宣称为 Current，也不使旧 executable subject 的历史 Closed 失效。

第一个改变 executable behavior 或 qualification input 的 commit 建立新 subject。最终必须在同一个 implementation subject SHA 上完成：

```text
M11 local + hosted Node 20/24 qualification
→ M13 regression
→ M14 exact-local + hosted Node 20/24 qualification and formal closure
→ M15 frozen-Hostra local + hosted qualification and formal closure
```

M14/M15 的新 subject 是 downstream requalification，不是 M13 public design或 M15 physical design reopen。Live status 与 evidence 仍分别归现有 qualification ledgers所有。

## Rejected

```text
author-visible wire Patch/revision/domainId
Render Update v2
automatic full-tree diff
generic replication/backpressure framework
public Render Store/subscription
Core camera/tile/motion vocabulary
generic projection transaction
second qualification game/manifest/Runtime/browser path
```

## Consequences

- Author API 增加一个 operation 和一个 root named input type；结构化实现 `RenderDomain` 的 mock/test double 需要更新。
- Full `replace()` 继续是初始、结构变化和恢复基线能力。
- Ordinary existing-node movement 可以避免完整 retained state 的重复工作。
- Data/Wire compatibility 与 recovery/security model 保持不变。
- M11、M14、M15 必须对新 subject 重新 qualification，不能复用旧 SHA 的 PASS 宣称新实现 Closed。

## Reopen

只有 implementation evidence 证明本 target capability 仍无法在 Frozen Render v1 下满足 correctness/security/representability，或真实 consumer 证明需要结构型 author mutation，才允许重新评估。

不得因 API 对称、未来猜测、代码复用、测试便利或性能阈值未达成而自行扩张 public surface；未达性能 gate 时按实施规范停止并提交 profile/follow-up。
