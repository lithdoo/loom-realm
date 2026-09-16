# Renderer → Subsystem Viewport Capability

> 层级：系统架构  
> 状态：Active Design / Candidate for Freeze  
> 稳定程度：ADR0036 Accepted；Viewport v1/Profile v2 formal contracts revised / Not Frozen；qualification pending  
> 主要定义：geometry ownership、single-surface authority、Runtime-scoped author observation 与 data/physical lifetime  
> 依赖：[System overview](./system-overview.md) · [Protocol layers](./renderer-subsystem-protocol-layers.md) · [Subsystem model](./subsystem-model.md) · [ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> Normative candidates：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文只固定 owner 与 dependency，不重复正式 wire/callback细节；有冲突以 formal contract为准并停止实施。

## 1. Capability gap / narrow solution

Map Frame在 child menu/dialog取得 InputTarget时可能仍有可见 live RenderDomain；Window resize属于 Renderer presentation geometry，不属于 InputTarget/Activation/Interest。因此禁止 `x.*.state` User Input与 viewport-specific Input bypass。Browser-only geometry不足以驱动 Runtime authoritative camera/projection；永久最大视口 envelope又让小窗口承担 1080p payload/validation。增加一个 Renderer→Subsystem **readonly、retained、Runtime-scoped size capability**，map仍根据实际 accepted size选择投影。

```text
current Renderer document layout viewport
  → trusted physical size observation
  → Viewport State v1 / Profile v2 on each current Subsystem Data carrier
  → Subsystem host last accepted observation
  → scope.viewport readonly
  → business map policy/camera/chunks
  → existing Render author API / Store / WC
```

## 2. Authority and lifetime

| Owner | Owns | Does NOT own |
|---|---|---|
| Main | Session/Renderer currentness, DataAuthority `{S,G,P}`, Frame/InputTarget | width/height, map camera |
| Renderer | one current document layout viewport physical observation and publisher | map projection, InputTarget, Main authority |
| Data Profile v2 | exact child routing, ordered carrier, terminal | size/camera business policy, cross-child transaction |
| Subsystem host | Runtime-scoped last successfully accepted size + subscribers | DOM object, layout engine, physical source |
| Business map | normalized accepted viewport, camera/window/Render policy | Renderer physical sample/currentness |
| Business WC | derived raster/layout/physical retry | Store/Render authoritative desired state |

Viewport object lifetime为 Subsystem Runtime；wire publication cursor为 per current Data carrier；physical source为 current Renderer document。Data retire保留 last observation；fresh carrier/fresh Renderer仅 matching `(S,G,P)` source可重新基线收敛；old queued callback/carrier must inert。Frame suspend/close和 Activation变化不清空 capability。`current !== null`不证明 carrier/Renderer/paintability存在。

## 3. Exactly one layout viewport in v1

v1同一 Renderer participant只有一个 logical presentation surface：当前 document的 **layout viewport `window.innerWidth/innerHeight` CSS logical pixels，floor到 positive safe integers**。Desktop/PWA都遵守该 observable定义，不能混用 visualViewport、screen、DPR或任意 element box。每个 current `/2` Subsystem connection获得相同 raw size。未观察到合法 size时不合成 0/null/default wire；已观察的最后值在短暂失联期间保留。多 window/pane独立尺寸属于未来显式新版，不给 v1增加 `surfaceId`、Frame routing。

## 4. Narrow author API

```ts
interface ViewportSize { readonly width: number; readonly height: number }
interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
interface SubsystemScope { readonly viewport: Viewport }
```

`current`是 detatched/immutable last accepted value；`subscribe`同步首发一次（含 null），然后仅 structural change；callback前已经更新current。unsubscribe幂等，callback throw/thenable reject各自 local containment，不阻塞 Data reader/其他 listener，Runtime terminal后 inert。不增 `get()+onChange`、manager、source、Renderer identity或 transport到 public author API。Profile `/1` explicit compatibility中若从未接受 v2 observation，stable capability为 null；canonical `/2`无 silent downgrade。

## 5. Publication / loss / recovery

Viewport是 self-contained latest retained state，非事件流。每 current carrier最多一个 writer-admitted/in-flight viewport unit + 一个未 admitted latest slot；resize覆盖 pending，已 admitted不可撤回，fresh carrier独立发送 admission时最新合法 baseline。普通合法 burst不得靠填满 shared writer触发 Data fatal，也不得永久阻断 Input/Render。具体 admission/terminal、diagnostic `protocol:"viewport"` 由正式 contracts定义；不增 ACK、revision、generic priority/Env service。

Fresh carrier/Renderer尺寸相同不重复通知author，不同则更新/通知；fresh合法样本尚未到达时保留last或初始null，不以旧值声称当前可绘制。Control/Viewport/Render之间没有 super-snapshot/事务。真正改变地图画面须 map Runtime用既有 RenderDomain API提交，而非 viewport receiver直接改 Store/Projector。

## 6. Failure and scope guard

Malformed viewport child Data-fatal，仅 retire Data，不自动 Runtime/Frame failure；callback失败局部 containment。Viewport callback不能代替 suspended Frame的 gameplay mutation permit：它可依据**已提交 world facts**更新 live RenderDomain的 presentation projection，但不能驱动移动、collision、transfer、Frame call；没有足够生命周期信号则 map必须明确 STOP/单独最小 capability review，不得偷读 Main/DOM或放宽 Input gate。Browser raster failure自己重试既收数据，same-generation reconnect不保证再次投递 equal RenderData。

## 7. Freeze route / non-goals

Core Docs Freeze只检查 ADR、architecture、两份 formal contract和**可执行测试规范**，不等待实现 PASS；其 subject由 [qualification ledger](../30-implementation/viewport-profile-v2-qualification.md) 记录。之后实现/hosted/product通过才称 capability Qualified。Map payload/Core full-state validation/Browser raster/latency必须经 map PR0独立证明才能 Map Docs Freeze。

严禁：Main几何镜像、InputTarget bypass、per-Frame viewport、generic Environment manager、跨 child ACK/barrier、profile negotiation、DPR bundle、多 surface routing、map-specific Core fast path、修改 Frozen `/1` acceptance。