# ADR 0036 — Viewport State / Profile v2 proposal（历史记录）

> 状态：**Partially superseded by ADR0037**；「Viewport 不是 User Input」的问题证明仍有效；「必须新建 renderer-data/2」与 uniform `/2` rollout **已撤销**。  
> 原决定：2026-09-16；修正：2026-09-16  
> Current decision：[ADR0037 — first release direct Profile v1 correction](./0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Current contracts：[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md) · [Viewport State v1](../15-contracts/viewport-state-v1.md)

## 保留的真实问题

地图 Runtime被其他 Frame取走 InputTarget时，仍可能需要基于当前 Renderer presentation geometry更新已有的可见 RenderDomain。Frozen User Input的 Data×InputTarget×Activation×Interest×producer gate不允许把 geometry伪装成 ordinary `x.*.state`，Browser-only geometry也不能成为 Runtime authoritative camera/projection。永久以最大1080p投影令较小视口承担额外 payload/validation。Viewport应为 Renderer→Subsystem正交、readonly、retained、Runtime-scoped observation；不能修改 Main InputTarget或 Render desired-state owner。

## 已被撤销的方案部分

原 proposal 是 `renderer-data/2 = Connection1 + Input1 + Render1 + Viewport1`，同时保留 frozen 三-child `/1`、对目标产品所有 Subsystem强制统一选择 `/2`、提供两套 Profile conformance。随后 [业务边界 Review](../30-implementation/viewport-business-boundary-review-2026-09-16.md)识别 uniform rollout属于产品实施策略、Web Window采样是具体 physical composition、map gameplay不是 Core协议语义。仓库 [document governance](../00-overview/document-governance.md)要求在没有真实兼容义务时直接修正首次模型，不制造 fake v2。

因此 **ADR0037显式取代此处的 Profile v2 identity/选择及其全部 current 规范地位**：唯一目标为修正后 `loomrealm.renderer-data/1` 四 child；Viewport本身仍叫 v1。旧 proposal留在 Git history（`d0ab971d4df8626973afe0f2274b4e6a643d2c1c`），不得将此历史文件作为 current实现或测试依据。直接重置的外部兼容性核查仍是 Docs Freeze gate；如果确认存在真实使用者必须 STOP并重新立版本/迁移 ADR。

## 未改变的边界

Main仍唯一拥有 DataAuthority/Frame/InputTarget；Control/Connection wire、Input v1/Render v1 schemas与既有 writer/limits不变；Viewport message仅 geometry，不转为 Input、Main width/height或 Store；Data-only failure不自动 Runtime/Frame failure；no ACK、cross-child transaction、generic Environment manager、map-specific Core path。Map cap/settle/chunks/raster/menu行为留在 game-libs/map，性能另凭 PR0证明。具体形状、source、conformance和 maturity以 ADR0037及 current `/1`契约/qualification为准。