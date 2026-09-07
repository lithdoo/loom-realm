# M11 Render Qualification

> 状态：**Implemented / Qualified / Closed**
> 日期：2026-09-07
> 规范入口：仓库根目录 `M11_05_QUALIFICATION_CLOSURE.md`
> 最终评审：[M11 Render 最终闭环评审结论](./m11-final-closure-review.md)
> 协议：`loomrealm.render-update / 1`
> Fixture：`fixtureSetRevision = 1`

M11 production architecture、Render representation validation、Subsystem-owned business Render authority、current Data publication、Renderer internal replica 与 Hostra/Desktop same-generation Render vertical 已实现并重新通过最终闭环评审。

DOM/Canvas/WebGL presentation、Content resolution 与 Hostra/PWA transport equivalence仍不属于 M11。

## Current Executable Evidence

Fail-closed catalog parser 直接读取 Frozen Required blocks；role-specific runner 分别执行 sender/receiver assertion callback。当前 source-derived 结果：

```text
unique fixtures       = 203
subsystem-sender      = 82
renderer-receiver     = 185
role evidence pairs   = 267
transport             = 0
```

这些数字由 executable catalog/audit 派生；expected、registered、executed 与 passed role/fixture pair sets 严格相等。

## Requalification Closure

最终评审要求已一次完成：

```text
production Render representation validation closure
strict fail-closed normative catalog extraction
(role, fixture) evidence identity
complete exact/one-over hard-limit matrix
discriminating role-specific production-seam assertions
```

不得为本次修复引入新的 Render authority、Runtime/Session/Connection abstraction、generic validator service、scenario DSL 或 conformance framework。

## Implemented Boundaries Retained

```text
@loomrealm/subsystem
    exact RenderNode / RenderDomainState / RenderEvent / RenderDomain author types
    SubsystemScope.createRenderDomain
    synchronous validate → detach → atomic local commit
    business Domain/Node one-shot identity and explicit close
    Snapshot-first bounded current-carrier publication

@loomrealm/renderer
    one internal Render replica per existing Data slot identity
    atomic Registry/Snapshot/Patch application
    transient Event deliver/drop trace
    same-generation identity history across carrier and Control participant replacement
    no public Render Store/subscription API
```

Sender v1 继续使用 Frozen v1 允许的 full-Snapshot fallback，不引入 diff/reconciler。Renderer Receiver 继续实现完整 Frozen Patch semantics。

## Vertical Evidence Retained

现有 Desktop/Hostra vertical 已证明：

```text
Main DataAuthority → Desktop DataConnectionBroker → Hostra SubsystemDataPeer
→ RenderManager publication → RendererDataPeer → internal Render replica

create → Registry → Snapshot
replace → next authoritative commit → Event
same-generation carrier close → fresh Registry/Snapshot
old Event is not replayed
business Domain survives Data reconnect
close → Registry removal → replica retirement
```

该 vertical 继续作为 requalification 的 integration evidence，不需要重写 production composition。

## Root Gate

唯一 closure command 仍是：

```text
npm run test:m11
```

最终必须在 Node 20 + Node 24 对同一 root gate通过，并由 executable output重新生成 current qualification record。

```text
M11 Render = Implemented / Qualified / Closed
M16 transport-equivalence = not claimed
```
