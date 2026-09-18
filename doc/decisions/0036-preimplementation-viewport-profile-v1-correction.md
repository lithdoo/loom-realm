# ADR 0036：首次发布前直接修正 Profile /1，增加独立 Viewport State

> 决策：**Accepted — protocol correction decision / 2026-09-18**。项目负责人已明确授权原地修改现有协议；**正式契约 Docs Freeze、生产实现及测试均未完成**，以[唯一冻结账本](../30-implementation/viewport-core-freeze-ledger.md)记录。  
> 更新：[ADR 0025](./0025-renderer-data-profile-v1-preimplementation-closure.md) 仅在首次发布前 Profile child closed set 及相应路由、接口、诊断范围；原 Input/Render/Connection/Control 其他义务保持。  
> 当前规范：[Renderer Data Profile /1](../15-contracts/renderer-data-profile-v1.md)、[Viewport State v1](../15-contracts/viewport-state-v1.md)；版本与测试资格不从本 ADR 单独推出。

## 背景与决定

现有 executable `loomrealm.renderer-data/1` 为 Connection1 + Input1 + Render1，Subsystem 尚无独立、只读的 Renderer logical presentation viewport size 观察能力。尺寸不是键盘、指针或 Frame 业务输入，不能通过 `x.*`、InputTarget/Interest/Activation 转运。2026-09-18 项目负责人明确：npm 包目前无外部依赖，可以直接修改现有协议，不再设置 npm 消费者调查为前置条件。

**决定：** 按[文档治理](../00-overview/document-governance.md)的 Frozen-preimplementation correction 流程，显式修订唯一现有 `loomrealm.renderer-data/1` 为 Connection1 + Input1 + Render1 + Viewport1，保留身份字符串，新增唯一 Renderer→Subsystem `viewport.state`，由 Data/Renderer/Subsystem 三包完整协调实现。原协议旧三-child语义在未受影响处逐项保留；原文逐字留在[Profile baseline](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)和[Conformance baseline](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)。修订目标由 current Profile/Viewport child 定义；基线不是第二种可选 parser 或可宣称新版 `/1` 的实现。

## 兼容边界

已知 npm 无外部消费者是负责人提供的事实，不冒充所有非 npm 渠道均已审计。同一 Profile identity 无 binary fingerprint，旧三-child、新四-child **不能混连**；本次实际互联的 Data、Renderer、Subsystem 和产品 adapter 必须采用同一 build cohort；Main 只选择原 profile 字符串，不引入 negotiation、handshake、自动降级或双 parser。若发现具体必须共存的非 npm 旧 peer，暂停混版部署并另开迁移决策，不重新发起泛化 npm 检查。

## 明确不变范围

Control 的 Session/Renderer/DataAuthority/Generation、Connection current carrier、单 reader/writer、1MiB/depth64/Wire、旧 Input/Render 字段和语义、M13 Store/Projector、Main 不存尺寸、Frame 权限及错误边界不变。不引入 `/2`、双 parser、ACK/replay、generic Environment/Geometry service、第二 writer、Map-specific schema。未 admission 的中间尺寸可 coalesce；只在底层恢复、carrier 持续 current、其他 traffic 能 settle 时要求 latest 最终收敛。

## 取舍与正式冻结条件

`x.*` 错误继承 Input/Frame gate；Main width relay 扩大 authority；将 DOM API 暴露 Core 破坏平台抽象；`/2` 和双解析器在当前已授权的首次发布前协调修订范围内增加额外互操作表面。此次 accepted **只是设计决策**：必须同步正式 Profile、Viewport child、两份 conformance、受影响 architecture/module/nav，在最终 docs-only SHA 上完成 `docs:check-links` 后才可标记 Docs Frozen 并交付 Agent 开始生产实施。Docs Freeze、implemented、architecture qualified、Desktop/Map product closed 为不同 gate；不虚构链接检查、构建、测试、实际窗口缩放。
