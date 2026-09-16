# Renderer → Subsystem Viewport State v1

> 层级：正式契约 / Child Protocol  
> 状态：Draft / Normative Candidate / Not Frozen  
> 协议版本：1；标识：`loomrealm.viewport-state/1`  
> 主要定义：单一 Renderer layout viewport 的 readonly retained observation、bounded publication、fresh-carrier/currentness 与 failure  
> 依赖：[Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)、[Profile v2](./renderer-data-profile-v2.md)  
> Conformance：[Viewport State v1 Conformance](./viewport-state-conformance-v1.md)  
> 最近复核：2026-09-16（Core Freeze Review CF-01..07 closure candidate）

`MUST / MUST NOT / SHOULD / MAY` 是候选规范约束；只有 Docs Freeze subject 归档后才可标 Frozen。本文是 child wire 与 author observation 的唯一正式语义源；map min/max、settle、camera 与 Render 内容不属于本文。

---

## 1. Scope / single-surface meaning

每个 current Renderer participant 恰有一个可选择的逻辑 presentation surface；v1 只观察该 participant **当前 document 的 layout viewport**。尺寸取该 document 对应 Window 的 `innerWidth/innerHeight`（CSS logical pixels，包括其定义内的 scrollbar 区域），向下取整得到 positive safe integers。Desktop 与 PWA 必须采用同一 observable 定义；不得以 `visualViewport.width/height`、`screen.*`、`devicePixelRatio`、任意 host element `getBoundingClientRect()` 或 business WC box 代替。没有合法 surface/sample时没有新消息，不合成默认尺寸。Map 的 cap/居中/letterbox 只属于 map policy。

Cardinality：

```text
one current Renderer participant
→ 0..1 legal current layout viewport sample
→ same observed size replicated on each current /2 Subsystem Data carrier
```

未来若一个 Renderer 同时需要多个独立 viewport，必须另起 design/profile version；v1 不能增加 `surfaceId/windowId/Frame id`、多 surface 路由或选择算法。Viewport 不表达用户动作、Input authority、DOM desired tree 或 paintability。

---

## 2. Exact message / direction

唯一方向 Renderer → Subsystem，唯一消息：

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

JSON object 顶层 exact-own `{type,width,height}`；两个值 MUST 都是 positive, finite, safe integers。单位固定为 layout viewport CSS logical pixel。不得添加 DPR、focus、visibility、timestamp、revision、sequence、Renderer/Session/Frame/Activation、map/camera 或其他 metadata。无 `viewport.event/reset/interest/request/ack/revision`。

Profile v2 的 common UTF-8 1MiB / JSON depth-64 / representation preflight 和 direction validation 先于 child semantic mutation；malformed message 是 Viewport child protocol-fatal，retire 当前 Data carrier（不自动 fail Runtime/Frame、不 destroy RenderDomain）。同值合法消息可以无 author callback。

---

## 3. Bounded latest-state publisher（性能与正确性约束）

每份 state 都是 self-contained current truth；不要求传递每一个中间 resize。对**每个 current carrier**，Viewport sender MUST 满足：

```text
at most one viewport unit admitted to the shared writer / awaiting its send outcome
AND at most one not-yet-admitted pending latest-size slot
```

新的合法样本覆盖 pending slot，不向 writer逐个 enqueue resize；相同尺寸不必再发布。当前 writer admission 的消息不能撤回/重排；其发送结算后，如 pending 与最后已提交尺寸不同，提交最新值；直到收敛。若 writer长期阻塞，pending 仍至多一份；普通合法 resize burst本身 MUST NOT造成无界排队或 shared writer overflow/Data-fatal，也不得永久阻塞已有 Input/Render child。不得为此改变 Frozen Profile v1 writer、创建 generic priority scheduler、丢弃已 admitted 的 unit 或重传到 fresh carrier。

`carrier.send()` 成功只证明该 carrier接纳此 unit，不是 author ACK。发送 terminal时丢弃该 carrier的 admitted/pending publication cursor；物理 source可继续保留 latest observation，只有 fresh carrier自己的 baseline可重新发布。Renderer MUST 把 fresh carrier的第一份 viewport发送作为该 carrier的 baseline，以 admission 当时最新合法样本为准；baseline尚未完成时发生 resize，按同一 bounded latest rule继续收敛。不存在跨 carrier历史事件、revision 或 replay。

---

## 4. Currentness / transitions

Subsystem host维护 Runtime-scoped、detached/immutable 的**最后成功接受的 observation**，独立于 carrier publication cursor。唯一初值为 `null`（从未接受过 baseline），不能因 ordinary loss/invalid zero source伪造 `null`。下表是规范 transition：

