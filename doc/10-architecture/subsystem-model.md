# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input closed + M11 Render surface frozen/current subject requalification pending / M12 Content author slice frozen / Viewport Docs Freeze HOLD**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Render/Content author projections、Viewport 只读观察与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[存储与内容系统](./storage-system.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> Viewport 目标：[Viewport State v1](../15-contracts/viewport-state-v1.md)；状态以[账本](../30-implementation/viewport-core-freeze-ledger.md)为准。  
> 最近复核：2026-09-18

---

## 1. Role Boundary

Subsystem Runtime 负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest
retained author-safe Input State + business delivery
outbound Frame call/return role
business Render Domain authoritative state + transient Event intent
readonly ContentClient usage
Runtime-scoped retained readonly Viewport size observation（目标，未实施）
```

Subsystem 不负责 Game/Platform manifest、executable selection、Process/Worker、Main public authority、Renderer hosting、DataConnectionBroker、Content physical service/credential/storage 或窗口测量。

---

## 2. Definition Module / Platform Boundary

```text
Platform LaunchPlan
→ selected Definition Module
→ Host-owned Runner
→ role-local capabilities
→ @loomrealm/subsystem/host
→ Business Definition
```

Business Definition source 只依赖：

```text
@loomrealm/subsystem
```

不得直接依赖：

```text
@loomrealm/subsystem/host
@loomrealm/data / runtime-control
@loomrealm/fsdb / fsdb-http
platform-ports
game-package / launcher
Node/Browser transport
```

Hostra/PWA artifact 可以不同，但 author ABI 和 business-observable semantics 必须相同；Viewport 不暴露 DOM/Window。

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle
    Frame / Stack / Activation / InputTarget
    transaction/failure unwind
    DataAuthority

Subsystem
    business state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / delivery
    business Render Domains
    Runtime-scoped last valid Viewport observation（目标）

Renderer
    participant-scoped viewport source（目标）

Platform
    executable + physical hosting/provisioning
    Content service/binding/credential
```

Runner/module/transport/Content/Viewport ownership 都不能产生第二份 Frame/Input/Render authority。Viewport 观察不受 InputTarget/Frame/Activation/Interest/focus 过滤，不授予 mutation permit。

---

## 4. Runtime / Frame

Startup：

```text
Runner loads planned module
→ validates ABI
→ constructs required role capabilities including M12 ContentClient
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

如果 required ContentClient 在 business initialize 前无法构造，属于 Runtime bootstrap failure。

Viewport 目标：在 definition factory 前构造一份稳定的 `scope.viewport`，initial current=null；未注入 source 或无 Data 时仍能构造，不合成默认尺寸。

`ready != Data exists != Renderer exists != Input/Render/Viewport baseline exists`。

Frame author capability 只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author 不见 activationId/generation/platform material；Viewport 不在 Frame context 内。

---

## 5. FrameOutcome / Call

业务结果：

```text
completed(value)
cancelled()
failed(error)
```

Accepted child call 会 suspend/revoke caller Activation，child 完成后 surviving caller 使用 fresh Activation。

只有明确 pre-commit recoverable rejection 可以 typed reject 并确认 same current Activation 继续；timeout/loss/divergence 等 ambiguous/fatal 绝不重新进入业务 continuation。

M10 已冻结：known-no-commit + same Activation reopen 时 retained Input State synchronous local convergence 先于 recoverable `frame.call` rejection observable。

---

## 6. Mutation Gate

每个 local Frame Context 有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal 阻止 ordinary business mutation。

Input：

```text
same-current-Activation pending mutation
    .state → retain latest, suppress delivery
    .event → drop

known-no-commit reopen
    → deliver current retained State
    → then recoverable rejection observable
```

Render Domain lifecycle 不由 mutation gate/Frame 自动创建或销毁。Viewport 观察不受 mutation gate 限制，但不授予业务修改权限。

---

## 7. Input Author Projection — M10 Closed

唯一 creation seam：

```text
SubsystemScope.createInputListener({frame,channels})
```

固定：

```text
channels/setChannels = Interest contribution
on/unsubscribe       = callback registration
setChannels preserves dormant registrations
close/unsubscribe idempotent
retained State detached/immutable
Event never replay
stable handler snapshot/order
async handler Promise never becomes Data-reader flow control
```

Fresh Activation 不复用 old Input State/Event；fresh Data carrier 隐藏地 republish current Desired Interest 并等待 fresh State baseline。

---

## 8. Render Author Projection — M11 Surface Frozen / Current Subject Requalification Pending

> **Current：** `RenderDomain.update()` 的 current implementation subject 是 `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`，author surface 保持冻结，本地 `npm run test:m11` 已通过，hosted Node 20/24 尚待复验。旧 [M11 run 34998417265](https://github.com/lithdoo/loom-realm/actions/runs/34998417265) 仅证明 `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`。

Exact surface：

```ts
export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly {
    readonly key: string;
    readonly attrs?: { readonly set?: Readonly<Record<string, string>>; readonly remove?: readonly string[] };
    readonly data?: { readonly set?: Readonly<Record<string, unknown>>; readonly remove?: readonly string[] };
  }[];
}

