# Viewport Core Docs Freeze Review — 2026-09-16（历史审查与后续处置）

> 状态：**Original `/2` subject superseded / Not a Freeze signoff**  
> Original subject：`8d8523cd0aff48d98b3632a5e7a3a30f5125977a`；原报告在 Git history可核  
> 后续：[业务边界 Review](./viewport-business-boundary-review-2026-09-16.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [唯一 live revised-v1 ledger](./viewport-profile-v1-qualification.md)  
> 日期：2026-09-16

这是当时 Profile `/2`候选的历史审查，不再是 current `/2`规范、实施计划或冻结签署。原始详细报告与中间 CF-01..07 修订可查本文件 Git history；后续 ADR0037撤销 `/2`，改为首次发布前**显式修正唯一 `/1`**。不得用本历史页恢复双解析器、历史 PASS或 v2 rollout。

## 1. 仍有效的基础 findings

Viewport不是 User Input；Renderer physical geometry独立 InputTarget，经readonly retained Subsystem Runtime capability交付，Main只保留DataAuthority、不存尺寸。Map决定camera/projection/Render；WC决定raster/physical retry。避免永久 max-envelope的方向成立，但不等于性能已经PASS。拒绝Main relay、Environment manager、ACK/super-snapshot、多 surface router、map Core fast path。

## 2. CF-01..07 原问题的 current disposition

| Finding | 当前修正落点 |
|---|---|
| CF-01：Docs Freeze与 executable PASS循环依赖 | Docs Freeze只要兼容证据/完整规范+executable-ready conformance，PASS在实施后新SHA |
| CF-02：resize burst writer overflow | Viewport每carrier≤1 admitted/in-flight +≤1 pending latest，writer背压/收敛测试 |
| CF-03：旧`/1`与`/2`冲突 | **ADR0037取代当时的处理方案**：不发`/2`，修正现有`/1`四child；新增外部兼容义务核查及旧/新executable不可混配 |
| CF-04：diagnostic缺口 | corrected `/1`上 recognized malformed viewport→`protocol:"viewport"`；common/unknown→profile |
| CF-05：物理尺寸/source fencing | Core designated single CSS logical surface；当前Desktop/PWA产品选document layout viewport与Window采样；old source/carrier fenced |
| CF-06：fresh G/Renderer retained semantics | last不代表paintable，只接收matching current baseline，无跨plane barrier |
| CF-07：synchronous subscribe/bootstrap | 立即首发含null、先更新getter、异常隔离/终止inert；Map先建domain/state再subscribe |

此表说明**文本纠正方向**，不宣称compatibility assessment已签署或测试通过。唯一状态和Freeze SHA见 [revised-v1 ledger](./viewport-profile-v1-qualification.md)。

## 3. Map Track边界后续修正

原 MF-01：`finishStep`持有按键时可能自动chain下一步，且Frame无suspend getter；真实风险须记录，但当前具体示例仅map Subsystem，菜单/对话并非现行已接受验收。Core只承诺geometry不mint gameplay/Frame mutation authority；menu连续行走在正式接纳consumer时单独movement/lifecycle review，不再凭假设要求Frame API或阻塞不含菜单的当前map slice。

原 MF-02：Domain一次提交不保证View/Sprite两个WC async physical stage同步；由map package-private one-sync-task stage gate设计并在PR2实测，不上升Framework ACK。原 MF-03：历史640 refresh P95 96.3ms>50ms，PR0必须测exact dense1080 payload、Core full-state validation residual、Browser receive/raster/memory、single-clock stimulus→paint，未测不得称性能完成。

## 4. Current status

- Revised Profile `/1` / Viewport State v1：formal candidates，Docs Freeze HOLD，compatibility evidence与最终cross-review PENDING。
- Original `/2` proposal/conformance/ledger：Superseded historical，never implemented/released。
- Map：current viewport/chunks/raster/atomic stage及PR0仍独立治理；future menu另验证。
- No new local/hosted executable PASS；旧M11/M13/M14/M15证据不得跨subject挪用。