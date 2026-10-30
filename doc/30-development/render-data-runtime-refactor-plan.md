# Render Data Runtime Refactor Plan

> 状态：Planning only / non-normative / no implementation
>
> 基线：当前 `main`
>
> 背景：Issue #133 的真实设备 profiling 暴露了 Render Data 热路径中的重复 JSON traversal、重复 validation/serialization、整棵 Snapshot probe 与小 Patch 无关工作。
>
> 历史讨论：PR #135 已关闭。本文件仅整理其设计讨论中需要继续验证和实施的改造方向，不继承该 PR 的代码、Contract、ADR 或 Conformance 改动。
>
> 配套工作：PR #134 负责 Map projection payload 的专项缩减；本文只讨论通用 Runtime / Data / Render 路径，不引入 Map、Tile、Canvas 等业务特例。

---

## 1. 目的

本计划的目标不是“把现有所有检查做得更快”，而是先重新划清 Framework 与 Developer 的责任边界，再优化必须保留的 Runtime 工作。

目标原则：

1. Framework 只默认强制执行协议、authority、identity、lifecycle、continuity、atomicity 和自身结构正确性所必需的约束。
2. 开发者拥有业务数据 Schema、字段语义、跨字段约束、领域不变量以及数据规模选择。
3. 默认 Runtime 不以历史实现中的固定数字限制开发者数据，也不以新的 ResourceBudgetPolicy、local budget 或 bounded queue 重新建立同类强制门槛。
4. 热路径采用 operation-first：只为当前操作做必要工作，不为一个局部 Patch 预先扫描整棵 Snapshot。
5. 同一对象图不重复执行完整 JSON validation、depth/member/byte accounting、clone/freeze 和 serialization。
6. 必要的 caller/framework ownership isolation、candidate isolation、COW、atomic commit、revision continuity 和 Event ordering 必须保留。
7. 性能收益必须由 Issue #133 同类真实 workload 和通用大型 Render fixture 证明，不能仅凭删除代码推断。
8. 当前项目尚未形成需要维护的实质公开部署兼容边界；本次允许对现有同一 protocol/profile identity 做首次正式发布前纠正。历史 fixed caps 即使已经写入当前 Frozen/Active 文档，也不因此自动获得继续存在的架构正当性；是否保留只看它是否属于 Framework correctness。

本计划 PR 本身仍只修改 planning 文档，不直接修改 Frozen/Active Contract 或 Conformance。后续实施允许在保持现有 identity 的前提下直接修订协议语义，不要求为本次 pre-release correction 新建版本或 migration；但必须留下清晰的 revision record，并保证 Contract、implementation、tests/Conformance 最终以一致状态进入 `main`。

## 2. Framework / Developer 责任边界

### 2.1 默认 Framework 必须保留

以下属于 Framework 自身正确性，不能为了性能删除：

- message envelope、message type、direction、exact closed schema；
- 当前 Wire JSON representation；
- authority、identity、generation、revision、lifecycle；
- Registry / Snapshot / Patch / Event 的 currentness 与 continuity；
- Patch operation 的顺序与前置条件；
- Render Tree 的 key uniqueness、stable live tag、one-shot key history；
- parent/sibling/reachability/acyclicity 等结构不变量；
- caller/framework ownership contract；
- isolated candidate、atomic commit、失败后的 no-partial-state；
- single reader、single serialized writer、FIFO、terminal first-wins；
- 已定义的 desired-state coalescing、Viewport latest-value 与 Event applicability/order semantics。

这些检查保护 Framework 自己的状态和跨组件协议，不是业务数据审查。

#### Reconnect 与恢复必须保留的 identity / baseline 规则

- Same-generation carrier replacement（同一 Session / subsystem / DataAuthority generation / profile 下 carrier A → B）不创建新的 wire Domain / Node lifetime；Domain/Node one-shot history 继续有效，只重置 carrier-local publication cursor 与 baseline。
- Fresh DataAuthority generation 创建新的 wire identity universe。Subsystem-owned business Domain 可以继续存在，但必须通过新 generation 的 Registry + current Snapshots 重新导出。所有 generation-scoped wire identity metadata（包括 retired Domain IDs、Node consumed-key history、live-tag history 与 carrier revision/baseline state）必须重新初始化，不得从旧 generation 继承；相同字符串在新 generation 中是新的 wire identity。
- Fresh Render carrier 的 Render namespace 首条消息必须是当前完整 Registry；每个 current Domain 在新 carrier 上均从 unbaselined 开始，第一条 authoritative state message 必须是 current Snapshot，之后才允许 Patch。
- Old carrier revision、old Renderer Store 或旧 Patch cursor 不得作为 fresh carrier 的 Patch base；fresh Snapshot 才建立新 carrier 的 authoritative baseline。
- Old carrier 上未进入 ordered-send boundary 的 Event 不得迁移或 replay。尚未 emitted 的 authoritative desired state 只能按既有 Registry / Snapshot coalescing 规则重新 materialize 为当前状态，不得迁移旧 Patch 历史。
- Event 始终 transient、不可 replay；旧 Activation 的 Event 不得进入新 Activation。

