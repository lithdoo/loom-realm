# ADR 0036：首次发布前直接修正 Profile /1，增加独立 Viewport State

> 决策：**Accepted direction / 2026-09-18 项目负责人授权直接修改现有协议**。正式契约冻结及独立终审仍由 [freeze ledger](../30-implementation/viewport-core-freeze-ledger.md) 记录；本 ADR 不宣称生产代码已实现。
> 更新：[ADR 0025](./0025-renderer-data-profile-v1-preimplementation-closure.md) 仅在首次发布前 Profile child closed set 和相应路由、接口、诊断范围；其余义务保持。

## 背景与决定

现有 `loomrealm.renderer-data/1` 是 Connection1 + Input1 + Render1，Subsystem 尚无独立、只读的 Renderer 物理呈现尺寸观察能力。尺寸不是键盘、指针或 Frame 业务输入，不能通过 `x.*`、InputTarget/Interest/Activation 转运。2026-09-18 项目负责人明确：npm 包目前无外部依赖，可直接修改现有协议；不再设置 npm 消费者调查为前置条件。

**决定：** 按文档治理的 Frozen-preimplementation correction 流程，显式修订现有 `loomrealm.renderer-data/1` 为 Connection1 + Input1 + Render1 + Viewport1，保留身份字符串，新增唯一 Renderer→Subsystem `viewport.state`，由三包 Data/Renderer/Subsystem 完整协调实现。原协议旧三-child语义在未受影响处逐项保留，原文逐字存档在 [Profile baseline](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)、[Conformance baseline](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)。当前 Profile 和 Viewport child 才是修订后目标；备份不提供另一套 current parser。

**兼容边界：** 已知 npm 无外部消费者是项目负责人陈述，不冒充所有非 npm 渠道均已审计。同一 profile identity 无二进制 fingerprint，旧三-child、新四-child不能混连；同一部署中相连的 Data、Renderer、Subsystem 和产品 adapter 必须采用同一 build cohort，Main 只选择原有 profile 字符串，不引入协商或自动降级。若出现具体必须共存的非 npm 旧 peer，暂停相关部署，另开版本迁移决策；不重新制造泛化 npm 检查。

## 明确不变范围

Control 的 Session/Renderer/DataAuthority/Generation，Connection current carrier、单 reader/writer、1MiB/depth64/Wire、旧 Input/Render 字段及语义、M13 Store/Projector、Main 不存尺寸、Frame 权限及错误边界不变。不引入 `/2`、双 parser、ACK/replay、generic Environment/Geometry service、第二 writer、map-specific schema。一次变化可 coalesce 尚未 admitted 的中间尺寸，但 latest 必须在底层恢复时收敛。

## 替代方案与影响

`x.*` 会错误继承 Input/Frame gate；Main width relay 扩大 authority；直接把 DOM API 暴露给 Core 会破坏平台抽象；`/2` 和双解析器在当前已授权的首次发布前协调修订范围内增加不必要的互操作表面。所有变更必须同步正式 Profile、Viewport child、两份 conformance、受影响入口及冻结账本，签署文档 SHA 后再实施。Docs Freeze、实现、合格三种状态彼此独立。Map、Desktop 实际采样与产品缩放仍属于后续独立任务。