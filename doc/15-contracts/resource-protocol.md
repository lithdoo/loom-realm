# 资源交付协议草案

> 层级：正式契约  
> 状态：Draft  
> 稳定程度：Experimental  
> 主要定义：逻辑资源 Key、授权读取、版本和缓存边界  
> 依赖：[存储与内容系统](../10-architecture/storage-system.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 最近复核：2026-07-29

## 1. 目标

资源协议负责把图片等大型静态资源安全地交付给渲染端，而不让 Client State 携带资源字节或暴露本机物理路径。

## 2. 资源身份

客户端引用至少包含：

```text
resourceKey + contentVersion
```

`resourceKey` 是当前游戏包内稳定逻辑身份；`contentVersion` 用于缓存失效和诊断。

## 3. 基本流程

```text
Client Node Data 引用 resourceKey
→ 渲染端请求资源
→ 资源接口验证游戏包、Frame 和权限
→ Resource Repository 定位和读取
→ 返回 MIME、版本和主体
→ 渲染端解码并缓存
```

## 4. 边界

- Client State 不携带图片字节；
- Client State 不携带物理路径；
- Runtime Core 不读取资源主体；
- 资源请求不能获得任意文件系统能力；
- 大型资源流量不与高优先级控制消息共用队列；
- 资源加载失败不应破坏 Frame/Scope Store。

## 5. 待冻结问题

- 资源接口由平台服务还是子系统授权端口提供；
- 请求是否必须绑定 Frame 和 Activation；
- MIME 白名单；
- 最大资源大小和并发数；
- 内容版本计算方式；
- 缓存、校验和完整性；
- Frame 出栈后的资源授权和缓存生命周期；
- 浏览器模式与桌面模式的统一传输语义。

## 6. 冻结条件

- 定义请求和响应 Schema；
- 定义权限模型；
- 定义大小与速率限制；
- 定义版本和缓存规则；
- 覆盖路径逃逸、伪造 Key、超大文件和错误 MIME 测试；
- 验证资源洪峰不阻塞控制面和输入。

当前详细资料：

- [游戏启动与内容加载](../game-package/phase-1-game-loading.md)；
- [Web 渲染端协调](../design/web-client-reconciliation.md)；
- [Hostra 桌面宿主](../architecture/hostra-desktop-client-host.md)。