### 2.2 默认 Runtime 候选删除项

以下现有行为需要逐项审计。判断标准不是“当前 Frozen Contract 是否已经写了这个数字”，因为当前协议本身正是本次纠正对象；判断标准是该检查是否为 Framework 自身正确运行所必需。不是 Framework invariant 的固定容量限制应从默认 Runtime 与对应 protocol/profile 语义中一并移除：

- message UTF-8 bytes 上限；
- JSON nesting depth 上限；
- Domain count、RenderNode count、tree depth；
- Patch operation count；
- attrs / JSON member count、array element count；
- identity/tag/Event/key 的 UTF-8 byte-length cap；
- Render/Event payload bytes 与 generic data depth；
- DataRuntime pending-send count；
- RenderManager pending-work count以及因容量触发的 Event drop / peer invalidation；
- Presentation Interest 的 Frame/channel/pair 数量 cap；
- Presentation Event 的 pending count / payload capacity cap；
- 为上述限制服务的 raw-byte scan、depth scan、member scan、stringify probe。

Presentation 历史数字需要明确纳入 inventory，而不是只按通用 Render 数字处理：Interest 旧实现曾限制最多 128 Frames、每 Frame 64 Channels、4096 Frame/channel pairs、Channel 256 UTF-8 bytes；Presentation Event 曾限制 identity/name string 128 / 256 UTF-8 bytes，以及 data depth 64、16,384 members、262,144 UTF-8 bytes。它们均是待移除的历史容量限制，不是替代协议语义的理由。

这里的“删除”不等于忽略真实平台错误。浏览器、JS engine、OS、carrier API 或宿主环境如果实际失败，应传播真实可观察异常；不可捕获的 OOM / process termination 不承诺转化为普通 Runtime error。

### 2.3 Strict Validation

更严格的业务检查应设计为开发者 opt-in 能力，而不是默认 Runtime 前置条件。未来可单独讨论：

- application schema；
- 业务字段和跨字段约束；
- 开发者自定的 depth/member/string/payload 限制；
- mutation / cycle / unsupported-value diagnostics；
- 开发、测试、CI 或显式启用的 production diagnostics。

该能力不应成为 Data/Render 默认热路径依赖，也不应改变 wire contract。

### 2.4 Developer / Product 自有资源策略不属于本次删除范围

“Framework 不自设通用容量上限”不等于禁止开发者或具体 Product 对自己的数据做资源选择。应用层可以基于自身体验、算法或目标设备能力主动限制/裁剪数据，例如 Map projection 的 `VIEW_DATA_GUARD`、Tile Band 选择、业务分页或开发者自定义 payload policy。

边界是：

- 这些策略由拥有该业务语义的一层定义、测量和修改；
- generic Wire/Data/Render Runtime 不替应用层重复执行同一业务预算，也不把某个 Product 的数字升级成全平台协议上限；
- PR #134 的 Map projection payload 优化继续独立，不因本计划删除 Framework caps 而被顺手删除或放宽；
- 如果应用策略触发裁剪/拒绝，应以应用自己的 API/业务语义表现，不伪装成通用 Data protocol violation。

## 3. 当前实现热点与需要验证的假设

当前代码审计显示，下列位置与 Issue #133 的 profiling 结果高度相关，需要作为实施时的首要验证点。

### 3.1 `packages/wire`

`json-text.ts` / JSON validation helpers 当前存在“先完整 validation，再 serialization”的重复遍历可能。

需要验证：

- outbound 是否可以在一次实际 encoder traversal 中同时完成 Wire representation 检查与 serialization；
- inbound 使用 `JSON.parse` 后，哪些 representation 检查是真正必要的，哪些只是重复证明 parser 已经保证的性质；
- inherited `toJSON`、getter/Proxy、sparse/augmented array、accessor/symbol、cycle、non-finite number 等行为必须保持当前 Wire 语义，不得为了 single-pass 而退回原生 `JSON.stringify` 的静默改写行为。

### 3.2 `packages/data` codecs

重点文件：

- `validation-common.ts`
- `profile-codec.ts`
- `render-codec.ts`
- `presentation-codec.ts`

当前路径需要审计：

