# `@loomrealm/data` 实现评审：简洁、优雅、闭环

> 状态：Archived Review / Step A Implemented  
> 评审基线：`main` / PR #21 merge `03acf4cdaab7e67a5b5f80a390ea361820a765ad`  
> 评审日期：2026-08-26  
> 落地：`fix/data-implementation-review-closure` / 2026-08-26  
> 范围：`@loomrealm/data` package-local M8 core baseline；不评判 M10 InputManager / M11 RenderManager 的业务状态机  
> 目标：确保实现复杂度与问题规模匹配，保持一处事实源、直接可读、可证明，并避免把尚无真实 consumer 需求的复杂度提前固化。

Step A 已关闭：

```text
P0 emitted send / terminal race
P1 input.interest canonical ordering
P1 KeyboardCode single source
P1 validator readability split
package-local mechanics tests
status wording / repo-wide npm lockfile policy
```

Data package 进入 maintenance/fix-only。完整 M8 仍待真实 Subsystem/Renderer consumer。

---

## 1. 评审准则

### 简洁

```text
一个问题只有一个 owner
能直接写清楚就不造 framework/DSL
不为未出现的 v2 / compatibility / transport variation 预建抽象
public surface 只暴露真实 role consumer 需要的能力
```

### 优雅

```text
contract / type / runtime validation 尽量单一事实源
代码按协议边界拆分，但不机械拆 npm package
observable fact 一旦发生，不被后续 race 追溯性改写
普通 TypeScript 优先于 meta-schema / registry / generic protocol framework
可读性优先于压缩 LOC
```

### 闭环

```text
Formal Contract
    ↓
Implementation
    ↓
Executable tests
    ↓
Real role consumer
    ↓
Milestone claim
```

任何一层未完成，都不得用下一层的成熟度措辞代替。

---

## 2. 总体结论

结论：**保留 `@loomrealm/data`，不回滚；当前 package boundary 合理，但实现需要一次小规模收敛后停止横向扩张。**

`@loomrealm/data` 解决的不是“小细节”，而是共享 Data carrier 上必须唯一拥有的 protocol mechanics：

```text
one inbound reader
one ordered dispatcher
one serialized writer
static Input/Render wire validation
role direction
terminal
```

如果没有这一层，这些 mechanics 会在 Subsystem、Renderer、Hostra、PWA 中重复实现，因此独立 package 是必要抽象。

当前问题主要不是“代码总量过大”，而是：

```text
1. M8 package-local baseline 提前于 M4/M5/M6 实现，roadmap claim 容易混淆；
2. validation.ts 认知密度过高，可读性低于项目应有标准；
3. 少数 Frozen contract 细节尚未被 executable implementation 精确证明；
4. conformance 文档成熟度明显高于当前自动化测试覆盖；
5. repo-wide npm/lockfile 问题不应长期由 Data workflow 私有 workaround 解决。
```

当前允许的状态表述：

```text
@loomrealm/data
    Package-local Core Baseline Implemented
    Frozen profile mechanics partially executable
    M8 role integration pending
    Full Profile conformance pending
```

当前不允许表述：

```text
M8 closed
Renderer Data Profile fully conformant
Subsystem DataPlane complete
Input/Render implementation complete
```

---

## 3. 保留的设计

以下设计简洁且边界正确，不应因代码瘦身而推翻：

### 3.1 一个 package，不拆 `@loomrealm/input` / `@loomrealm/render`

Input 与 Render 共用同一个 current carrier、reader、writer、terminal boundary。拆成多个 npm package 会制造额外 orchestrator，而不会减少真实复杂度。

### 3.2 role-specific peers

保留：

```text
createSubsystemDataPeer(...)
createRendererDataPeer(...)
```

它们比 generic `createProtocolSession()` / `send(type, payload)` 更直接，也能在 API 层阻止错误方向。

### 3.3 single reader / single serialized writer

这是 shared carrier 的真实 invariant，不是过度设计。

### 3.4 static wire validation 与 stateful manager 分离

`@loomrealm/data` 只负责 static schema/profile mechanics；Desired Interest、Activation gate、Render Store、fresh baseline materialization 等继续由 M10/M11 role manager 拥有。

### 3.5 不拥有 physical connection

继续坚持：

