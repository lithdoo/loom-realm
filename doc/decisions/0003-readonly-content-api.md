# ADR 0003：逻辑只读 Content API

> 状态：Accepted  
> 日期：2026-08-01  
> 影响范围：存储与内容系统、FSDB、桌面 Content Service、PWA Service Worker、Repository

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

代价：需要 Package Index、路由和服务实现；开发工具仍需独立文件能力。

## 决定

运行时统一使用逻辑只读 Content API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

桌面由 localhost HTTP Content Service 映射到只读游戏包目录。PWA 由 Service Worker 映射到 OPFS、Cache Storage 和安装注册表。

运行时客户端不提交物理路径，只提交 `installationId`、Namespace、Key 和内容版本。

## 结果

- 需要生成或验证 `fsdb.index.json`；
- Content Service 负责路径安全、MIME、ETag 和授权；
- Repository 负责业务解析、Schema 校验、请求去重和不可变缓存；
- Renderer 使用相同 API 获取图片、音频和其他资源；
- 安装、导入、写入和全包验证使用独立 Package Storage 能力；
- Content Service 和 Service Worker 不拥有 Frame Runtime 状态。

## 重新评估条件

- 浏览器标准文件系统 API 获得稳定跨平台目录访问和授权持久化；
- FSDB 被单文件归档格式替换；
- 性能测试证明 HTTP/Service Worker 成为内容加载瓶颈；
- 需要远程 CDN 或多人内容分发 Profile。
