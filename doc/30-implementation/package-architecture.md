# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：公开包、role/capability package、technical adapter、Platform Composition Root 与可选 platform helper 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)、[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-19

本文是 **package boundary / publish boundary** 的当前权威来源。它不改变协议 authority，也不要求“一个协议文档 = 一个 npm 包”或“一个 Platform = 一个 npm 包”。

核心原则：

> **按稳定能力和消费者边界拆包；Platform Architecture 定义系统职责，product composition root 选择并组合实现。**

```text
Protocol boundary
!= npm package boundary
!= runtime process boundary
!= platform boundary
```

---

## 1. Platform Architecture vs Platform Package

系统架构已经定义：

```text
Platform Composition
    = complete physical Session realization
```

包括 Runtime Hosting、Control bindings、Renderer Hosting、Data Connection Broker、Content Binding 与 physical lifecycle。

但这不意味着必须发布：

```text
@loomrealm/platform-hostra
@loomrealm/platform-pwa
```

当前默认：

```text
apps/desktop
apps/pwa
    = product composition roots
```

它们选择 reusable role/capability/adapter packages 并编排 platform-local glue。

只有某段 Platform glue 出现：

```text
multiple independent consumers
stable public API
independent replacement/versioning value
independent release value
```

才抽成 `platform-*` helper package。

因此：

```text
Platform Composition = architecture concept
apps/*               = current composition root
platform-* package   = optional future reusable artifact
```

---

## 2. 为什么不按平台默认拆大包

不采用以下方式作为主要公共包边界：

```text
@loomrealm/host-desktop
@loomrealm/host-pwa
```

因为平台全集包很容易吸收：

```text
launcher
transport
content
credential/bootstrap
filesystem/storage
Main startup
Renderer startup
process/worker supervision
```

最终职责只能描述成“这个平台需要的一切”。

Hostra Desktop / PWA 仍然是重要**系统级 Platform realizations**，但默认不是大而全 library package。

---

## 3. 拆包判断标准

一个候选公开 package 通常应满足：

1. 单独安装后有明确用途；
2. 有清晰且相对稳定的消费者集合；
3. 可以独立升级/替换；
4. 名称描述“负责什么”，而不是只描述“运行在哪里”；
5. public API 可以长期维持依赖方向。

以下不足以拆包：

```text
协议有独立文档
代码文件很多
运行在独立进程
属于 Desktop/PWA
Platform architecture里有一个概念 port
为了目录对称
```

---

## 4. Contract / Capability Packages

```text
@loomrealm/wire
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
@loomrealm/game-package
```

| 包 | 主要职责 | 典型消费者 |
|---|---|---|
| `wire` | JSON/JSON-RPC、安全整数、UTF-8/depth/closed-schema primitives | 其他 capability/runtime 包 |
| `runtime-control` | Control v1 + Frame/Call v1 + Runtime Control Profile v1 implementation helpers | Main、Subsystem |
| `renderer-control` | Main⇄Renderer authority snapshot schema/validator/testing | Main、Renderer |
| `data` | Data Connection + User Input + Render Update helpers | Renderer、Subsystem |
| `content` | Content API logical contract/client primitives | Renderer、Subsystem、Content Service |
| `game-package` | Game Package parse/validate/descriptor helpers | Main、CLI、工具链 |

协议 identity/version 仍然独立；同 package 实现多个 protocol 不合并 authority/lifecycle。

---

## 5. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

这些包必须通过 abstractions/ports 消费平台基础设施，而不是直接绑定 Hostra/PWA。

### Main

消费类似：

```text
RuntimeHosting
RuntimeControlHost
RendererHosting
RendererControlHost
DataConnectionBroker
ContentServiceIntegration
```

这些可能由 app glue + multiple adapters 组合实现，并不要求存在单一 `platform` package。

### Subsystem

消费 Subsystem-facing ports：

```text
RuntimeControlBinding
RendererDataBinding
ContentClient
```

这些只是 system Platform 在 Subsystem role 上的投影。

### Renderer

消费：

```text
RendererControlBinding
RendererDataBinding
ContentClient
Presentation/Input environment
```

Role package 不自己寻找 WebSocket/MessagePort。

---

## 6. Technical Adapter Packages

技术差异优先按单一 capability 拆：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

Adapter 只实现外部技术 binding，不获得 application authority。

例如：

```text
System Platform DataConnectionBroker
        composes
           │
           ├── transport-websocket   (Hostra Desktop)
           └── transport-messageport (PWA)
```

Transport package 本身不拥有 DataAuthority/generation，也不负责完整 Data broker lifecycle。

同理：

```text
launcher-node != RuntimeHosting architecture
transport-* != Platform
content-http != Content semantics
```

