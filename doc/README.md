# LoomRealm 设计文档

文档按定义依赖组织：

```text
产品目标 → 系统架构 → 正式契约 → 模块设计 → 实施计划
```

---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [Subsystem 模型](./10-architecture/subsystem-model.md)
7. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
8. [存储与内容系统](./10-architecture/storage-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v1](./15-contracts/game-package-v1.md)
11. [Hostra Game Launcher / Node Runner Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [PWA Game Launcher / Worker Runner Profile v1](./15-contracts/pwa-launcher-profile-v1.md)
13. [Subsystem Control v1](./15-contracts/subsystem-control-protocol-v1.md)
14. [Runtime Control Profile v1](./15-contracts/runtime-control-profile-v1.md)
15. [Frame / Call v1](./15-contracts/frame-call-protocol-v1.md)
16. [Frame / Call v1 Conformance](./15-contracts/frame-call-conformance-v1.md)
17. [Renderer Control v1](./15-contracts/main-renderer-control-v1.md)
18. [Renderer Data Profile v1](./15-contracts/renderer-data-profile-v1.md)
19. [Data Connection v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
20. [User Input v1](./15-contracts/user-input-v1.md)
21. [Render Update v1](./15-contracts/render-update-v1.md)
22. [Readonly Content API v1](./15-contracts/content-api-v1.md)
23. [模块设计目录](./20-modules/README.md)
24. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
25. [PWA Composition](./20-modules/pwa-host/README.md)
26. [实施计划目录](./30-implementation/README.md)
27. [独立分包与发布架构](./30-implementation/package-architecture.md)
28. [仓库与目录方案](./30-implementation/repository-layout.md)
29. [测试策略](./30-implementation/testing-strategy.md)
30. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

其他 stack/communication/rendering/protocol-layer文档按专题阅读。

---

## 当前 Game / Launch 闭环

```text
Game Entry {key...} + initial
        ↓
@loomrealm/game-package
        ↓
Validated logical topology
        +
current Platform Launch Manifest
        ↓
exact key-set join
all executable resolution
hosting capability validation
        ↓
immutable PlatformLaunchPlan
        ↓
Main launch(key)
        ↓
Platform RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Subsystem Definition Module
        ↓
@loomrealm/subsystem/host → business role
```

Hostra使用 `launch.hostra.json`；PWA使用 `launch.pwa.json`。两个配置 schema独立，不建立 universal launcher option bag。

---

## Authority Boundary

```text
Game Package       logical topology + initial input
Main               Runtime/Frame/Activation/InputTarget/DataAuthority
Platform Launcher  executable binding/preflight/RuntimeHosting/Runner
Platform Composition complete physical Session
Subsystem          business/Interest/Render authority
Renderer           read-only Main mirror + producer/replica
```

Module path、resolved path/URL、Node/Worker选项不进入 Main/application protocol。

---

## Runtime / Frame / Data

Runtime Control = Subsystem Control1 + Frozen Frame1。  
Renderer Control复制 committed authority。  
Renderer Data Profile v1 = Connection1 + Input1 + Render1。

Frame timeout/loss ambiguity仍 Runtime-fatal/no retry；Data provisioning failure仍不等于 Runtime/Frame failure。

---

## Business Portability

业务只依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

Hostra/PWA可以绑定不同 build artifact，但必须遵守相同 Definition ABI并产生等价 observable semantics。Business source不得读取 launch manifest或探测平台来改变业务语义。

---

## Current Reset

ADR 0019直接更新 current v1：

```text
Game Descriptor {key,module}
→ Game Descriptor {key}
+ platform-specific Launch Manifest
```

没有 v2、deprecated alias或 dual parser。历史 shape只存在于明确标记的 ADR/Git history。
