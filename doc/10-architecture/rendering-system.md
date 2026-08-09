# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render Domain、Domain Tree、Renderer Store、全局合成和输入边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-08

## 1. 设计目标

渲染系统将各 Subsystem 发布的声明式 Render Domain State 呈现为 Web UI，同时保持业务状态、Frame/Input、物理 Transport 和本地表现状态之间的边界。

```text
Subsystem business state / Render Manager
→ Render Domain Registry / Domain Tree State
→ Render Update Protocol
→ Renderer Domain Store
→ Renderer Component reconciliation
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Renderer Store 是目标状态镜像；实际 DOM/Canvas/WebGL Scene 和组件实例属于派生 presentation state。

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Domain Registry，Frame 不拥有 Domain，Renderer 不从 Frame Stack 推导 Domain 生命周期。

平台级不存在：

```text
frame.activate → show Domain
frame.suspend  → hide Domain
frame.resume   → restore Domain
frame.close    → destroy Domain
Frame failure unwind → destroy all affected Domains
```

Subsystem 可以在内部根据 Frame/Runtime 事件主动改变 Domain，但必须通过自身 Render Manager 和 Render Update domain 显式表达。

## 3. Render Domain

每个 Subsystem Runtime MAY 同时拥有 `0..N` 个独立 Render Domains。

概念模型：

```text
Subsystem
├── Domain world        zIndex=0
│   └── roots[]
├── Domain hud          zIndex=100
│   └── roots[]
└── Domain overlay      zIndex=200
    └── roots[]
```

Domain 是：

```text
Render lifecycle unit
atomic Render state unit
Renderer global composition unit
```

Domain 不是 Render Node，不具有 `tag/attrs/data/key`。

当前架构使用 `domainId` 作为正式设计名称；精确 wire schema仍由 Render Update / Render Tree Contract 冻结。

Domain identity 由 enclosing Data Connection 的 Subsystem identity 与 `domainId` 共同确定：

```text
(subsystemKey, domainId)
```

因此不同 Subsystem MAY 使用相同 `domainId`。

## 4. Domain z-index / Global Composition

每个 Domain 拥有 Subsystem-authoritative `zIndex`，用于 Renderer 全局 Domain composition。

```text
lower zIndex
    below
