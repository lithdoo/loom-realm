# 当前正式契约

跨角色、跨进程可观察的身份、时序、失败和版本约束以相应契约正文为准。这里只提供导航：**不复制可能过期的实现 PASS/Closed 状态**。已实现的模块见[核心模块](../20-modules/core/README.md)，资格差距及 M16/M17 见[路线图](../30-implementation/roadmap.md)。

## Runtime、控制、数据

- [Game Package v1](./game-package-v1.md) · [Hostra Launcher / Node Runner](./nodejs-launcher-profile-v1.md) · [PWA Launcher / Worker Runner](./pwa-launcher-profile-v1.md)。
- [Subsystem Control v1](./subsystem-control-protocol-v1.md) · [Runtime Control v1](./runtime-control-profile-v1.md) · [Frame / Call v1](./frame-call-protocol-v1.md)及[Conformance](./frame-call-conformance-v1.md)。
- [Main ⇄ Renderer Control v1](./main-renderer-control-v1.md) · [Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)。
- [Renderer Data Profile `/1`](./renderer-data-profile-v1.md)及[Conformance](./renderer-data-profile-conformance-v1.md) · [Viewport State v1](./viewport-state-v1.md)及[Conformance](./viewport-state-conformance-v1.md)。现行四子项实现的精确证据见[Viewport 资格记录](../30-implementation/viewport-profile-v1-qualification.md)；旧三子项原文仅作历史证据，不得部署混配。
- [User Input v1](./user-input-v1.md) · [Render Update v1](./render-update-v1.md) · [Readonly Content API v1](./content-api-v1.md)。

## Web Presentation

[Config v1](./web-presentation-config-v1.md)描述资源脚本/样式引导；[API v1](./web-presentation-api-v1.md)描述只读投影 Context/Retained Data/ResourceClient。Renderer current Store 与 Main 的 authoritative topology 不因 DOM/业务组件而生成第二份权威。平台有不同物理资源绑定，但不创造第二套公开 Presentation API。

## 如何判断规范是否已交付

- **Contract Frozen：** 规范语义被冻结，不自动代表实现或 CI 通过。
- **Implemented：** 以当前源码和产品测试判断；新功能不能被旧文档中的“not implemented”否决。
- **Qualified：** 必须有同一 executable subject、适用 Node/浏览器/桌面环境和有效签核；详见[M11](../30-implementation/m11-qualification.md)、[M14](../30-implementation/m14-qualification.md)、[M15](../30-implementation/m15-qualification.md)及[Viewport](../30-implementation/viewport-profile-v1-qualification.md)记录。
- **历史设计：** [ADR 索引](../decisions/README.md)与 Git 历史保存原因；不将已取代草案当作接口规范。

本目录仅收敛导航、不修改上述契约正文或放松兼容义务。