- `parseJsonText` 后再次完整 `assertJsonValue` / depth / bounded-json traversal；
- schema validation 后再次 `assertJsonValue`；
- `stringifyJson` 内再次完整 representation validation；
- payload byte/depth/member 与 string byte caps；
- Render 与 Presentation 的历史容量数字是否只是实现限制而非协议语义。

实施目标：

- schema/type/direction/identity/revision 检查保持；
- generic application data 不重复完整扫描；
- zIndex 使用 signed safe integer 语义；
- revision/baseRevision 保持 positive safe integer；
- Render generic data delta key 的空字符串语义与 wire side 保持一致；
- attrs key 等真正具有非空语义的字段继续保持非空；
- 不把“位于 codec 中”自动等同为“属于协议”。

### 3.3 `packages/data/src/runtime.ts`

当前 DataRuntime 的重点不是引入更复杂的 queue budget，而是重新确认 serialized writer 的最小职责：

- 保留单 writer 与 FIFO；
- 每个 send once-settle；
- terminal 后不发送新 application unit；
- 已开始的 carrier send 与 terminal race 保持既有结果语义；
- developer-owned input 的 serialization/representation error 应在调用边界失败，不应伪装为 remote protocol error；
- carrier.send 的真实 rejection 保留 transport/carrier failure 语义；
- 审计现有 pending-send count cap 是否仅为人为容量限制；若是，则删除，而不是改成 byte budget。

删除 `MAX_PENDING_SENDS` 后采用显式 serialized writer queue / drain loop，而不是靠新的 admission budget：

- `send()` 对本次 application unit 只 encode 一次，然后以 O(1) 方式入队；
- 同一方向最多一个 physical `carrier.send()` in flight；
- `send()` 返回的 Promise 自然表达 transport backpressure：只有对应 physical send 成功或 terminal 后才 settle；Framework 不因为队列长度主动拒绝一个本来合法的 send；
- 调用方如果持续生产且不等待 Promise，pending work 可以随真实工作量增长，这是调用方/平台实际资源选择，不由 Framework 用固定数字提前裁决；
- terminal first-wins 后，所有尚未开始的 queue records 必须 once-settle，并立即释放 message/payload/closure 引用；已开始的 physical send 按既有 terminal race 语义结算；
- queue 采用 head-index/deque/ring 之类不会随 backlog 产生 `Array.shift()` O(N) 搬移的结构。

需要额外关注：不能为了移除 cap 而让 terminal 路径长期保留无用引用；queue / promise chain 的释放行为需要测试覆盖。

### 3.4 `packages/subsystem/src/internal/render-manager.ts`

这是 Issue #133 对 Subsystem 侧最重要的热点。

现状需要重点审计：

- create/replace/update/emit 中的重复 JSON validation；
- caller-owned input 的 detach + freeze 与独立 validation traversal 重叠；
- `probeLimit` 对完整 Snapshot / Patch 的额外 stringify/depth/byte probe；
- update-only Patch 即使只改很小 data delta，也可能扫描与本次更新无关的大量 committed state；
- pending-work count cap 触发 Event drop / authoritative coalescing / peer invalidation；
- 已有 COW、Event barrier 和 desired-state coalescing 不能被推倒重写。

目标路径：

~~~text
developer input
→ 当前 API 必需的 shape/type/ownership 检查
→ 一次 detach/clone（仅在现有 ownership contract 要求时）
→ operation-specific mutation / COW
→ 必要的 framework invariant
→ commit retained state
→ enqueue publication
~~~

要求：

- 必要 shape/type validation 与 detach/freeze 尽可能融合在同一次 traversal；
- 对会被异步 retained 并在 API 返回后 publication 的 authoring input，API acceptance 必须在返回成功前完成 Wire representability 检查和必要 ownership detach；这不是业务 Schema 验证，而是 Framework 接受并持有该对象的前提；
- update-only path 使用 key/index/path metadata，复杂度接近“受影响路径 + changed subtree”，而不是整棵 Tree；
- 删除与当前 Patch 无关的完整 Snapshot probe；
- 保留 caller mutation isolation：API 返回后修改原对象不得改变 retained state、pending work 或已 materialize message；
- 保留 Registry / desired-state coalescing；
- Event barrier 语义保持；
- 不因框架自行设定的 queue capacity 丢弃已接受 Event；
- structural operation 仍需保证最终 Tree invariants，但避免每个 op 后整棵 Tree 重扫；
- publication queue 不再以固定长度决定 accept/drop/peer invalidation：authoritative desired state 仍只按既有 coalescing 语义收敛，Event 一旦被 API 接受就保持 FIFO/barrier obligation，直到成功进入 ordered-send boundary、因 stale/applicability 规则失效，或 current carrier terminal；
- queue 数据结构必须支持 O(1) head removal，并维护必要的 per-domain barrier/tail metadata，避免每次 enqueue/dequeue 为寻找 Event barrier 或可 coalesce work 扫描整个 backlog。