higher zIndex
```

Main Frame Stack MUST NOT 充当 Render z-order。

多个 Subsystem彼此独立，不能假设它们会协调唯一 zIndex；同一 zIndex 的最终 deterministic tie-break / non-semantic ordering 由 Render Update / Composition contract 继续冻结，不得使用连接到达顺序或重连时序作为业务语义。

如果两个 Domain 的相对覆盖顺序具有业务意义，应使用不同 zIndex，而不是依赖偶然 tie-break。

## 5. Domain Roots

一个 Domain 拥有 `0..N` 个 ordered top-level roots：

```text
Domain Host
├── Root A
├── Root B
└── Root C
```

Domain Host 是 Renderer 基础设施 composition boundary，不是隐式 Render Node。

因此协议不强迫轻量 Domain 创建无业务语义的容器根节点。

```text
roots = []
```

表示 Domain 当前存在但没有 presentation nodes。

`roots[]` 顺序属于 authoritative Domain Tree State；实际如何映射到 DOM sibling order、Canvas draw order或自定义 Scene Graph，由对应 Renderer Component/presentation implementation决定。

如果若干 top-level nodes确实需要共享业务布局、裁剪、坐标系或其他 parent 语义，Subsystem应显式创建真实 container/component Node，而不是由协议强制生成 fake root。

## 6. Render Node Tree

概念 Node：

```ts
interface RenderNode {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNode[];
}
```

精确类型、limits和 closed-schema规则仍由 Render Tree Contract 冻结。

### `key`

`key` 是 Domain 内 reconciliation identity。

当前设计要求：

```text
key unique across all roots + descendants of one current Domain Tree
```

因此 Renderer 可概念上通过：

```text
(subsystemKey, domainId, key)
```

唯一定位当前 Node。

连续 Domain State 中持续存在的同 key 表示同一 logical Node identity；持续存在期间 `tag` SHOULD/MUST 保持稳定，精确兼容规则由 Render Tree Contract 冻结。

### `children`

`children[]` 是 ordered child relation。

协议定义顺序，但不替具体 tag 规定布局实现。

## 7. Node Tag / Renderer Component

`tag` 是逻辑 Renderer Component 类型，不等同于 DOM tag。

```text
tag
→ lookup Renderer Component Factory
→ create / reconcile presentation component
```

通常 tag 对应 Subsystem 提供的自定义 Renderer Component。

Component lookup 应至少在 Subsystem scope 内解析：

```text
(subsystemKey, tag)
→ Component Factory
```

因此两个 Subsystem MAY 使用相同 tag 字符串而指向不同组件实现。

Render Update / Render Tree State只引用 tag，不负责传输 JavaScript module、Component class、CSS bundle或 executable code。Component implementation 如何进入 Renderer 属于独立 Renderer Component Bootstrap/Profile 或 Host/Package loading 边界。

未知/不可用 tag 的 validation/failure semantics 仍待正式 Render contract 冻结；Renderer不得把未知 tag 自动当作任意 DOM element 执行。

## 8. `attrs` / `data` Boundary

当前需求保留：

```text
attrs : {[key: string]: string}
data  : JSON object
```

二者都是声明式 plain data，不是 executable behavior。

`attrs` MUST NOT 被默认解释为任意 DOM attributes，例如不能因为字段名为 `onclick` / `style` 就绕过 Component 自身解释边界。

`data` 用于 tag-specific structured state；不得携带 Function、DOM object、MessagePort、Blob、class instance 或 callback。

`attrs` 与 `data` 是否都需要进入最终 Frozen schema，以及二者精确职责和 limits，留给 Render Tree Contract review；现阶段不得把它们实现成远程 DOM 命令面。

## 9. Renderer 职责

Renderer 负责：

- 按 Subsystem维护 Data Connection；
- 接收/校验 Render Update；
- 按 `(subsystemKey, domainId)` 维护 Domain Store；
- 原子提交每个 Domain 的 authoritative state；
- 校验 Domain roots 与 Domain-wide Node key；
- 解析 Subsystem-scoped tag → Renderer Component；
- 根据 stable key 对 full Domain State进行本地 reconciliation；
- 按 Domain zIndex执行全局合成；
- 选择 DOM/Canvas/WebGL 等具体 presentation backend；
- 管理动画、缓存、焦点、插值等非权威表现状态；
- 采集输入并根据 Main InputTarget路由普通 User Input。

Renderer 不负责：

- 业务规则；
- 创建/销毁 Subsystem权威 Domain；
- 根据 Frame Stack决定 Domain可见性/排序/销毁；
- 把 Domain自动绑定 Frame；
- 从 DOM/Scene推断 Stack、InputTarget或 Runtime failure unwind；
- 将本地表现状态写回为业务 authority。

## 10. Domain State / Store

Domain 只有在 Subsystem通过未来 Render Update lifecycle语义显式移除时，Renderer才把它从 authoritative Domain Registry 移除。

Frame出栈、暂停、Activation替换、正常 close或 failure unwind都不能作为隐式 Domain destroy信号。

一个 Domain State 应作为一个原子提交单位，至少包含：

```text
domain identity
zIndex
ordered roots[]
whole current Node Tree
```

Renderer内部 MAY 根据 old/new full state与 stable key 做增量 reconciliation；这不意味着 v1 wire 必须提供 Tree Patch。

当前设计优先考虑：

```text
full current Domain State
latest-state coalescing
fresh state recovery
```

而不是历史 operation log。revision、patch、resume cursor 是否需要进入 v1 必须由 Render Update closure review证明其必要性，不能从旧文档继承。

## 11. Render Scheduler / Presentation

```text
Render Update
→ Domain Store atomic commit
→ dirty Domain merge
→ global zIndex composition
→ requestAnimationFrame
→ Component / DOM / Canvas / WebGL reconciliation
```

Scheduler只决定何时呈现当前 Store，不改变 Subsystem authoritative Domain State。

一个 Domain 是原子状态单位；v1 不应默认提供跨 Domain transaction。若 presentation 必须强原子更新，应优先建模在同一个 Domain State 中。

## 12. User Input / Component 边界

普通输入仍只发送到 Main授权的 Frame/Activation，不以 Domain 或 Node identity作为 ordinary input authority。

```text
Render Component
→ optional Input Channel Producer
→ User Input Core
→ Main authority ∩ Interest ∩ Producer availability
```

Domain/Node/component出现本身不授予 InputTarget。

自定义 Component MAY 提供 `x.*` Input Channel Producer；Node/Component销毁导致 Producer unavailable 时，继续服从 User Input v1 的 Producer Loss teardown，而不是由 Render Protocol直接改变 Frame/Input authority。

## 13. Data / Frame / Domain Independence

必须保持：

```text
Frame active != Domain visible
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle change
Data Connection retire != Domain destroy
Domain destroy != Frame close
```

Data Connection loss期间 Renderer MAY 保留最后合法 presentation Store；fresh Data Connection后的 authoritative recovery 由 Render Update自己的 Domain Registry + fresh Domain State模型决定，不参与 Frame recovery。

## 14. Runtime Failure Boundary

Runtime terminal failure通常最终导致 Main撤销对应 DataAuthority，但 Frame unwind 与 Domain cleanup仍是不同协议域。

healthy Runtime 的 doomed Frame 被 close 后 MAY继续拥有和更新 Domains。

failed Runtime的旧 Data carrier退休不应被解释成所有 Domain已经收到 authoritative destroy；Renderer如何保留最后合法 presentation、何时清除 stale Domain，由 Render Update / Runtime teardown contract明确。

## 15. 本地表现状态

DOM Element、Component instance、Canvas/WebGL资源、CSS动画、图片缓存、焦点/滚动/Hover、设备瞬时状态、纯视觉插值等可以只留 Renderer，但不得改变业务规则、Frame Stack或 recovery authority。

stable Node key MAY用于保留合法 component-local presentation state；协议 authoritative state始终来自最新合法 Domain State，而不是 DOM/Component实例反推。

## 16. 当前渲染不变量

1. 每个 Subsystem Runtime拥有 `0..N` 个 Render Domains；
2. Domain identity = enclosing `subsystemKey + domainId`；
3. Domain 是 Render lifecycle、atomic state和全局 composition unit；
4. Domain拥有 Subsystem-authoritative zIndex；
5. Domain拥有 `0..N` ordered roots，不强制 fake container root；
6. Domain Host不是 Render Node；
7. Node包含 `key/tag/attrs/data/children` 的声明式模型；
8. Node key在当前 Domain所有 roots/descendants中唯一；
9. children与roots顺序均属于 authoritative state；
10. tag是逻辑 Renderer Component type，不等于 DOM tag；
11. Component解析至少按 `(subsystemKey, tag)` 隔离；
12. attrs/data是 plain declarative data，不是 executable callback/DOM命令；
13. Main不维护 Domain Registry；
14. Frame不拥有 Domain；Renderer不从 Frame Stack推导 Domain生命周期；
15. Domain可以 zero Frame存在；
16. Frame close/unwind不自动删除 Domain；
17. Data Connection retire不自动等于 Domain destroy；
18. Renderer可以按 key本地 diff/reconcile，但 wire patch不是当前既定要求；
19. Render恢复不要求 Frame Activation变化；
20. exact wire、revision/patch/recovery/limits由 Render Update / Render Tree Contract继续冻结。
