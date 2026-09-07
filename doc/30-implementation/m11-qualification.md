# M11 Render Qualification

> 状态：**Implemented / Qualified / Closed**
> 日期：2026-09-07
> 规范入口：仓库根目录 `M11_05_QUALIFICATION_CLOSURE.md`
> 协议：`loomrealm.render-update / 1`
> Fixture：`fixtureSetRevision = 1`

M11 已关闭 Subsystem-owned business Render authority、current Data publication、Renderer internal replica，以及 Hostra/Desktop same-generation Render vertical。DOM/Canvas/WebGL presentation、Content resolution 与 Hostra/PWA transport equivalence 不属于本里程碑。

## Executable Catalog

正式 runner 直接读取 Frozen [Render Update v1 Conformance Profile](../15-contracts/render-update-conformance-v1.md) 第 5–20 节每节首个 Required code block，不维护第二份 fixture-name 清单；同名 fixture 合并 claimed role evidence。

```text
required unique fixture entries = 202
explicit executable fixture mappings = 202
executable groups = 8
qualification role records = 266

subsystem-sender = 81
renderer-receiver = 185
transport = 0
```

Coverage audit 强制验证 normative catalog 唯一性、group 全覆盖、fixture 注册/执行/通过集合相等、每条 fixture claimed role 非空，且 M11 不产生 transport evidence。每个 fixture ID 绑定独立 callback；每次 callback 都创建新的 production sender/receiver 状态并验证 observable outcome，不缓存或扩散 group 结果。

## Implemented Boundaries

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

Sender v1 intentionally uses the allowed full-Snapshot fallback instead of introducing a diff/reconciler. Renderer Receiver nevertheless implements and qualifies complete Frozen Patch semantics.

## Vertical Evidence

The real Desktop/Hostra test proves:

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

## Root Gate

```text
npm run test:m11
```

The gate contains the complete M10 regression, M11 package tests, Render Update fixtureSetRevision 1 sender/receiver qualification and audit, public-boundary checks, and the real Desktop/Hostra Render vertical.

Closure claim:

```text
M11 Render = Implemented / Qualified / Closed
M16 transport-equivalence = not claimed
```
