# Renderer → Subsystem Viewport Capability

> 层级：系统架构  
> 状态：**Active Design / Direct-v1 Core Docs Frozen 2026-09-17（subject `4cbf620`）**  
> 决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；原 [ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md) 的 v2 identity部分已被撤销。  
> Formal SSOT：[Viewport v1](../15-contracts/viewport-state-v1.md) · [revised Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> Qualification：[唯一 v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)；最近复核：2026-09-16

此架构文档**只**负责 authority/role/lifetime/surface boundary；exact wire、diagnostic和callback以正式契约为准，产品部署和具体 DOM source由物理 composition拥有，地图算法由 game library拥有。旧 `/2` proposal仅历史记录。

## 1. Real cross-role capability gap

Frame可被另一 Frame取走 InputTarget而仍有可见 live RenderDomain。Renderer的presentation geometry在此期间仍可能变化；User Input的 Data×InputTarget×Activation×Interest×producer gate不能承担这份非用户动作的环境事实。Browser自有 geometry不足以驱动业务 Runtime的 authoritative presentation projection，永久 max-envelope又增加不必要的消费者 payload。**需要的是只读尺寸观测，不是 Input bypass或 Environment framework。**

```text
Renderer physical composition designates one logical surface
→ Renderer observes its CSS logical size
→ Viewport State v1 over revised renderer-data/1
→ Subsystem Runtime retains last accepted observation
→ readonly scope.viewport
→ individual business consumers decide presentation policy
→ existing RenderDomain author API → Renderer Store/Projector/WC
```

## 2. Ownership matrix

| Owner | Owns | Does not own |
|---|---|---|
| Main | current Session/Renderer/Frame/InputTarget/DataAuthority/profile identity | geometry sample, map camera, rollout internals |
| Renderer + trusted physical composition | one explicitly designated surface, raw observation + publication | map policy, Input authority |
| Data Profile v1 | full four-child combination, preflight, exact demux, single writer/terminal | geometry business interpretation, cross-child transaction |
| Subsystem host | Runtime-scoped last accepted geometry + subscriber delivery | physical Window/DOM, map algorithm |
| Business runtime | decides presentation state based on its own committed business facts | physical geometry authority, Main identity |
| Business WC | physical realization/ShadowDOM/Canvas and local resource retry | authoritative Store/managed DOM mutation |

`/1`是唯一目标完整身份（Connection1+Input1+Render1+Viewport1）；旧三-child `/1`是 historical executable，不能与新版 peer混配；不创建 `/2`或双模式。Main拥有 profile选择这一通用 authority；本次产品统一部署修正版 `/1`是 [implementation ledger §4](../30-implementation/viewport-profile-v1-qualification.md) 的 rollout，不是所有兼容 Profile 实现的 protocol MUST。

## 3. Single designated surface / physical source split

**Core承诺：** 当前 Renderer participant只有一个物理 composition明确指定、同身份期内稳定的 logical presentation surface；传其 positive safe integer CSS logical width/height；每 current Subsystem获得同 raw值；不携带 DPR/focus/map、无多 pane/router/`surfaceId`。不同 surface切换不得在同 Renderer participant内静默重绑定。

**当前 Web product决定：** Desktop/PWA composition指定 document layout viewport，用 `Window.innerWidth/innerHeight` floor进行观察，source stop、queued callback、fresh Renderer/source identity都必须 fenced；实际分配给业务的 content box/居中与letterbox由该产品/业务集成测试验证。这**不是**通用 Viewport child wire要求任何实现依赖 DOM Window；也不能声称任意 sidebar/host box总等于 layout viewport。未取得合法样本不造0/null/default，DPR-only不改逻辑尺寸。

## 4. Runtime observation & lifetime

```ts
interface ViewportSize { readonly width: number; readonly height: number }
interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
interface SubsystemScope { readonly viewport: Viewport }
```

Viewport object Runtime-scoped，initial null；current是 detached/immutable last accepted observation而非 current carrier/Renderer/paintability证明。Data loss保留 last、fresh carrier自己发布最新合法 baseline；fresh G/Renderer只允许 matching current authority traffic更新，old rAF/carrier inert。同值无callback、异值先更新再callback；subscribe同步首次含null、throw/rejection隔离、unsubscribe幂等、terminal inert。Frame suspend/InputTarget/Interest/physical keyboard focus不影响 geometry delivery。

每 current carrier publisher至多一个 writer-admitted/in-flight viewport unit + 一个 pending latest size，未 admitted burst覆盖 pending，fresh cursor不迁移；不能仅靠下游map settle避免 shared writer overflow。无 ACK、revision、global priority manager、Control/Data atomic barrier。

## 5. Cross-layer permission boundary

Receiving geometry **never grants Frame mutation or Input authority**，也不让 viewport receiver直接提交 Store/Projector/DOM。业务若要改变 presentation，只通过已有 RenderDomain。此处不定义玩家移动、碰撞、菜单暂停、转场、map-special Frame lifecycle API；有真实消费端证据后单独在业务/lifecycle review处理，不能偷在 Viewport里加 Frame permit。WC resource/raster retry归 Web Presentation consumer；same-generation reconnect不是 UI retry trigger。

## 6. Governance / non-goals

Core Docs Freeze：外部兼容义务核查、ADR0037 supersession、formal `/1`+Viewport v1、两份 executable-ready conformance、跨文档一致与 docs SHA；不要求先有 executable PASS。实现后新 SHA/资格 ledger证明，map自己的 payload/Core residual/Browser latency PR0单独处理。

拒绝：另发 `/2`、old three-child compatibility parser、Main width mirror、Input bypass、Frame viewport interest、generic Environment/manager、multiple surfaces/router、DPR bundle、cross-child ACK、map-specific Core fast path或以产品统一部署上升为 universal protocol MUST。