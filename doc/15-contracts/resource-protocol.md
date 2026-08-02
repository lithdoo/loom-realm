# 资源交付协议草案（Superseded）

> 层级：正式契约  
> 状态：Legacy / Superseded  
> 稳定程度：Frozen Historical  
> 主要定义：旧独立资源协议方案的退役入口  
> 被替代原因：资源主体已经由统一只读 Content API v1 提供  
> 最近复核：2026-08-02

本草案不再作为独立协议继续演进。

资源读取的公共语义已经由 [只读 Content API v1](./content-api-v1.md) 定义：

```text
GET /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

资源通过独立 HTTP / Fetch 内容面交付，不进入 Main Control Connection 或 Renderer–Subsystem System Data Connection。

## 当前有效资源模型

Render State 可以携带逻辑资源引用，例如：

```text
resourceKey + contentVersion
```

Renderer Resource Client 再通过 Content API 获取 MIME、版本、缓存头和二进制主体。

资源访问：

- 不要求绑定 Frame；
- 不因 Frame suspend / close 自动失效；
- 不通过 DOM 或 Render 层级推导权限；
- 不暴露物理文件路径；
- 不允许客户端把逻辑 Key 当任意本机路径使用；
- 不与高频 User Input / Render Update 共用业务队列。

Desktop 授权由 Content API 的 Session / Installation / Scope / Token Profile 定义；PWA 由 same-origin Service Worker 与安装登记控制。

## 不再保留的开放问题

以下旧问题已经由 Content API 架构决定，不再需要作为独立资源协议选择：

- 资源接口由平台服务还是 Subsystem 端口提供；
- 请求是否必须绑定 Frame / Activation；
- 浏览器与桌面是否使用不同逻辑资源协议。

仍可在 Content API / Renderer Resource Client 中继续细化：

- MIME 白名单；
- 最大资源大小与并发；
- Range Profile；
- 缓存和完整性；
- Renderer 资源引用计数与本地释放策略。

相关文档：

- [只读 Content API v1](./content-api-v1.md)；
- [存储与内容系统](../10-architecture/storage-system.md)；
- [渲染系统](../10-architecture/rendering-system.md)；
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)。