### 3.5 `packages/renderer/src/internal/render-store.ts`

Renderer Store 当前已经存在 update-only COW fast path，应在此基础上优化，而不是另起一套状态模型。

重点改造方向：

- Snapshot：允许一次必要的完整结构检查和 candidate 构建；
- update-only Patch：使用 current key/path index，只访问受影响节点、祖先路径与 changed data；
- structural Patch：按 ordered operations 操作 isolated candidate，最后统一验证最终 framework structural invariants；
- 删除仅为历史 node/depth/member/payload caps 服务的 `validateData` / byte/depth scan；
- 不重新验证未变化的 generic data subtree；
- 保留 consumed key、stable tag、revision continuity 与 atomic commit；
- catch-all 不应把所有本地异常都映射成 peer `protocol-fatal`；本地 candidate failure 若导致已消费的 authoritative stream 无法继续证明 continuity，必须退休当前 Data carrier 并通过 fresh baseline 恢复，但错误仍标记为 local implementation failure，而不是 peer protocol violation。

### 3.6 `apps/pwa/src/message-port-carrier.ts`

Carrier adapter 应保持 transport 层职责：

- 保留 message order 和单 reader；
- 可将 `Array.shift()` 队列改为 head-index / ring-buffer，避免反复搬移；
- terminal/finish 时清空已积压引用，pending waiter once-settle；
- `postMessage` / port 实际失败传播真实 transport failure；
- 不新增 message-count / retained-byte cap，也不因人为 capacity 关闭 carrier 或静默丢消息；
- queue backlog 只表示真实尚未消费的 carrier units；如果平台最终因真实内存/MessagePort/Host 能力失败，传播真实 transport/platform failure，而不是预先映射成 Framework capacity error。

## 4. 目标执行路径

### 4.1 Inbound Data

~~~text
carrier application unit
→ JSON parse
→ 必要 Wire representation / exact schema
→ direction / authority / identity / revision
→ message-specific preconditions
→ isolated candidate mutation
→ final framework invariants
→ atomic commit
~~~

原则：

- 不为了历史 byte/depth/member 上限先做全量 preflight；
- malformed JSON / wrong type / closed-schema violation 仍是协议错误；
- continuity / Patch precondition failure 仍按 authoritative continuity 处理；
- generic business data 不在默认 Runtime 中做额外 strict schema 审查；
- inbound candidate 的本地异常必须丢弃 candidate 并保持 current state/revision 不变；如果后续消息的 base continuity 已无法证明，则退休当前 Data carrier，走 fresh Registry + Snapshot recovery，而不是继续应用后续 Patch。

### 4.2 Outbound Data

Outbound 需要区分 API acceptance 与最终 publication 两个时点：

~~~text
developer authoring input
→ API-required shape/type checks
→ one acceptance traversal:
     Wire representability + ownership detach/freeze
→ accept immutable desired state

later, after desired-state coalescing:
→ materialize only the current message
→ one Wire serialization
→ complete application unit
→ serialized carrier writer
~~~

原则：

- 业务 Schema、字段语义和跨字段约束不在 acceptance 阶段审查；
- 只要 API 返回成功并异步持有输入，就必须在 acceptance 时保证该输入符合既定 Wire JSON representation，避免把可归因于本次调用的错误延迟到后台 publication；
- Wire representability 与 ownership detach/freeze 应在同一次必要 traversal 中完成，不得先完整 validation、再 clone、再 freeze；
- 后续最终消息 serialization 是生成 application unit 所必需的一次遍历，不等于再次执行完整 validation；不得对同一 retained subtree 重复执行完整 representation/depth/member/byte validation；
- 不要在 coalescing 前为每个中间 desired state 提前 stringify；只序列化最终实际要发布的消息，避免为随后被 coalesce 的状态付出无效成本；
- encoder 必须保持 Wire representation 语义，不得退回会静默省略或改写不支持值的原生 JSON.stringify 行为；
- serialization 失败不得产生 partial application unit；developer input / getter / Proxy / representation error 必须在 acceptance API 调用边界失败；
- carrier 实际 send failure 才进入 transport/carrier failure 路径。

### 4.3 Authoritative Patch

~~~text
committed state
→ isolated candidate / indexed COW
→ apply ordered operations
→ operation preconditions
→ final framework structural invariants
→ commit exactly once
~~~

失败时：

~~~text
discard candidate
keep current state and revision
report actual failure class

