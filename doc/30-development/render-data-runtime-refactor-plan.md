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

本计划本身不修改任何 Frozen/Active Contract，不改变 Renderer Data Profile identity，也不激活新的 Conformance revision。

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

### 2.2 默认 Runtime 候选删除项

以下现有行为需要逐项审计；若没有明确 protocol/framework owner，则从默认 Runtime 热路径移除：

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

这里的“删除”不等于忽略真实平台错误。浏览器、JS engine、OS、carrier API 或宿主环境如果实际失败，应传播真实可观察异常；不可捕获的 OOM / process termination 不承诺转化为普通 Runtime error。

### 2.3 Strict Validation

更严格的业务检查应设计为开发者 opt-in 能力，而不是默认 Runtime 前置条件。未来可单独讨论：

- application schema；
- 业务字段和跨字段约束；
- 开发者自定的 depth/member/string/payload 限制；
- mutation / cycle / unsupported-value diagnostics；
- 开发、测试、CI 或显式启用的 production diagnostics。

该能力不应成为 Data/Render 默认热路径依赖，也不应改变 wire contract。

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
- update-only path 使用 key/index/path metadata，复杂度接近“受影响路径 + changed subtree”，而不是整棵 Tree；
- 删除与当前 Patch 无关的完整 Snapshot probe；
- 保留 caller mutation isolation：API 返回后修改原对象不得改变 retained state、pending work 或已 materialize message；
- 保留 Registry / desired-state coalescing；
- Event barrier 语义保持；
- 不因框架自行设定的 queue capacity 丢弃已接受 Event；
- structural operation 仍需保证最终 Tree invariants，但避免每个 op 后整棵 Tree 重扫。

### 3.5 `packages/renderer/src/internal/render-store.ts`

Renderer Store 当前已经存在 update-only COW fast path，应在此基础上优化，而不是另起一套状态模型。

重点改造方向：

- Snapshot：允许一次必要的完整结构检查和 candidate 构建；
- update-only Patch：使用 current key/path index，只访问受影响节点、祖先路径与 changed data；
- structural Patch：按 ordered operations 操作 isolated candidate，最后统一验证最终 framework structural invariants；
- 删除仅为历史 node/depth/member/payload caps 服务的 `validateData` / byte/depth scan；
- 不重新验证未变化的 generic data subtree；
- 保留 consumed key、stable tag、revision continuity 与 atomic commit；
- catch-all 不应把所有本地异常都映射成 peer `protocol-fatal`。

### 3.6 `apps/pwa/src/message-port-carrier.ts`

Carrier adapter 应保持 transport 层职责：

- 保留 message order 和单 reader；
- 可将 `Array.shift()` 队列改为 head-index / ring-buffer，避免反复搬移；
- terminal/finish 时清空已积压引用，pending waiter once-settle；
- `postMessage` / port 实际失败传播真实 transport failure；
- 不新增 message-count / retained-byte cap，也不因人为 capacity 关闭 carrier 或静默丢消息。

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
- generic business data 不在默认 Runtime 中做额外 strict schema 审查。

### 4.2 Outbound Data

~~~text
developer/framework message
→ 当前 API 必需 schema / ownership
→ one-pass Wire encode
→ complete application unit
→ serialized carrier writer
~~~

原则：

- 不先完整 `assertJsonValue` + depth/byte scan，再重复 stringify；
- encoder 必须保持 Wire representation 语义；
- serialization 失败不得产生 partial application unit；
- developer input / getter / Proxy / representation error 失败当前调用；
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
~~~

局部 update 不应触发与本次修改无关的完整 Snapshot validation/stringify。

## 5. Failure semantics 计划

实施前需要先把错误责任边界写成测试，而不是边重构边猜。

| 实际失败 | 目标分类 |
|---|---|
| malformed JSON / invalid Wire representation | protocol-fatal |
| unknown message kind / wrong direction / exact closed-schema violation | protocol-fatal |
| authority / identity / revision / Patch precondition failure | authoritative continuity failure |
| developer input / getter / Proxy / outbound serialization error | 当前 API 调用失败；不归咎 remote peer |
| isolated candidate 的本地实现异常 | discard candidate；报告 local implementation failure |
| carrier send/receive 实际失败 | transport / carrier failure |
| stale / inapplicable transient Event | drop only，按现有 contract |
| failed Patch | no partial commit |
| failed serialization | no partial application unit |

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
- 不对 unchanged committed subtree重复 clone/freeze。

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
- small Patch 不扫描 unrelated large subtree。

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
- structural invalid candidate 不污染 current state。

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

这一阶段必须先做 same-identity compatibility gate：

- 是否存在 deployed old-cap peers；
- 是否存在 independent implementations；
- 是否存在 rolling upgrade / rollback cohort；
- 是否存在 persisted message / recording / compatibility obligation。

任一答案为“是”时，不得静默修改同一 protocol identity，应单独设计 version / migration。

## 8. 测试与 Qualification

### 8.1 行为回归

必须覆盖：

- exact schema / direction；
- authority / identity / revision；
- Registry / Snapshot / Patch / Event；
- Patch ordered operations 与 preconditions；
- final Tree structural invariants；
- no partial commit；
- no partial application unit；
- Event barrier / applicability / no replay；
- carrier loss / fresh baseline recovery；
- caller-owned input mutation isolation。

### 8.2 Historical-cap regression

在测试环境可承受范围内，用代表性 fixture 超过历史数字：

- message > 1 MiB；
- JSON depth > 64；
- Node count > 16,384；
- tree depth > 30；
- Patch operations > 4,096；
- Render/Event data > 256 KiB；
- attrs / JSON members / array elements 超过旧阈值；
- identity/tag/Event strings 超过旧 byte threshold。

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
- [ ] Issue #133 的 performance/qualification 指标明确。

达到这些条件后再开始代码改造。
