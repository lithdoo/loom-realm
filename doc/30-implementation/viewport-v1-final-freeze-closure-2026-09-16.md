# Viewport / revised Data Profile v1 — 最终冻结整改与语义保全

> 状态：**Freeze Review remediation / HOLD；非 Freeze 签署、非测试 PASS**  
> 审查基线：`3fd84d724e8ac5055ea226dcee52237aff084870`（2026-09-16）  
> 唯一状态：[Viewport/Profile v1 qualification ledger](./viewport-profile-v1-qualification.md)；决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 当前规范：[Profile v1](../15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md) · [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)

本文只记录当前审查的**delta、来源归属及验收证据**，不是第二份 wire、Main authority、milestone 或 Map 性能 SSOT。保留 Frozen Connection v1 的全文及所有原有状态机/错误/平台限制，不以一次简化重写覆盖它。旧三 child `/1`、旧 `/2` 提案只作历史；当前唯一目标 `/1 = Connection1 + Input1 + Render1 + Viewport1`。

## 1. Freeze-blocking closure

| 编号 | 问题 | 必须满足的关闭条件 | 现状 |
|---|---|---|---|
| F-01 | 同身份直接修正 `/1` 的实际兼容义务尚无完整证据 | 发布负责人按 ledger §2 核验 Releases、registry/alpha、私有分发、下游/独立实现、persisted identity、rolling/rollback/coexistence，归档证据和签字；若存在真实义务 STOP 并新 ADR | **OPEN，外部证据不可由 docs-only 推断** |
| F-02 | Frozen Connection v1 §1 / §22 历史三 child 投影与当前完整 Profile 不一致 | 将 child 目录/图补为 Input+Render+Viewport；§22只陈述 fresh boundary 并链接 Profile v1 §8 作为三个 child baseline 唯一来源；保留 Connection zero-message、single-current、G/P、terminal/cutover 原文，确定 editorial-only diff | OPEN；在冻结前核对精确合同正文 |
| F-03 | 第一阶段交付计划仍以 ADR0035 的 requalification 路线为唯一当前执行说明 | 将本文 §2 的 Core C0→C1→Map PR0→PR1/PR2→受影响 requalification 加入 phase plan；区分历史 M11/M14/M15 evidence 与新 executable subject | OPEN；本文件先固定此次路线供同步 |
| F-04 | 大规模精简可能遗漏旧 exact API / behavior | 按 §3 逐项对比原 `508d08ab` 与修正 `3fd84d7`；无变更部分保留由完整 frozen contract 或 exact package API baseline 定义，缺口补齐，不能仅称“接口保持不变” | OPEN；见 §3 |
| M-01 | Map ordinary motion 与 visual stage epoch 的同步不足 | 以 map package-private movement token / shared anchor + 同一可见状态交接定义先后收到、resize、scene transfer、late async 和失效规则；用 current render data 与截图/trace测试 | OPEN；交由 Map draft，不升 Core |
| M-02 | 1080p payload / Core validation residual / Browser paint 延迟没有 PR0 实测 | 严守 Map draft PR0，同单调时钟采样；未通过不得 Map Freeze | OPEN；不能以文档替代 |

F-02/F-03/F-04 修复后须逐文件复审实际 diff，尤其防止删去旧 Frozen 语义。F-01 必须由可获取外部分发事实的负责人签署，不能因为 Repo 无 Releases 自动勾选。**Core Docs Freeze 只依 F-01..04 与完整 conformance 规范；M-01/M-02 是 Map Freeze 独立 gate。**

## 2. 唯一当前实施路线（供 phase plan 同步）

