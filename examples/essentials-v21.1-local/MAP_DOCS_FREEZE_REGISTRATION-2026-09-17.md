# Map Docs Freeze Registration — 2026-09-17

> 层级：Implementation / Freeze Registration  
> 状态：**Map Docs Freeze APPROVED（docs-only subject 见 §2）**；只表示实施合同足够机械执行，**不等于 Implemented / Performance PASS**。  
> 主合同：[MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) · [motion 子规范](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md) · 证据：[PR0 账本](./MAP_VIEWPORT_PR0_EVIDENCE.md)

## 1. 证据链（完整、原样保留）

```text
PR0-original（ce2bd36）           ：dense1080 bytes/Core residual/178.13MiB all-live 模型/640 基线 41.1/93.6ms
→ Core fresh-Renderer correction（737a4bd）
→ STOP A/B investigation（f80b9af）：probeLimit 三重验证归因、121.86ms motion-only、双预算决策材料
→ owner design decisions（2026-09-17 任务携带，见 §3）
→ Core STOP-A implementation（91060a9）：motion-only p50 121.86→40.15ms，等价性 property/boundary 证明
→ Map docs revision（本提交）：§5 双预算 + lifecycle 冻结
→ PR0-final（本提交重跑，见 PR0 账本 §R5）
```

## 2. 身份

```text
original frozen-candidate subject : ce2bd36 上的主合同文本（§5 原单一 128MiB 限额）
owner capacity decision           : 2026-09-17 任务 §0 明确批准（capacity contract 修订，非测试 PASS）
new Core executable dependency    : 91060a9（STOP-A 优化 + 737a4bd fresh-Renderer 修复链）
new Map docs subject SHA          : 本 docs-only 提交（含 §5 修订/本登记/PR0-final 证据；签署登记 commit 与
                                     被批准 docs subject 分开记录于 PR0 账本 §R6）
reviewer / date                   : 项目负责人 lithdoo / 2026-09-17（沿用 Core freeze 同一身份披露：
                                     唯一真实人类批准方，非 AI 执行者；无第三方外部审查）
unresolved issues                 : implementation contract 范围内 none；
                                     环境性 open item 1 项（PR0 账本 §R5 Hostra re-run EVIDENCE MISSING，
                                     非合同性质，PR1 before/after 将在最终 SHA 重测）
```

## 3. Owner approvals（2026-09-17，任务携带原文要点）

- **STOP A**：批准 RenderManager/probeLimit 通用性能优化，条件=JSON 合法性/深度/字节/公共 API/wire/authority 语义全部不变，禁 delta-only probe 与 Map 特判。已按此实施于 `91060a9`。
- **STOP B**：批准 capacity 修订为 `visible ≤128MiB` AND `visible+detached+decoded ≤256MiB peak`，附 8 项 lifecycle 前提（最多一份 accepted+一份 detached、失败即释放、bounded cache、`ImageBitmap.close()`、transfer/eviction/disconnect 清理、禁常驻 1080 envelope、核算三量全含、超限即 FAIL 不得再改预算）。已按此修订主合同 §5。

## 4. Freeze 范围声明

本冻结仅覆盖：主合同 §0–§14（含 §5 新双预算/lifecycle）、motion 子规范、§11 文件边界、§12 顺序、STOP 规则。PR1/PR2/PR3 的功能、像素与性能 PASS 属实施后资格，本登记不预填任何结果。
