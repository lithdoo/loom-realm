# ADR 0003：逻辑只读 Content API

> 状态：Accepted / **Realization partially updated by ADR 0030**  
> 日期：2026-08-01  
> 影响范围：存储与内容系统、FSDB、桌面 Content Service、PWA Service Worker、Repository  
> Current realization：[ADR 0030](./0030-freeze-m12-content-preimplementation-closure.md)

> **本 ADR 的 logical readonly Content API、Desktop HTTP / PWA Fetch、physical-path hiding 与 Content≠execution 决策仍有效；2026-08 初版的 registry/repository/index/client-version realization 不再覆盖当前 M12 baseline。**

## 背景

桌面子系统可以访问本地文件系统，但 PWA Worker 只能通过浏览器存储和 Fetch API 访问内容。让业务子系统直接依赖 Node `fs` 或 FSDB 物理目录会破坏跨平台性，并向 Renderer 和第三方模块泄露路径能力。

FSDB 运行时访问主要发生在初始化、地图切换和资源加载，不属于每 Tick 热路径。

## 考虑过的方案

### 子系统直接访问物理文件系统

优点：桌面实现简单。

代价：不适用于 PWA，路径安全分散，跨语言实现不一致，难以统一缓存和版本。

### 将整个游戏包预加载到内存

优点：运行时读取简单。

代价：启动和内存成本高，大型资源不可接受，无法按需加载。

### 逻辑只读 Fetch/HTTP API

优点：跨平台、跨语言，天然支持 MIME、ETag、缓存和流式资源；物理路径集中在受控服务内。

代价：需要可信 logical index、路由和服务实现；开发工具仍需独立文件能力。

## 决定

运行时统一使用逻辑只读 Content API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

桌面由 localhost HTTP Content Service 实现；PWA 由 same-origin Fetch / Service Worker 映射到其 persistent installation/content storage。

运行时请求使用 logical installation/namespace/key identity，不提交物理路径。

## 结果 — Current Meaning

以下结论继续有效：

- Content Service 负责 logical route/path safety、MIME、version/cache 与 authorization projection；
- Renderer 使用相同 logical Content API语义获取资源；
- 安装、导入、写入与 executable loading使用独立 capability；
- Content Service / Service Worker 不拥有 Runtime/Frame/Render application authority；
- Desktop/PWA physical storage mechanics可以不同，但 logical response semantics必须等价。

ADR 0030 对首次实现 realization 做了最小收口。以下旧假设 **不再是 Current M12 requirement**：

```text
mandatory fsdb.index.json artifact
global mutable Installation Registry in Desktop M12
generic Repository / ReadonlyContentStorage framework
Subsystem client显式提交 installationId
client-selected historical contentVersion selector
single-segment-only resource key
Renderer Blob/ImageBitmap/Audio/GPU cache as M12 responsibility
```

Current M12 采用：

```text
current prepared installation view
→ @loomrealm/fsdb readonly core
→ private immutable Content Index
→ Desktop Content Service
→ Subsystem ContentClient / trusted Renderer integration-subpath ResourceClient
```

并由 Content API v1冻结 hierarchical ResourceKey 与 `sha256:<64 lowercase hex>` Content version语义。

## 重新评估条件

- 浏览器标准文件系统 API 获得稳定跨平台目录访问和授权持久化；
- FSDB 被单文件归档格式替换；
- 性能测试证明 HTTP/Service Worker 成为内容加载瓶颈；
- 需要远程 CDN 或多人内容分发 Profile；
- M13/M14/M16真实 consumer证明 ADR 0030 frozen capability存在无法由 private realization满足的缺口。
