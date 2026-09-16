# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8/M10/M11/M12/M13 historical implemented baseline；M13 presentation frozen；**Viewport v1 / revised Profile `/1` candidate not implemented**  
> 主要定义：Renderer currentness、Render Store、trusted ResourceClient、M13 private Projector和 proposed viewport physical source integration  
> 依赖：[Rendering](../../10-architecture/rendering-system.md) · [Viewport architecture](../../10-architecture/viewport-capability.md) · [Profile v1](../../15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../../15-contracts/viewport-state-v1.md) · [Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md) · [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md) · [ADR0031](../../decisions/0031-business-owned-web-component-projection.md) · [ADR0037](../../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

本模块只描述 role/implementation placement。旧三-child `/1` executable仍在当前代码中；新四-child `/1`必须等Docs Freeze与new executable subject，不能把本计划描述为Implemented/Qualified。不实现 `/2` 或双 parser。

## 1. Renderer shape

```text
@loomrealm/renderer
└── ControlHolder
    ├── current Control peer/snapshot
    ├── per-subsystem Data slots
    │   ├── current revised Profile /1 peer [candidate]
    │   ├── Input Producer/lease gate (M10)
    │   ├── RendererRenderStore (M11)
    │   └── Viewport child sender (M? correction; no InputTarget gate) [candidate]
    ├── current Renderer participant's one designated physical surface observation [candidate]
    ├── M12 trusted/private ResourceClient
    └── M13 package-private presentation integration
        ├── Control+Store reevaluation only
        ├── per-subsystem eligibility and thin Projector
        └── PresentationResourceClient façade

Concrete Renderer Web Window composition:
  product-private Config + prepared Content
  → exact MIME / href/src binding → ordered JS/CSS → window.onload
```

**Physical source selection belongs Platform/Product composition**, not universal Renderer Profile or `game-libs/map` contract。当前Desktop/PWA Web product指定document layout viewport并用`Window.innerWidth/innerHeight` floor取CSS logical positive safe size；须针对真实业务可用content box/letterbox验证。Renderer只复制raw geometry至每个current Data slot，不执行map camera/chunks/resize settle。

## 2. Existing M11/M12/M13 frozen semantics

M11 Store为current Data slot/generation持有registry/baseline/revision/tree/one-shot history；same G carrier replacement fresh Render baseline。M12 trusted private resource read以 namespace/key/expectedVersion→bytes+MIME/actualVersion，不暴露origin/token/path。M13两种reevaluation source**仅** committed Control topology 或 successful current Render Store commit；Viewport observation不是第三个Projector authority，除非业务先通过既有RenderDomain提交。失败Render mutation/Event无projection effect，不公开 EventBus/observer/PresentationState。

## 3. Viewport realization [candidate]

Trusted Renderer source的lifetime与current Renderer participant一致，on initial legal sample、physical resize/recovery时更新one raw size；invalid/zero不发default。旧 Renderer stop/queued rAF/source callback、retired carrier必须被identity/current binding fence。每current修正`/1` carrier独立baseline，在shared writer admission之前one admitted/in-flight+one latest pending slot；Input/Render继续使用原single writer/reader/terminal，无可选`/2`路径。Frame/InputTarget、focus或Input Producer availability不可gate geometry。

Viewport source不管理WC geometry、Store、DOM、Main authority。数据接受端是Subsystem readonly retained `scope.viewport`；connection terminal只Data retire。未来多独立pane需要显式新设计，不偷加surfaceId。

## 4. Per-subsystem presentation eligibility / lifecycle（Frozen M13）

```text
current Session + DataAuthority
AND matching current Data carrier/Store
AND registrySeen and every current Domain baselined
```

Same G carrier loss仅冻结affected subsystem DOM，其余继续；partial baseline隐藏；complete baseline reconcile一次。DataAuthority removed→立刻remove对应DOM；fresh G/Session→retire旧elements/等待new matching baseline；Control terminal无committed replacement→freeze last。没有第二个PresentationState/currentness machine。

## 5. Projector / WC ownership

Full identity `(Session,subsystemKey,generation,domainId,key)`；same identity same HTMLElement，move/reparent/reorder复用；fresh Session/G fresh universe。Tags→business CustomElement、attrs→managed host attrs、children→managed ordered light DOM、context→receiveRenderContext、data→receiveRenderData；root order按subsystemKey lexical、zIndex、domainId lexical、roots。无Domain wrapper、global layer或CSS z-index engine。新element construct→context→first insertion→attrs→data；已有element结构/attrs→data仅retained JSON changed。Context每element最多一次；callback throw不会令相同data自动重投递；WC自行对资源/raster失败做Window-local retry。

Structural preflight在首次managed DOM mutation前确认所需tags均registered；任一unknown→本次zero DOM mutation/preserve last/latch Window-local structural failure，只fresh Window恢复。Ordinary callback/resource/DOM failure presentation-local，不反转Store/authority。

## 6. Bootstrap / private API boundary

Product Window composition拥有Config source、prepared Content、href/src binding、Window lifecycle，JS essence `text/javascript`、CSS `text/css`；Renderer可提供纯/private helper但不增universal loader port或`@loomrealm/presentation`。Window teardown abort in-flight resource reads，后续well-formed reads reject `CONTENT_CANCELLED`。M13禁止root-export RenderStore/PresentationState/Topology/Adapter、Identity service、Resource credential、component registry。只允许 package-private element identity mapping/data bookkeeping/structural latch/resource lifetime。

## 7. Qualification/phase

M13原有 `M13_01..05` 资格矩阵仍按M13 ledger；新增Viewport四-child先走 [v1 qualification ledger](../../30-implementation/viewport-profile-v1-qualification.md) 的 compatibility/Docs Freeze→new executable subject→revised v1 conformance+M13 regression+Desktop/Hostra physical source。必须实测 current Window布局与 allocated business surface对应，不能因 source有数据声称map性能PASS。Map raster/epoch/View-Sprite stage仍纯 `game-libs/map`，Framework不实现业务重绘或WC ACK。