```text
candidate / paired installation / current authority
    !=
@loomrealm/data peer mechanics
```

不得增加 `connect(url)`、WebSocket、MessagePort、ticket、Worker/Process 依赖。

---

## 4. 必须修正的问题

### P0 — 已 emitted 的 send 不得被后续 terminal 追溯改写

当前 `DataRuntime.send()` 在 `carrier.send(text)` 已 resolve 后仍再次检查 `terminalValue`，因此存在：

```text
carrier.send accepted
→ concurrent terminal wins
→ caller receives { kind: "terminal" }
```

这丢失了“本 application unit 已经 emitted”的事实。

要求：

```text
carrier.send(text) resolve
→ 本次 send outcome 必须是 { kind: "sent" }

peer 可以同时进入 terminal
但 terminal 不得 retroactively cancel emitted fact
```

这是 correctness 修复，不是 API 扩展。

必须增加 race test：

```text
send resolves
+ terminal races immediately after
→ operation = sent
→ peer.terminal still resolves terminal
```

---

### P1 — `input.interest` canonical ordering 必须实际验证

Frozen User Input v1 要求：

```text
frames[] sorted by frameId UTF-8 lexical order
channels[] sorted by ASCII byte order
```

当前实现检查 unique/count，但未完整证明 canonical ordering。

要求：

```text
unsorted frames → invalid
unsorted channels → invalid
```

不要增加 canonicalizer；协议要求 canonical sender，validator 直接拒绝即可。

---

### P1 — Keyboard code 必须只有一处事实源

当前 public type：

```ts
export type KeyboardCodeV1 = string;
```

而 runtime validator 另有 finite `KEYBOARD_CODES` set。

这使 TypeScript surface 比 wire acceptance 更宽，并维护两份事实。

推荐：

```ts
export const KEYBOARD_CODES_V1 = [/* frozen finite set */] as const;
export type KeyboardCodeV1 = typeof KEYBOARD_CODES_V1[number];

const keyboardCodeSet = new Set<string>(KEYBOARD_CODES_V1);
```

如果不希望公开常量，也至少在 internal module 用同一个 readonly tuple 同时派生 type 与 runtime set。

目标是：

```text
contract finite set
=
TS type source
=
runtime validation source
```

---

### P1 — `validation.ts` 需要降低认知密度，不需要 Schema DSL

当前单文件同时承担：

```text
common JSON bounds
Input channel grammar
Keyboard
Pointer
Gamepad
Input envelope
Render nodes
Render patch/delta
profile routing
encode/decode
```

而且大量逻辑被压缩成单行，LOC 少但 review/maintenance 成本高。

只做机械拆分：

```text
src/
├── validation-common.ts
├── input-codec.ts
├── render-codec.ts
├── profile-codec.ts
├── runtime.ts
├── peers.ts
└── model.ts
```

禁止以此为理由新增：

```text
Schema<T>
Validator DSL
Protocol Registry
FieldRule framework
runtime reflection schema
code generator
```

除非未来至少两个独立协议实现出现可测量的重复维护成本。

---

### P1 — executable conformance 必须与 claim 对齐

当前 Profile conformance 已 Frozen 并列出完整 fixture obligations，但 package tests 仍主要是 baseline smoke tests。

优先补真正影响 mechanics 的测试，不为 fixture 数量而写测试：

```text
writer preserves enqueue order
writer pending settles exactly once on terminal
terminal first-wins race
send-after-terminal emits zero bytes
emitted-send/terminal race
unknown type fail-close
message > 1 MiB
JSON depth > 64
input canonical ordering
fresh peer has no inherited writer/reader state
```

以下测试必须等真实 role consumer / platform adapter，不在 package-local baseline 里伪造完成：

```text
fresh Desired Interest republish
fresh Render registry + snapshot materialization
Hostra WebSocket vs PWA MessagePort abstract trace equivalence
Control/Data authority interaction
```

因此：**不要为了让 conformance 清单全部打勾而在 `@loomrealm/data` 内模拟 M7/M10/M11。**

---

### P2 — roadmap claim 需要显式区分“提前实现”与“milestone closure”

实际开发顺序已经出现：

```text
M3 Runtime Control
→ M8 @loomrealm/data package-local baseline（提前完成）
→ M4/M5/M6 尚未完成
```

