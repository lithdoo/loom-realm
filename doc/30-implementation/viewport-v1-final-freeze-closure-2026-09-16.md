# Viewport / revised Data Profile v1 — 最终冻结整改与语义保全

> 状态：**Review remediation applied in part / Docs Freeze HOLD；非 Freeze 签署、非测试 PASS**  
> 原审查基线：`3fd84d724e8ac5055ea226dcee52237aff084870`（2026-09-16）  
> 唯一 live status：[Viewport/Profile v1 qualification ledger](./viewport-profile-v1-qualification.md)；决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 当前规范：[Profile v1](../15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md) · [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)

本文只记录此次审查的**delta、源归属与验收**，不是第二份 wire、Main authority、milestone 或 Map 性能 SSOT。Frozen Connection v1 的 state machine/authority/terminal/limits必须保留；旧三child `/1`与旧`/2`只作历史，唯一目标 `/1=Connection1+Input1+Render1+Viewport1`。Docs Frozen≠可执行实现≠Qualification。

## 1. Freeze-blocking closure

| 编号 | 问题 | 当前整改/证据 | 状态 |
|---|---|---|---|
| F-01 | 同身份直接修正 `/1` 的实际兼容义务未知 | 发布负责人仍须按 ledger §2核验 Releases、registry/alpha、私有分发、下游/独立实现、persisted identity及rolling/rollback/coexistence，归档owner/date/signoff；真实义务出现即STOP并新ADR | **OPEN / Docs Freeze blocker** |
| F-02 | Frozen Connection v1 §1/§22只列 Input+Render | [编辑修正 `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)：§1图加Viewport；§9 candidate禁止所有child baseline；§22将三个child具体baseline唯一委托Profile v1 §8。审查commit diff仅涉及这些投影/metadata，未动zero-message、S/G/P、cutover或terminal行为 | **文档修复已提交；最终交叉签署待完成** |
| F-03 | Phase plan仅以 ADR0035旧subject指示路线 | [计划修正 `3fb882e`](https://github.com/lithdoo/loom-realm/commit/3fb882e6b94360a41ef27a7a6fde76ca82396f6a)：明确C0→C1→Map PR0→PR1/PR2→受影响M11/M13/M14/M15同SHA回归；历史`c642...`不得替新executable背书 | **文档修复已提交；最终交叉签署待完成** |
| F-04 | 上轮大幅精简可能删掉旧 exact API/行为 | [Data package exact API恢复 `5b1eb1d`](https://github.com/lithdoo/loom-realm/commit/5b1eb1d47612ec1f0c9efc7eea63ee9eb388917c)，保全三child wire family、terminal/outcome union、双role peer、reader/writer/errors/tests；[Subsystem投影保全 `488fa34`](https://github.com/lithdoo/loom-realm/commit/488fa34ca71509c0db69b0daba70f3b99492c75b)恢复原 Domain/node key不同lifetime、≤256 domains、Input/Content error细节。M13 renderer module原/新对照，关键Projector/Store/structural failure/ABI/Window lifetime均保留于当前模块或Frozen M13 Formal | **重点模块已修；其他大改文件的差异保全终审仍待签署** |
| M-01 | Ordinary movement `visualEpoch`不变但两个WC不同步 | 新 [Map-private motion stage closure](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)以`motionId`+scene/visual配对、shared frame time、先后回调/失败/resize/transfer fencing和测试精确化；[Map module](../20-modules/loom-map/README.md)已导航；**主dynamic draft还需吸收并在PR2实测** | **候选语义已补；Map Freeze仍OPEN** |
| M-02 | 1080p payload/Core validation residual/Browser paint不具实测 | Map draft PR0单时钟及真实dense measurement维持；历史refresh P95失败不能当PASS | **OPEN / Map Freeze blocker** |

F-02/F-03/F-04的文档编辑本身不等于 F-01真实兼容性签署或最终 Core Docs Freeze。F-04须完成整个受影响 diff 的最终审阅，尤其不能因为把内容移入其他SSOT就无证据删除原已冻结行为。**Core Docs Freeze只依F-01..04与正式conformance一致；M-01/M-02是独立Map Freeze gate。**

## 2. 唯一当前实施路线（已同步 phase plan）

```text
C0  ADR0037 external compat证据+Connection组合编辑修正
    + exact API/受保护行为保全+Profile/Viewport/conformance交叉复核
    → 记录 docs-only SHA，Core Docs Freeze（不要求 executable PASS）
C1  同一个coordinated build cohort更新唯一 /1：
    @loomrealm/data codec/demux/terminal/sender
    → Renderer trusted physical source
    → Subsystem retained scope.viewport
    → Main/product DataAuthority/physical rollout
    → revised /1 fixture revision3 + Viewport + Frozen Input/Render/Connection regression
    → M13/Desktop/Hostra affected qualification；PWA后续对应里程碑
PR0 单独测 dense1080 exact bytes / RenderDomain.update full-state validation
    / Browser receive/raster/peak memory / single-clock stimulus-to-paint
PR1 fixed640 chunk/raster/sprite performance
PR2 dynamic viewport+one-paint View/Sprite/motion coordination
PR3 同一受治理 executable SHA 重新资格 M11/M13/M14/M15
```

`C0`不等于`C1`；新Core代码不能继承旧三child`/1`PASS，Map PR0不因Core Docs Freeze获得性能PASS。F-01发现混版/外部兼容要求就STOP direct v1 reset，不能私下追加handshake/feature bits绕行。

## 3. Protected-semantics audit（恢复精确入口，不造并列 wire SSOT）

| 原有约束 | 当前定义入口 / 本次保全结果 |
|---|---|
| Profile identity/binding、preflight零副作用 | [`packages/data/DESIGN.md` §2](../../packages/data/DESIGN.md) + revised Profile v1 §1–2，原S/G/P、TypeError零side effect保留 |
| Input/Render wire types / static exact constraints | Data DESIGN §3恢复原type family列表；schema/limits继续归Frozen Input/Render；新Viewport三字段独立，不扩大两者 |
| Terminal/outcomes | Data DESIGN §4重列`DataProtocolFamily/DataTerminal/DataSendOutcome/DataInboundDisposition`，只在family加`viewport` |
| Subsystem/Renderer peers | Data DESIGN §5–6逐项重列旧handlers/typed outbound sends/terminal/close，仅增加`onViewportState`与`viewport.sendState` |
| Reader/writer/terminal/errors/tests | Data DESIGN §7–8保留ordered disposition/FIFO/child producer admission前coalesce、first-wins、fresh/no replay、TypeError/Role failures及M8/M10/M11资格 |
| Frame/Input author | [Subsystem model §3–4](../10-architecture/subsystem-model.md)保留mutation gate、known-no-commit State convergence、dormant registration和async containment |
| Render/Content author | Subsystem model §6–7恢复≤256 live Domains、Runtime domainId never reuse、Domain-lifetime node key、Event bounded offer、Content selector非公开/TypeError/缓存隔离 |
| Frozen Connection | §1/§9/§22只修current composition投影；authority、candidate、zero app messages、retired、error、generation、transport、conformance原文保留。真实diff见F-02 commit |
| M13 Web Renderer | [current renderer module](../20-modules/web-renderer/README.md)保留Control+Store两类reevaluation、element identity、one-time context/retained-data equality、structural latch、Window resource lifetime；精确行为归Web Presentation API v1/M13 docs |
| Map | [dynamic draft](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)仍拥有camera/chunks/render/PR0；[motion closure](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)只属于map，不升格为Core |

其他在 `508d08ab...3fd84d7` 中大幅精简的 governance/platform/overview/index/模块投影仍须完成**内容保全终审**，形成逐项“已由现行SSOT覆盖/需恢复”证据；不要仅凭本表声称仓库所有旧行为已经验证。实际代码还未升级且尚未执行新的测试。

## 4. Freeze签署状态（唯一正式状态仍在ledger）

```text
Compatibility owner/date/evidence/conclusion: PENDING / NOT VERIFIED
Connection editorial diff: checked for scope in 9fb2c72; final cross-review PENDING
Phase-plan current route: synchronized in 3fb882e; final cross-review PENDING
Key package/Subsystem API restoration: committed; broader protected diff audit PENDING
Core cross-reviewer/date: PENDING
Core Docs Freeze subject SHA: PENDING
Map main draft motion integration: PENDING
Map PR0 executable measurements: NOT RUN
```
