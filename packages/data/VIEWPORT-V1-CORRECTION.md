# `@loomrealm/data` Viewport /1 实施修订单

> 状态：Implemented on `cursor/resize-viewport` / Docs Frozen subject `5d74590…` / architecture qualification pending final SHA evidence。2026-09-18。  
> 唯一规范：[Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md)、[Viewport State v1](../../doc/15-contracts/viewport-state-v1.md)、[Profile revision3 conformance](../../doc/15-contracts/renderer-data-profile-conformance-v1.md)；[冻结与 Agent 账本](../../doc/30-implementation/viewport-core-freeze-ledger.md)。

`DESIGN.md` 是已实现 M8 三-child 的 package-local **历史实现说明**；不应拿其中 `DataProtocolFamily = profile|input|render`、`Subsystem inbound only ordinary User Input`、`Renderer outbound only Input`、旧 `RendererDataMessageV1` union、原 Profile revision2 等旧代码截面覆盖本修订的目标。无需为纠正上述过期段落重写其余 20KB M8 实现叙述，也不得因此宣称现有代码已经支持 Viewport。

**仅在本轮实施时应用以下确定增量：**

```text
model.ts
  ViewportStateV1 exact {type:'viewport.state',width,height}
  RendererDataMessageV1 = UserInput | RenderUpdate | ViewportState
  DataProtocolFamily += 'viewport'
  SubsystemDataHandlers += onViewportState
  RendererDataPeer += readonly viewport.publishState(message): void

viewport-codec.ts (new)
  exact positive safe integer wire validator; child error family viewport

profile-codec.ts / runtime.ts / peers.ts
  exact type + direction + error family demux
  reuse existing single common preflight, reader and serialized writer
  per-peer bounded viewport publisher (1 inFlight + 1 latest pending)
  terminal/old-peer fencing; fresh peer always fresh baseline

index.ts
  root-only public exports; no /viewport npm subpath
```

`viewport.foo` 与无效 JSON 属于 profile fatal；已识别的合法 JSON `viewport.state` 的 schema/direction 错误属于 viewport fatal；本地 JS caller invalid 属于 local-fatal。Input/Render child 的旧字段、barrier、boundedness 不变。现有 writer `MAX_PENDING_SENDS=1024` 不修改，不新增另一个 reader、writer、ack、generic queue、DOM 依赖、Map 或 Main API。

以上是包内导航，不是另一个规范或算法；API exact 类型与 A→B→A 转移只从正式 Viewport child 读取。正式冻结前不能开工，资格必须在最终 executable SHA 上跑旧回归 + revision3/Viewport fixture + 真实跨包 vertical。