| Situation | Wire behavior | Author `current` / callback |
|---|---|---|
| Runtime startup，尚无合法 baseline | 无消息 | `null`；新 subscriber同步收到 `null` |
| 首次合法 size A | 发送/接受 `viewport.state(A)` | current=A；通知变化 |
| 同 carrier A→A | 可以 suppress或接收相同状态 | current=A；不重复通知 |
| 同 carrier A→B→C burst | 未 admission 的中间值 latest-wins | 最终收敛到 C；不要求通知 B |
| current carrier retire/loss | old publication cursor清空，不迁移 | 保留最后值，不通知 `null` |
| same-generation fresh carrier，size仍 A | MUST 发布 fresh A baseline | 接受等值，不通知变化 |
| fresh carrier 的合法 baseline 是 B | MUST 发布 B baseline | 更新 B，然后通知一次 |
| fresh generation，**同一 Runtime仍存活** | fresh carrier/baseline，旧 generation traffic fenced | 同一 capability保留 last value，等值不通知、异值通知 |
| fresh Renderer participant，Runtime仍存活 | 只接受新 current `(S,G,P)` carrier的 fresh observation | 可能短暂保留旧 size，合法新 baseline后收敛 |
| fresh Renderer 尚无合法 sample | 不发 zero/null/default | last value保留；从未观测则仍 `null` |
| Runtime terminal / scope signal abort | 停止订阅回调，retire owned resources | 后续 delivery inert |

不得把非 `null` 解释为 current carrier、Renderer participant、DOM 连接或可绘制证明。Control、Viewport、Render 分别收敛：fresh Renderer/ generation 的 baseline前可能短暂显示旧业务 Render truth；**不承诺跨 Control/Viewport/Render 原子 super-snapshot、barrier或 fixed order**。只有与 exact current authority匹配的 carrier消息可更改 retained value。旧 Renderer source、旧 carrier已 queued callback/rAF、retired generation在替换后 MUST inert，不能覆盖当前 observation。

---

## 5. Input/Frame independence / physical source

Viewport publication与 receive MUST NOT受 Main InputTarget、Activation、Frame active/suspended、Input Interest、keyboard/pointer/gamepad available、blur/focus 门控。一个 map Frame 被 child menu/dialog suspend 时，其 Subsystem Runtime仍可更新 viewport observation；这**不授予** suspended Frame进行玩家移动、collision、transfer或 Frame call 的业务 mutation authority。

Trusted physical source 在 current Renderer document生存期观察上文 exact layout viewport：initial sample、resize burst/coalesce、必要时 hidden→visible resample。无效/zero/fractional/unsafe physical值不发布，不清除上次合法 source observation。DPR-only change不构成 viewport语义变化。source stop/Renderer replacement必须解除 listener与 rAF，并以 identity/current binding fence所有 late callbacks；Data-only reconnect可复用当前 Renderer物理样本，但 publication queue是新 carrier独立的。PWA 必须与 Desktop observable CSS unit/geometry相同。

---

## 6. Author projection / callback contract

`@loomrealm/subsystem` 的 exact author surface：

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}
export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

`Viewport` object lifetime = Runtime/Scope lifetime。`current` getter返回 detached/immutable snapshot；listener不得通过 object mutation改变 retained value/future deliveries。

`subscribe(listener)` MUST 同步交付恰好一次调用时已提交的 `current`（包括 `null`），之后只在 structural `{width,height}` 变化时通知；任何 callback调用前 MUST 已更新 `current`。第一次交付中同步 throw须被局部隔离，不能阻止订阅结果或其他 listener。每个 listener独立 containment；returned thenable不成为 Data reader/backpressure，异步 rejection被局部捕获/报告，不能变成 unhandled rejection 或 Data/Runtime terminal。unsubscribe幂等，调用后不得再给该订阅交付；Runtime terminal后所有订阅及延迟异步通知 inert。不新增 `get()+onChange` 第二套可竞态 API。

在 `/1` explicit compatibility composition中，新 SDK仍可提供同一 stable capability；若该 Runtime从未成功接收 v2 observation，则 `current=null` 且无虚构 viewport。目标 canonical `/2` composition没有 silent `/2→/1` fallback。**已有非 null observation的 Runtime如被明确迁移到 `/1`，其 retained-value migration policy 不属于本 slice，必须单独设计，不能偷偷静默降级。**

---

## 7. Conformance / Freeze boundary

本 contract适用的测试断言定义于 [Viewport Conformance](./viewport-state-conformance-v1.md)。**Docs Freeze要求完整、可实施的 conformance specification，不要求实现前有 executable PASS。** Docs Freeze subject只记录 docs SHA 与 review closure；实现/ qualification在独立 executable subject上记录命令、环境、PASS原始证据。不得因未实现而把本候选标作已 Implemented/Qualified。

Final invariants：单一 layout viewport；exact 3-field message；per-carrier bounded latest pending；独立 Input lease；Runtime retained observation；fresh baseline；无 ACK/history；malformed Data-fatal而非 Frame-fatal；Main 不拥有尺寸；business自主决定 camera/projection。