if authoritative continuity is still provable:
    continue under the existing stream state
else:
    retire current Data carrier as a local implementation failure
    recover through fresh Registry + current Snapshots
~~~

本地 candidate failure 不能伪装成 peer protocol-fatal。由于失败消息可能已经从 carrier stream 被消费，只有在能证明后续 Patch base 仍连续时才允许继续；不能证明时必须退休当前 Data carrier，不能让后续 Patch 基于未提交 revision 继续执行。

局部 update 不应触发与本次修改无关的完整 Snapshot validation/stringify。

## 5. Failure semantics 计划

实施前需要先把错误责任边界写成测试，而不是边重构边猜。

| 实际失败 | 目标分类与状态后果 |
|---|---|
| malformed JSON / invalid Wire representation | protocol-fatal；按既有 Data protocol 规则 retire current Data carrier |
| unknown message kind / wrong direction / exact closed-schema violation | protocol-fatal；不得误归类为 developer business validation |
| authority / identity / generation / revision / Patch precondition failure | authoritative continuity failure；按既有规则 retire affected Data carrier 并 fresh-baseline recovery |
| developer input / getter / Proxy / outbound representation error | 在对应 authoring API acceptance 边界抛出实际异常；不归咎 remote peer，不接受该次 desired state |
| isolated inbound candidate 的本地实现异常 | discard candidate，current state/revision 不变；若 continuity 不能证明则 retire current Data carrier 并 fresh-baseline recovery；分类仍是 local implementation failure |
| carrier send/receive 实际失败 | transport / carrier failure；只影响对应 Data peer / carrier scope |
| stale / inapplicable transient Event | 按既有 applicability 规则 drop only，不 replay |
| failed Patch | no partial commit；current authoritative state 不得被 candidate 污染 |
| failed serialization | no partial application unit；若发生在 authoring acceptance 则失败当前 API 调用 |
| Renderer DOM / Canvas / component presentation-local failure | 不自动否定 authoritative Render Store，不自动 retire Data carrier |
| Subsystem 单次 authoring operation failure | 失败该次 operation；不自动销毁 business RenderDomain |

#### Failure containment

Failure scope follows the authority / ownership scope。除非另一个既有 Contract 明确要求：

- Data carrier failure 默认只影响对应 Data peer / carrier，不自动终止整个 Runtime；
- Data failure 不自动 unwind Frame、不修改 Main/Input authority、不销毁 business RenderDomain；
- Renderer presentation-local failure 不自动使 authoritative Render Store 失效；
- Subsystem authoring failure 只失败该次 authoring operation，不扩大成 Runtime terminal；
- 不得为了简化异常处理，把 local implementation failure 伪装成 remote protocol violation。

本计划不引入 `ResourceBudgetExceeded` 或 `local-resource-exhaustion` 作为 Framework 自设容量限制的替代体系。

## 6. 数据结构与算法方向

### 6.1 RenderManager index

对每个 live Domain 维护足够的内部 metadata，例如：

- `key -> current node`
- `key -> parent key`
- `key -> sibling/root location`
- live tag / consumed key history

metadata 只用于 Framework 自身的 identity/path/COW，不作为业务数据索引。

Update-only Patch：

1. 先按 key 找到目标；
2. 只 clone 目标到 root 的必要路径；
3. attrs/data delta 只 copy 被触达 container；
4. unchanged subtree 保持引用复用；
5. 更新 current node index 中被 clone 的节点；
6. commit 后再 publication。

### 6.2 Renderer Store index

Snapshot baseline 成功后建立同类 current index。

Update-only Patch 使用 index 构造 candidate path，不再递归搜索整棵 Tree。

Structural Patch 可以先采用保守策略：isolated full candidate + ordered operations + final single structural validation。只有 profiling 证明 structural Patch 仍是热点后，才继续做更复杂的增量结构索引算法。

### 6.3 JSON ownership

RenderManager authoring API 当前若承诺 caller/framework ownership isolation，则必须继续 detach。

改造重点不是“删除 clone/freeze”，而是：

- 避免先 validation 一遍、再 clone 一遍、再 freeze/serialize 一遍；
- 在一次必要 traversal 中完成 representation 检查、detach 和 freeze；
- update delta 只处理新进入 Framework ownership 的 changed subtree；
- 不对 unchanged committed subtree重复 clone/freeze；
- 对会被异步 retained 的输入，在 acceptance traversal 中完成 Wire representability + detach/freeze；最终 publication 只做一次必要 serialization，不对已接受 subtree 再跑完整 validation；
- coalescing 前不预先序列化每个中间 desired state。

### 6.4 Stack-safe Framework traversal