interface SubsystemScope {
  createRenderDomain(initialState: RenderDomainState): RenderDomain;
}

interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

Accepted target 的 Current 实现已包含 `RenderDomainUpdate` root type 与 `RenderDomain.update(update)`；它覆盖 Domain zIndex 和 existing-node attrs/data 顶层 members，结构变化仍 `replace()`。它不暴露 domainId/revision/Patch/carrier，不改变下述 authority/lifetime，也不把 Map camera/tiles/motion 带入 architecture contract。

所有 author operations synchronous local-only：

```text
validate → detach caller value → atomic local commit / bounded Event offer
```

固定：

```text
live business Domains <= 256
SDK domainId author-invisible / Runtime-instance no reuse
business Node key Domain-lifetime one-shot
Frame close/suspend != Domain destroy/hide
Data retire != Domain destroy
Event no future-carrier replay
```

M11 Renderer Store internal-only；DOM/Canvas/WebGL presentation 属于 M14。

---

## 9. Content Author Projection — M12 Frozen

`SubsystemScope` exact 新增：

```ts
readonly content: ContentClient;
```

M12 author root 只暴露：

```text
ContentClient.record(namespace,key,{signal?})
ContentClient.resource(namespace,hierarchicalResourceKey,{signal?})
ContentRecord / ContentResource
ContentReadOptions
ContentReadError / ContentReadErrorCode
```

Author 不提供：

```text
installationId
contentVersion request selector
manifest()/group()/head()
raw fetch / Response / Headers
URL builder / bearer
filesystem path / FSDB handle
```

返回 `contentVersion` 精确为：

```text
sha256:<64 lowercase hex>
```

Local arguments 在 HTTP 前同步验证；invalid usage → `TypeError` + zero HTTP。Already-aborted valid signal → returned Promise rejects `ContentReadError("CONTENT_CANCELLED")` + zero HTTP。

Returned JSON/`Uint8Array` 必须与 internal cache ownership 隔离；caller mutation 不能改变 future reads。

普通 Content rejection：

```text
!= Runtime failure
!= Frame failure
!= automatic Frame unwind
```

Business 自行决定 fallback/retry/failed outcome。

如果 M13 出现第一个真实 `group()` author consumer，再显式最小 reopen；不得 raw Content/FSDB 旁路。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    owns Frame Context / frame.signal

Activation lifetime
    owns effective Input lease facts

Runtime lifetime
    owns SubsystemScope / ContentClient / business RenderDomain registry
    owns stable Viewport readonly manager（本次修订目标）

Data carrier lifetime
    owns connection-local Input/Render/Viewport publication baseline（Viewport 目标）

Renderer participant lifetime
    owns one Viewport source and latest valid sample（Viewport 目标）
```

因此：

```text
Frame suspend/close != ContentClient/Viewport replacement
Activation change   != ContentClient/Viewport replacement
Data reconnect       != ContentClient/Viewport replacement
Frame close          != RenderDomain close
Data retire          != business RenderDomain destroy
```

Runtime terminal 最终 settle/abort owned work 并清理 live author resources；Viewport manager 取消监听。

---

## 11. Data Plane

Subsystem SDK 只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
→ @loomrealm/data peer
→ InputManager / RenderManager / ViewportManager（目标） role behavior
```

Input/Render/Viewport managers 不得竞争 raw carrier。Content 不是 Data application protocol，也不复用 M9 Data provisioning IPC。

---

## 12. Portability / Error Boundary

Business portability target：

```text
@loomrealm/map → @loomrealm/subsystem
```

错误分域：

```text
business validation            → FrameOutcome.failed
pre-commit call rejection      → typed local error
Input handler failure          → local containment
Render author misuse/limit     → TypeError / RangeError
Content author misuse          → synchronous TypeError
Content ordinary read failure  → ContentReadError, caller-local
Viewport listener throw/reject → local containment, not Data protocol fatal（目标）
Control ambiguity/fatal        → Runtime failure
Data protocol fatal            → Data retirement
module/capability bootstrap     → Runtime bootstrap failure
```

Platform path/token/ticket/internal stack 不得泄漏给业务。

Viewport author API 仅 `scope.viewport.current` / `.subscribe()`，精确调用语义见[Viewport State v1](../15-contracts/viewport-state-v1.md)；不改变 M13 Projector 或 business Render Domain。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Main 独占 public Frame/Activation/InputTarget/DataAuthority；
3. Business Definition 只依赖 `@loomrealm/subsystem`；
4. M10 Input、M11 Render、M12 Content、Viewport 各有明确 lifetime/ownership；
5. ContentClient 是 Runtime-scoped readonly capability，不是 Repository/service locator；Viewport 是 Runtime-scoped readonly observation，不是 authority；
6. Content 与 executable/FSDB/HTTP physical capability 分离；
7. Render authoritative Domain 独立于 Frame/Data carrier；
8. ordinary Input callback/Viewport listener/Render author/Content read failure 不自动升级 Runtime/Frame；
9. Hostra/PWA physical 差异不得改变 author-visible semantics；
10. M13 作为真实业务 consumer 验证既有冻结边界，而不是重新定义它们。