这在技术上允许，但文档必须明确：

```text
M8 package-local baseline implemented early
!= M8 milestone closed
```

M8 仍需要真实：

```text
Subsystem DataPlane integration
SubsystemDataBinding qualification
Renderer binding/current authority integration
```

项目主线继续按：

```text
M4 Subsystem
→ M5 Main
→ M6 Hostra
→ M7 Renderer Control
→ M8 integration of existing Data baseline
```

Data package 在这期间进入 maintenance/fix-only 模式。

---

### P2 — npm/lockfile policy 必须 repo-wide 解决

Data workflow 当前在 `npm ci` 前执行 lock normalization，以兼容 Node 24/npm 11 的 optional-dependency lockfile 差异。

这个 workaround 不应复制到每个 package workflow。

要求：

```text
在 monorepo root 固定 package-manager / lockfile policy
→ 所有 workflow 使用同一安装策略
→ 删除 Data-only normalization workaround
```

这是 repository hygiene，不属于 Data protocol mechanics。

---

## 5. 不应继续增加的东西

在出现真实 consumer 证据前，Data baseline 禁止新增：

```text
sequence / ACK / replay cursor
shared Input+Render transaction/revision
retry/reconnect manager
connection broker
transport adapter framework
schema DSL/codegen
plugin/registry system
generic RPC/event bus
Input state coalescer
Render diff planner/store
Main authority cache
compatibility aliases / fake v2
```

这些分别属于 child protocol future version、Platform、M10/M11 或尚不存在的需求。

---

## 6. Public surface 评审

当前 root-only export 是正确方向；不新增 `/input`、`/render`、`/internal` 等 subpath contract。

保留 public categories：

```text
profile identity/binding
wire-model types
terminal/outcome
Subsystem peer
Renderer peer
```

但新增 public symbol 必须满足至少一个条件：

```text
A. Frozen wire contract 直接需要；或
B. real Subsystem/Renderer consumer 无法在不复制 protocol mechanics 的情况下完成工作。
```

“测试方便”“以后可能需要”“减少两行调用代码”均不是新增 public API 的充分理由。

---

## 7. 闭环顺序

### Step A — Data cleanup closure

只完成：

```text
P0 send fact race
P1 interest canonical ordering
P1 KeyboardCode single source
P1 validator readability split
关键 package-local conformance tests
status wording / repo CI policy cleanup
```

完成后冻结 Data package 横向功能扩展。

### Step B — 回到 Runtime vertical slice

```text
M4 @loomrealm/subsystem Runtime/Frame
→ M5 @loomrealm/main
→ M6 Hostra Launcher
```

目标是先证明：

```text
Game
→ Launcher
→ Main
→ Runtime Control
→ Subsystem
→ Frame
```

### Step C — 用真实 consumer 再打开 Data

```text
M7 Renderer Control
→ M8 real Data binding integration
→ M10 InputManager
→ M11 RenderManager
```

只有真实 consumer 暴露缺口时，才扩 `@loomrealm/data` API。

---

## 8. Data package-local closure definition

完成本评审 P0/P1 后，可以声明：

```text
@loomrealm/data Package-local Core Baseline Implemented
```

该声明要求：

```text
build/package surface green
single reader proven
single writer proven
role direction proven
static codec/profile fatal boundaries proven
terminal first-wins proven
send emitted fact proven
canonical Interest validation proven
no known Frozen static-contract mismatch
```

它仍然不等于：

```text
M8 milestone closed
full profile conformance
Input/Render role semantics qualified
cross-platform equivalence qualified
```

完整 M8 closure 必须由后续真实 Subsystem/Renderer consumer 证明。

---

## 9. 长期维护规则

后续评审 `@loomrealm/data` 变更时只问四个问题：

```text
1. 这是 Frozen protocol 必需，还是未来假设？
2. 这个状态/事实已经有 owner 吗？
3. 能否用直接 TypeScript 实现，而不是增加 framework？
4. 有真实 executable test 或 consumer 能证明这个复杂度值得吗？
```

任一新增复杂度如果无法回答第 4 个问题，默认后移。

最终原则：

> **没有真实 consumer 需要的复杂度，先不加；Frozen contract 必需的复杂度，用最直接、最可读、可测试的代码实现。**