删除显式 tree/JSON depth cap 后，Framework 自己的遍历实现不得用递归调用栈重新制造一个隐含深度上限。对 Framework-owned JSON detach/clone、Render Tree index、Tree clone、structural validation 和 freeze 等遍历，优先使用 iterative traversal / explicit stack；可采用 frame-based stack，避免一次性 materialize 全部待处理 sibling 或制造大量临时数组。

这不承诺无限资源或无限深度：显式栈、对象和平台本身仍消耗真实资源，平台实际失败时传播真实异常；但不得再添加固定深度拒绝门槛，也不得把 JavaScript call-stack exhaustion 当作预期的 Framework validation policy。原生 JSON.parse 等 Host/engine 操作仍按平台实际能力处理。

## 7. 实施顺序

### Phase 0 — Validation inventory

建立一张检查清单，把现有每个 validation / cap / preflight 标记为：

- protocol invariant；
- authority/lifecycle invariant；
- framework structural invariant；
- developer-owned business validation；
- arbitrary capacity cap；
- duplicate implementation preflight；
- ownership isolation。

没有明确 owner 的检查不得直接保留，也不得直接删除；先通过 contract/tests 确认责任。

### Phase 1 — Wire / Data codec

目标：

- one-pass Wire encoding；
- 删除重复完整 JSON traversal；
- 删除非协议的固定 capacity preflight；
- 保持 exact schema / direction / representation / revision 语义。

门槛：

- wire/data regression 全过；
- invalid representation reject-set 不弱化；
- inherited `toJSON` 等已有安全语义保持；
- 对异步 retained authoring input，在 API acceptance 的同一次 traversal 中完成 Wire representability 与 ownership detach/freeze；最终消息在 coalescing 后只做必要 serialization，不重复完整 validation；
- Framework-owned traversal 使用 stack-safe iterative 实现，不以递归调用栈引入隐含 depth cap；
- 超过历史 byte/depth/member 数字的代表性有效数据不再被 Framework cap 拒绝。

### Phase 2 — RenderManager

目标：

- 融合 author-input validation + ownership detach/freeze；
- 删除 `probeLimit` 类全量 Snapshot probe；
- indexed update-only COW；
- 删除容量触发的 Event drop / peer invalidation；
- 保留 coalescing、Event barrier、revision/publication ordering。

门槛：

- caller mutation isolation；
- failed update no partial state；
- Event barrier/order；
- carrier replacement / revision rollover；
- small Patch 不扫描 unrelated large subtree；
- API acceptance 时 invalid Wire representation 在原调用边界失败，不延迟到异步 carrier publication；
- 正常 update 不增加全树 continuity scan 或额外 preflight；
- Data failure 不自动升级为 Runtime/Frame/Main authority failure。

### Phase 3 — Renderer Store

目标：

- Snapshot 一次 baseline candidate + structural validation；
- update-only indexed COW；
- structural Patch final single validation；
- 删除 generic data capacity scan；
- 拆分 protocol/continuity/local implementation failure。

门槛：

- atomic commit；
- consumed key / stable tag；
- revision continuity；
- update-only unchanged subtree identity reuse；
- structural invalid candidate 不污染 current state；
- local candidate exception 后，若 authoritative continuity 不可证明则 retire current Data carrier 并 fresh-baseline recovery；不得误报 peer protocol-fatal；
- Renderer presentation-local failure 不自动使 authoritative Store 或 Data carrier 失效。

### Phase 4 — Data writer / PWA carrier

目标：

- 删除非协议 pending-count capacity gate；
- 保留 FIFO / single writer / once-settle；
- terminal 清理 retained references；
- MessagePort queue 改 head-index/ring-buffer；
- transport failure 保留真实 cause。

### Phase 5 — Optional Strict Validation

另开设计，不与 Runtime 重构绑定。

本阶段只定义是否需要 public package/API；不允许为了“以后可能需要”把 strict validation 重新塞进默认 Runtime。

### Phase 6 — Contract / Conformance activation

只有实现和 qualification 完成后，才单独修改 normative Contract / ADR / Conformance。

#### Affected identity inventory

本次历史容量限制移除及容量触发 drop 行为修正，至少影响以下 identity；activation 前必须逐项核查，不得只检查 Render Update：

- Render Update protocol：`loomrealm.render-update / 1`；
- Renderer Data Profile `/1`；
- Renderer Data Profile `/3`；
- Frame-targeted Presentation Event v1。

对每个 identity 单独记录：旧实现的 observable accept/reject/drop 行为、是否已有 deployed peers、independent implementations、rolling upgrade / rollback cohorts，以及 persisted messages / recordings / compatibility obligations。Presentation Interest/Event 的旧容量数字与 Render/Data payload 限制都必须纳入该清单。