---

## 7. Business Packages

```text
@loomrealm/map
@loomrealm/map-essentials   // final name demand-driven
```

业务 Subsystem 的依赖应是：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

不直接依赖 Desktop/PWA/Transport/Launcher package。

同一个 map business implementation 由 `apps/desktop` 与 `apps/pwa` composition 运行。

---

## 8. Platform Composition Roots

```text
apps/
├── desktop/
├── pwa/
└── cli/
```

### `apps/desktop`

实现 Hostra Desktop Platform Composition，可能组合：

```text
main
renderer
launcher-node
transport-websocket
content-service
content-fs
content-http
business subsystems
Hostra integration glue
```

### `apps/pwa`

实现 PWA Platform Composition，可能组合：

```text
main
renderer
transport-messageport
content-service-worker
business subsystems
Worker/Port/Service Worker glue
```

Composition root 负责：

```text
select implementations
construct role-facing platform ports
inject config/bootstrap material
establish physical topology
start/stop product
```

但不得重新实现 protocol/domain semantics。

---

## 9. 推荐 Workspace

```text
packages/
├── wire/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── game-package/
│
├── main/
├── subsystem/
├── renderer/
├── content-service/
│
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
│
├── map/
└── map-essentials/

apps/
├── desktop/
├── pwa/
└── cli/

tests/
├── fixtures/
├── subsystems/
├── integration/
└── e2e/
```

这是目标边界图，不要求预创建全部空 package。

---

## 10. Dependency Direction

默认只允许向下依赖：

```text
wire
  ↑
contract/capability packages
  ↑
runtime/role packages
  ↑
technical adapters / integration helpers
  ↑
composition roots / products
```

注意 technical adapter 可能实现 lower-level port interface；具体 code dependency 应通过最小 interface package/subpath 组织，不能为了图形顺序强迫 role core import adapter。

关键禁止：

```text
main → desktop/pwa app
subsystem → WebSocket/MessagePort adapter
renderer → Hostra/PWA adapter
contract → role implementation
core role → map
map → platform adapter
wire → domain authority
```

Platform composition root 可以依赖所有需要组合的 lower-level packages。

---

## 11. Port Interface Placement

架构概念 port 不自动产生一个公共 package。

优先规则：

```text
只有单一 role 消费
    → interface 可放 role package 的 integration subpath

多个 role/adapter 稳定共享
    → 抽到最小 capability/interface package

只有 app glue 使用
    → 留在 composition root internal code
```

例如 `SubsystemPlatformPorts` 可以位于 `@loomrealm/subsystem` integration surface；DataConnectionBroker 的 system-level implementation boundary 不应被错误塞进 `@loomrealm/subsystem`。

---

## 12. `@loomrealm/wire` 保持极薄

只允许无 LoomRealm domain authority primitives：

```text
JsonValue / JsonObject
JSON-RPC envelope
closed-object validation primitive
safe integer / finite number
UTF-8 byte measurement
JSON depth/member count primitive
```

不得进入：Frame、Runtime、InputTarget、DataAuthority、Render Domain、Game Package、Content identity、Platform port。

---

## 13. Package Semver != Protocol Version

```text
npm package semver != protocol version
```

package 可因 bug fix、API ergonomics、performance、testing helper 升级，而协议 version 不变。

---

## 14. Conformance / Platform Equivalence

Protocol fixtures 跟随最接近 capability package：

```text
@loomrealm/runtime-control/testing
@loomrealm/renderer-control/testing
@loomrealm/data/testing
@loomrealm/content/testing
```

仓库级测试负责：

```text
role integration
port fake integration
technical adapter contract
Hostra Desktop E2E
PWA E2E
cross-platform abstract-trace equivalence
```

`platform-*` package 不是 semantic equivalence 的前提；apps 也可以直接完成这些验证。

---

## 15. 何时新增 Platform Helper Package

例如未来考虑：

```text
@loomrealm/platform-hostra
```

必须回答：

```text
Who installs it besides apps/desktop?
Which stable Platform ports does it implement?
What does it intentionally NOT own?
Can Hostra-specific glue release independently?
Can app/role packages avoid circular dependency?
```

如果只有一个 composition root 使用，默认保留 app-local。

---

## 16. 当前结论

LoomRealm 实现层采用：

```text
能力一包
角色一包
技术 Adapter 一包
Platform 作为系统架构职责
产品 App 作为当前 composition root
可复用 platform helper 按需求抽取
协议版本与包版本分离
```

目标不是最少/最多包，而是让每个公开包都有稳定、独立可理解、可替换、可发布的 capability boundary，同时不让 package structure 反向定义系统架构。