```text
C0  ADR0037外部compat证据+Connection组合说明编辑修正
    + exact API/受保护行为保全+Profile/Viewport/conformance交叉复核
    → 记录新的 docs-only SHA，Core Docs Freeze（不要求 executable PASS）
C1  同一 coordinated build cohort 更新既有 /1：
    @loomrealm/data codec/demux/terminal/sender
    → Renderer trusted physical source
    → Subsystem retained scope.viewport
    → Main/product DataAuthority/physical rollout
    → revised /1 fixture revision3 + Viewport + Frozen Input/Render/Connection regression
    → M13/Desktop/Hostra affected qualification；PWA 在所属里程碑
PR0 单独测 dense1080 exact bytes / RenderDomain.update full-state validation
    / Browser receive/raster/peak memory / single-clock stimulus-to-paint
PR1 固定640 chunk+raster+sprite 性能优化
PR2 dynamic viewport+one-paint View/Sprite stage+movement coordination
PR3 同一受治理 executable SHA 完成 M11/M13/M14/M15 受影响回归
```

`C0` 不等于 `C1`；新 Core 代码不能继承旧三 child `/1` PASS，Map PR0 不因 Core Docs Freeze 获得性能 PASS。若 F-01 发现混合部署/外部兼容要求，停止直接重置 v1，不允许通过新的握手/feature-bit在本路线私下补救。

## 3. 受保护语义保全检查（不得因为简写而丢失）

| 主题 | 原先定义入口及精确保全项 | 当前权威 owner / 复核方式 |
|---|---|---|
| Profile identity/binding | `packages/data/DESIGN.md` 原 §4：常量、`DataCurrentBindingV1`、preflight零副作用、S/G/P binding | package exact API/既有源码 + revised Profile v1 §1–2；保留原错误与角色边界 |
| Wire model | 原 §5：Input/Render精确类型、`JsonValue`、exact schema、runtime grammar limits | Frozen child contract是 wire SSOT；新增仅 Viewport 三字段，不得用宽松 union/`unknown` 代替 |
| Terminal/outcomes | 原 §6：`DataTerminal`、`DataSendOutcome`、`DataInboundDisposition` discriminants | 当前仅追加 family `viewport`；保持其它 enum/kind/错误区分，旧 executable 类型不等于候选最终类型 |
| Subsystem/Renderer peers | 原 §7–8：role-specific handlers、outbound send、`terminal`、`close`和限制方向 | 保留完整原 surface，**仅**增加 Subsystem `onViewportState`与 Renderer `viewport.sendState`；不能凭简写删除旧方法 |
| Reader/writer | 原 §9–10：有序 settle、local invalid/fatal 分类、FIFO、单 send、禁止在 writer coalesce child | Frozen Profile v1 §5–9+package exact surface；viewport producer在 shared writer admission 之前合并 |
| lifecycle/errors/tests | 原 §11–17：first-wins、fresh peer、M8/M10/M11 owner、TypeError/RangeError、旧 qualification/test matrix | 原 milestone 继续历史，新的 four-child fixture revision3另取新 executable SHA；不得把历史 PASS 复制 |
| Frozen Connection | v1 §1–28 的 authority/broker/zero message/current-retired/terminal等 | 保持全部正文；只更正 §1/§22 的**下游 Profile 当前组合说明**，不扩大 Connection acceptance |
| M13 | Control+Store 两种 Projector reevaluation、same-G equal RenderData不强制重送 | M13 Formal + Renderer module；Viewport source不是第三 Projector authority |
| Map | movement、tile rendering、WC pair、`sceneEpoch/visualEpoch` | Map draft 与其业务设计；绝不可升格为 Profile/Frame universal MUST |

**审查判准：** 对每项给出稳定的 Current SSOT 链接或恢复精确 API 定义；旧文档 SHA 作为 diff provenance，不把整份历史文件复活为并列规范。不得为了让表格看上去全绿而声称已经运行代码测试。

## 4. 尚未满足的签署格式

```text
Compatibility owner/date/evidence/conclusion: PENDING
Connection exact editorial diff reviewed: PENDING
Phase-plan current route synchronized: PENDING
API protected-behavior diff reviewed: PENDING
Core cross-reviewer/date: PENDING
Core Docs Freeze subject SHA: PENDING
Map PR0 executable measurements: NOT RUN
```