#### Same-identity gate

- 如果 release owner 确认所有受影响 identity 均处于首次正式发布前，且不存在 deployed old-cap peers、independent implementations、rolling upgrade / rollback cohorts 或 persisted compatibility obligations，可以提出明确的 same-identity pre-release correction；
- 如果任一 identity 存在上述任一兼容义务，必须停止该 identity 的 same-identity correction，另行设计 protocol/profile version 或 migration ADR；不能假定“新实现接受更多数据”就自动兼容旧实现；
- 删除容量限制和容量触发的 Event drop 会改变 observable accept/reject/drop behavior，PR、Contract、ADR、Conformance 必须如实记录，不得声称完全没有 wire-observable change；
- 只有实现、qualification 和逐 identity compatibility gate 全部通过后，才允许激活相应 Contract / ADR / Conformance revision。

## 8. 测试与 Qualification

### 8.1 行为回归

必须覆盖：

- exact schema / direction；
- authority / identity / generation / revision；
- Registry / Snapshot / Patch / Event；
- Patch ordered operations 与 preconditions；
- final Tree structural invariants；
- no partial commit；
- no partial application unit；
- Event barrier / applicability / no replay；
- carrier loss / fresh baseline recovery；
- caller-owned input mutation isolation；
- same-generation carrier replacement 保留 wire Domain/Node one-shot history，只重置 carrier-local baseline/cursor；
- fresh generation 建立新的 wire identity universe，并通过 Registry + current Snapshots 重新导出仍存活的 business Domains；
- fresh carrier 首条 Render namespace message 为 Registry，current Domains 先 Snapshot baseline，之后才可 Patch；
- old carrier revision / stale Renderer Store 不可作为 fresh carrier Patch base；old Event 不 replay，old unsent Event 不跨 carrier 迁移；
- candidate 本地异常后，continuity 可证明时才允许继续；否则 retire Data carrier 并 fresh-baseline recovery，且错误分类仍为 local implementation failure；
- Data carrier failure 不自动终止 Runtime、unwind Frame、修改 Main/Input authority 或销毁 business RenderDomain；
- Renderer presentation-local failure 不自动否定 authoritative Render Store；Subsystem authoring failure 只失败对应 operation；
- invalid Wire representation 在异步 authoring API acceptance 边界失败，不得等到后台 publication 才暴露；
- Framework-owned deep traversal 使用 iterative/explicit-stack 路径，避免 call-stack 变成隐含 depth cap。

### 8.2 Historical-cap regression

在测试环境可承受范围内，用代表性 fixture 超过历史数字：

- message > 1 MiB；
- JSON depth > 64；
- Node count > 16,384；
- tree depth > 30；
- Patch operations > 4,096；
- Render/Event data > 256 KiB；
- attrs / JSON members / array elements 超过旧阈值；
- identity/tag/Event strings 超过旧 byte threshold；
- Presentation Interest 超过旧 128 Frames、每 Frame 64 Channels、4096 Frame/channel pairs；
- Presentation Channel 超过旧 256 UTF-8 bytes；
- Presentation Event identity/name strings 超过旧 128 / 256 UTF-8 byte caps；
- Presentation Event data 超过旧 depth 64、16,384 members、262,144 UTF-8 bytes。

同时必须验证容量 cap 删除没有删除 Presentation 真正的协议语义：exact shape、Unicode scalar、Channel 的 C0/DEL 限制、Frame authority、source/destination provenance、activation/currentness、exact Interest applicability、FIFO/order，以及 Event transient / no replay。容量压力不再是 Event drop 理由；stale / inapplicable Event 仍按 authority/applicability 规则 drop。

这些 fixture 只证明“旧数字不再是 Framework reject rule”，不建立新的最大值。

### 8.3 Performance evidence

使用 Issue #133 同等 PokeMan Map 路线，同时增加业务无关的大型 RenderNode.data fixture。

至少记录：

- 每次 update 的 object/container visits；
- 完整 Snapshot traversal 次数；
- JSON parse / stringify 次数；
- clone/freeze 对象数；
- changed subtree 与 unchanged subtree 大小；
- Subsystem Worker 与 Renderer 端 P50/P95/P99；
- heap allocation / GC；
- camera-only / motion-only Patch 与真正 Snapshot refresh 分开统计。

结构性验收：

- 小 Patch 不触发 unrelated full Snapshot stringify；
- 同一 encode/decode 路径不重复完整验证同一 subtree；
- unchanged committed subtree 不重复 clone/freeze；
- 默认 Runtime 不执行 opt-in business strict validation；
- 不通过弱化 atomicity、identity、revision 或 Event semantics 获取性能 PASS。

