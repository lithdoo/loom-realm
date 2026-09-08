# M12 Content Qualification

> 状态：**Implemented / Qualified / Closed**
> 日期：2026-09-08
> 规范入口：`M12_01_CONTENT_SERVICE.md`–`M12_05_QUALIFICATION_CLOSURE.md`
> 正式契约：`doc/15-contracts/content-api-v1.md`

M12 readonly Content capability已完整落地。唯一 closure命令为：

```text
npm run test:m12
```

同一命令已通过：

```text
Node 20.20.2  PASS  84.0s
Node 24.20.0  PASS  74.2s
```

## Implemented production chain

```text
successful Hostra prepare
→ opaque prepared Desktop Content view
→ @loomrealm/fsdb immutable readonly snapshot/index
→ prepare-time exact-byte SHA-256 versions
→ loopback Desktop Content API + scoped bearer
├── Hostra child-private injection → SubsystemScope.content
└── Renderer integration subpath → expected-version ResourceClient
```

`PreparedDesktopContentView`运行时只暴露 `installationId/state/close`；FSDB handle、manifest bytes与 Content Index由 Desktop WeakMap私有持有。普通 Runtime/Renderer capability不获得 installation physical write authority。

## FSDB extraction evidence

- `@loomrealm/fsdb`完整拥有 descriptor、ordinary/metadata index、safe-open/currentness、read lease与 close-drain；只依赖 Node stdlib。
- `@loomrealm/fsdb-http`只保留 route/status/MIME/cache/weak-ETag/HTTP composition，并以 `@loomrealm/fsdb`为唯一运行时 workspace依赖。
- 原有 23 组 `fsdb-http` conformance全绿；clean build与 pack清单不再包含旧 scanner/database实现。
- `@loomrealm/fsdb`与`@loomrealm/fsdb-http` build/test/pack均进入根门禁。

## Content API evidence

- manifest/record/group/resource、single-segment identity和 hierarchical ResourceKey均走真实 HTTP。
- Manifest只投影 public GameEntryV1，并按 Unicode code-point key order确定性序列化。
- `contentVersion = sha256:<64 lowercase hex>`覆盖 exact full-body bytes；ETag为 quoted exact version。
- GET/HEAD/If-None-Match/304、MIME、Content-Length与 cache policy已验证。
- missing/expired bearer为401，scope denied为403；404/405/409/413/429及 problem confidentiality已验证。
- runtime source drift fail closed为409；已知 full-body hash/length mismatch在发送成功响应前映射422。
- max body与 concurrent admission均有界；429不破坏已 admitted读取。

## Client and vertical evidence

Subsystem root新增且仅新增冻结的 Content author projection：`ContentReadOptions`、`ContentRecord`、`ContentResource`、`ContentReadError`、`ContentClient.record/resource`和`SubsystemScope.content`。本地误用同步 `TypeError`且零请求；remote status、cancel与 caller-owned value均已验证。

Renderer ResourceClient位于 `@loomrealm/renderer/resource-client` integration subpath，不进入 Renderer root。它逐segment编码 resource key、强制 expected version、按 installation+identity+version隔离缓存，并为每次返回复制 bytes。

两条 production vertical均通过：

```text
A. prepare → FSDB → Desktop Service → Hostra child → scope.content → business result
B. prepare → FSDB → Desktop Service → Renderer ResourceClient → version-safe bytes
```

Content grant通过独立 child-private环境材料注入，进入 Runner后立即删除；它不进入 `SubsystemLaunchContext`、Runtime bootstrapToken、Frame params或 M9 Data provisioning IPC。

## Closure boundary

M12没有新增 global InstallationRegistry、generic Repository/storage provider、Content RPC/profile、second HTTP stack、AssetManager、presentation schema或 transactional filesystem。M13/M14可直接消费已冻结 capability；M14 presentation与 M16 PWA equivalence仍未声明完成。
