# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：LoomRealm monorepo 中公开包、内部 workspace、技术 Adapter 与平台 Composition Root 的拆分原则  
> 依赖：[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)、[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-17

本文是 **package boundary / publish boundary** 的当前权威来源。它不改变协议 authority，也不要求“一个协议文档 = 一个 npm 包”。

核心原则：

> **按稳定能力和消费者边界拆包；平台只负责组合能力。**

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
```

---

## 1. 为什么不按平台拆大包

不采用以下方式作为主要公共包边界：

```text
@loomrealm/host-desktop
@loomrealm/host-pwa
```

原因是平台包容易逐步吸收：

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

最后职责只能描述成“Desktop/PWA 上需要的一切”，难以独立替换、测试和发布。

Desktop/PWA 仍然是重要的**运行拓扑与产品形态**，但默认作为 composition root，而不是大而全的 capability package。

---

## 2. 拆包判断标准

一个候选模块适合成为独立公开包，通常同时满足：

1. 单独安装后有明确用途；
2. 有清晰且相对稳定的消费者集合；
3. 可以独立升级/替换，而不要求相邻模块同步发布；
4. 名称描述“它负责什么”，而不是仅描述“它运行在哪里”；
5. public API 可以小于其内部实现，并能长期维持依赖方向。

仅满足以下条件不足以拆包：

```text
协议文档有独立章节
代码文件很多
运行在独立进程
属于 Desktop/PWA
为了目录看起来对称
```

---

## 3. 推荐的公开包

### 3.1 Wire / Contract 能力

```text
@loomrealm/wire
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
@loomrealm/game-package
```

其中：

| 包 | 主要职责 | 典型消费者 |
|---|---|---|
| `@loomrealm/wire` | JSON/JSON-RPC、safe integer、UTF-8/depth/closed-schema 等无业务语义 primitive | 其他 contract/runtime 包 |
| `@loomrealm/runtime-control` | Subsystem Control v1 + Frame / Call v1 + Runtime Control Application Profile v1 的 schema、validator、dispatcher/conformance helper | Main、Subsystem |
| `@loomrealm/renderer-control` | Main ⇄ Renderer authority snapshot schema、validator、conformance helper | Main、Renderer |
| `@loomrealm/data` | Data Connection + User Input + Render Update 的 schema、validator、state/revision helper | Renderer、Subsystem |
| `@loomrealm/content` | Content API contract、logical identity、client primitives | Renderer、Subsystem、Content Service |
| `@loomrealm/game-package` | Game Package schema、parse/validate、descriptor/path helpers | Main、CLI、工具链 |

协议身份仍然独立。例如 `@loomrealm/runtime-control` 同时实现三个独立 version space，并不把它们合并成一个协议。

建议通过 subpath 保持领域边界：

```text
@loomrealm/runtime-control/control
@loomrealm/runtime-control/frame
@loomrealm/runtime-control/profile
@loomrealm/runtime-control/testing

@loomrealm/data/connection
@loomrealm/data/input
@loomrealm/data/render
@loomrealm/data/testing
```

### 3.2 Runtime / Role 能力

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

| 包 | 主要职责 | 不应拥有 |
|---|---|---|
| `@loomrealm/main` | Session、Runtime Registry、Frame/Stack/Activation、failure unwind、Renderer/Data authority | Node spawn、WebSocket/MessagePort 具体实现、DOM、filesystem |
| `@loomrealm/subsystem` | Subsystem author-facing SDK：Control/Frame/Data/Input/Render/Content adapters | Main Stack authority、Renderer presentation、Host bootstrap policy |
| `@loomrealm/renderer` | Renderer Control mirror、Data Registry、Input gate、Render Store/Patch engine、presentation interfaces | Frame RPC、Main failure-unwind authority |
| `@loomrealm/content-service` | Content API server/service core、trusted package index integration | Frame/Renderer authority、平台 UI lifecycle |

第三方 Subsystem 的默认入口应是：

```text
npm install @loomrealm/subsystem
```

而不是要求业务作者直接组合全部底层协议包。

### 3.3 技术 Adapter 能力

Adapter 以“技术能力”命名，不以“大平台”命名：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

Adapter 只实现某个外部技术绑定，不获得上层 authority。

例如：

```text
Data Connection identity/lifecycle
        @loomrealm/data
             ↑
             │ carrier interface
             │
 @loomrealm/transport-websocket
 @loomrealm/transport-messageport
```

Transport 可以替换，但不能修改 Data Connection、Frame、Input 或 Render 的 application semantics。

### 3.4 业务 Subsystem / Compatibility 包

```text
@loomrealm/map
@loomrealm/map-essentials   // 名称可在实现时调整
```

`@loomrealm/map` 必须只是普通 Subsystem consumer：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Core/Renderer/Main 不得反向依赖 `loom.map`。

Pokémon Essentials / RMXP 兼容逻辑与 Core 发布周期解耦；如果后续证明更适合按格式能力拆，可改为类似 `@loomrealm/rmxp-content`，不影响协议。

---

## 4. Platform 作为 Composition Root

建议产品入口：

```text
apps/
├── desktop/
├── pwa/
└── cli/
```

这些入口主要负责：

```text
选择 capability implementation
构造依赖
注入 config/credential
建立 carrier
启动/停止应用
```

Desktop 可能组合：

```text
@loomrealm/main
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/renderer
```

PWA 可能组合：

```text
@loomrealm/main
@loomrealm/transport-messageport
@loomrealm/content-service-worker
@loomrealm/renderer
```

是否存在一个很薄的 platform bootstrap helper 可以在实现阶段决定；默认不建立“Desktop 功能全集”或“PWA 功能全集”公共包。

---

## 5. 推荐 workspace

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
└── e2e/
```

实际创建 package 应遵循需求驱动原则：**目录图是目标边界，不要求第一天创建所有空包。**

---

## 6. 依赖方向

默认只允许向下依赖：

```text
wire
  ↑
contract/capability packages
  ↑
runtime/role packages
  ↑
technical adapters
  ↑
composition roots / products
```

更具体地：

```text
@loomrealm/main
    → runtime-control
    → renderer-control
    → game-package

@loomrealm/subsystem
    → runtime-control
    → data
    → content

@loomrealm/renderer
    → renderer-control
    → data
    → content

transport-* / launcher-* / content-*
    → 最小必要 contract/interface
    → 不得成为 Main/Frame/Render authority

@loomrealm/map
    → subsystem
```

禁止：

```text
wire → main/renderer/subsystem
runtime-control → main
renderer-control → renderer
core package → map
main → desktop/pwa app
subsystem → platform adapter
```

---

## 7. `@loomrealm/wire` 必须保持极薄

`wire` 只允许没有 LoomRealm domain authority 的 primitive，例如：

```text
JsonValue / JsonObject
JSON-RPC envelope
closed-object validation primitive
safe integer / finite number
UTF-8 byte measurement
JSON depth/member count primitive
```

不得进入：

```text
Frame
Runtime
InputTarget
DataAuthority
Render Domain
Game Package
Content identity
```

如果一个底层包最终变成“所有模块都往里面放”，说明 package boundary 已失效。

---

## 8. Package version 与 Protocol version 分离

```text
npm package semver != protocol version
```

例如：

```text
@loomrealm/runtime-control@0.8.3
    implements Subsystem Control v1
    implements Frame / Call v1
    implements Runtime Control Profile v1
```

package 可因 bug fix、API ergonomics、performance、testing helper 等升级，而协议 version 不变。

未来同一 package 也可以在需要时同时支持多个 protocol version；不得把 npm major 强绑定为 wire protocol major。

---

## 9. Conformance 与发布

Protocol/conformance fixture 跟随最接近的 capability package：

```text
@loomrealm/runtime-control/testing
@loomrealm/renderer-control/testing
@loomrealm/data/testing
@loomrealm/content/testing
```

仓库级 `tests/` 保存产品集成、fixture consumers、test Subsystems 与 E2E，不作为公共测试包发布。

公开包只有通过其声明支持的 applicable conformance fixtures 后，才能声明 corresponding role/protocol conformant。

---

## 10. 发布策略

推荐：

```text
single monorepo
+ independent public packages
+ dependency-graph build/test
+ per-package semver/release eligibility
```

是否阶段性使用 unified version 可以由发布工具决定，但 package boundary 不应因此退化成一个大包。

顶层 `loomrealm` 如果存在，应优先作为 CLI/产品入口，而不是把 Main、Renderer、Subsystem、Desktop/PWA 全部 re-export 的万能 library。

---

## 11. 何时新增一个包

新增 package 前至少回答：

```text
Who installs it?
What capability do they get?
What does it intentionally NOT own?
Can it version/release independently?
Which lower-level packages may it depend on?
Which higher-level packages must never be imported?
```

如果答案只能是“因为这是 Desktop/PWA 的一部分”或“因为协议有一份独立文档”，默认不新增包。

---

## 12. 当前结论

LoomRealm 的目标不是最少包，也不是最多包，而是：

> **每个公开包都有一个稳定、可独立理解、可独立替换和可独立发布的能力边界。**

因此当前默认组织方式是：

```text
能力一包
角色一包
技术 Adapter 一包
平台只组合
协议版本与包版本分离
```