#### 性能非回归约束

正常热路径必须满足：

- Update-only Patch 只处理 changed subtree、目标祖先路径及必要 metadata，不扫描无关 Tree；
- 同一 retained subtree 不重复执行完整 Wire representation / depth / member / byte validation；
- unchanged committed subtree 不重复 clone/freeze；
- 不执行与当前 Patch 无关的完整 Snapshot stringify/probe；
- 不增加每次 Patch 的全树 continuity scan、candidate preflight 或人为 queue admission check；
- authoring acceptance 只做一次必要的 Wire representability + detach/freeze traversal；最终实际发布的消息只做一次必要 serialization；中间 desired state 在 coalescing 前不得提前 stringify；
- 不新增任何固定或可配置的 Framework resource budget 来替代已删除的 caps。

允许付出完整成本的场景必须分开统计：

- fresh carrier / fresh generation 的 Registry + Snapshot baseline recovery；
- Snapshot full replacement；
- 当前保守策略下的 structural Patch isolated candidate 与一次最终 structural validation；
- 真正发生 local failure 后的 carrier retirement / fresh-baseline recovery。

这些完整成本不得无意进入每次正常 update。Structural Patch 暂时允许 O(N) isolated candidate + 一次 final structural validation；只有 profiling 证明其为真实瓶颈，才设计增量结构算法，不为理论性能提前增加复杂度。

性能报告应分别测量 update-only、structural Patch、Snapshot、fresh reconnect 和 failure recovery，避免把恢复成本混入正常 Patch 延迟。删除固定上限不等于承诺无限规模；对象、显式栈、内存和 carrier 仍消耗平台真实资源，平台实际失败时传播真实异常。

## 9. Follow-up PR 切分建议

本计划 PR 合并后，实现应拆分，避免再次把设计、协议激活和大规模实现混进同一个 PR：

1. **Wire/Data traversal PR**：single-pass encode/decode pipeline 与 capacity-preflight 清理。
2. **RenderManager PR**：ownership traversal、indexed COW、probe removal、queue semantics。
3. **Renderer Store PR**：indexed update-only candidate、structural final validation、failure classification。
4. **Carrier/Data writer PR**：writer/MessagePort queue 实现与 terminal reference cleanup。
5. **Qualification PR**：Issue #133 workload、historical-cap regression、性能证据。
6. **Normative activation PR**：compatibility gate 通过后再修改 Contract/ADR/Conformance。

每个实现 PR 都必须能独立解释：删除了什么工作、保留了什么 invariant、用什么测试证明没有语义回退。

## 10. 本计划明确不做

- 不在本 PR 修改源码；
- 不在本 PR 修改 Contract、ADR、Conformance fixture catalog；
- 不在本 PR 修改 protocol/profile identity；
- 不引入 ResourceBudgetPolicy / ResourceBudgetExceeded；
- 不引入 ACK/NACK、resync、history replay；
- 不把 JSON wire representation 放宽成任意 JavaScript object；
- 不实现 Map-specific projection policy；
- 不为了性能取消 caller ownership isolation；
- 不把 structural Patch 强行做成复杂增量算法，除非后续 profiling 证明有必要。

## 11. 完成定义

本计划进入实施阶段前，需要达成以下共识：

- [ ] Framework / Developer validation boundary 无歧义；
- [ ] 哪些历史 numeric caps 属于协议、哪些属于实现容量已经逐项确认；
- [ ] outbound serialization error、local candidate error、protocol-fatal、carrier failure 的分类明确；
- [ ] RenderManager caller ownership contract 明确；
- [ ] update-only COW/index 方向认可；
- [ ] structural Patch 采用“先保守、后 profiling”的策略认可；
- [ ] 不引入新的 Framework resource-budget 体系；
- [ ] same-identity compatibility gate 的执行时点明确；
- [ ] 实现 PR 与 normative activation PR 分离；
- [ ] Issue #133 的 performance/qualification 指标明确，并分别覆盖正常 update、structural Patch、Snapshot、reconnect 和 failure recovery；
- [ ] async authoring acceptance 的 Wire representability + ownership 边界明确；
- [ ] same-generation reconnect 与 fresh-generation identity/baseline 规则明确；
- [ ] local candidate failure 的 continuity / retire / fresh-baseline 后果明确；
- [ ] failure containment 不越过 Data / Frame / Main / Render authority 边界；
- [ ] Framework-owned traversal 不通过递归调用栈引入隐含 depth cap；
- [ ] Presentation 历史容量数字与保留的语义约束均有专项 regression；
- [ ] 每个受影响 protocol/profile identity 均完成 compatibility gate。

达到这些条件后再开始代码改造。
