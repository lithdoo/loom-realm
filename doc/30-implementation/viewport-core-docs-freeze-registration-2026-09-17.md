# Core Docs Freeze Registration — awaiting independent reviewer signoff

> 层级：Implementation / Freeze Registration（登记材料，本身**不构成批准**）  
> 状态：**REGISTERED / PENDING INDEPENDENT SIGNOFF / Formal Core Docs Freeze HOLD**；2026-09-17  
> 唯一 live status：[Core qualification ledger](./viewport-profile-v1-qualification.md)。本文件只登记 owner attestation、subject SHA 与待签材料，不改变任何文档的规范状态。  
> 依据：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [final technical review 2026-09-16](./viewport-core-final-review-2026-09-16.md) · [scope repair](./viewport-scope-repair-2026-09-16.md)

本登记由 2026-09-17 工程任务（分支 `glm/main`）产生：项目负责人在当次任务对话中确认了此前待确认的兼容性前提。本登记如实记录该确认，核对 CR 关闭证据，登记冻结 subject SHA，并**明确唯一缺失项为独立 reviewer 签署**；在签署落库前 Core Docs Freeze 保持 HOLD，不写入任何 Frozen 状态。

## 1. Freeze subject SHA（被批准对象）

```text
Candidate subject SHA: 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9   (main HEAD, 2026-09-16)
```

docs-only 核实（2026-09-17，本地 git，命令与结果）：

```text
command      : git diff --name-only 8cd6c78f593df61112883c277aec8280f5604c04 4cbf620
environment  : Windows / git (repo E:\Repo\lithdoo-lab\loom-realm)
exit code    : 0
result       : 变更仅 doc/**/*.md 与 packages/data/DESIGN.md（设计文档）；8cd6c78→4cbf620 共 15 提交，无源代码/构建产物变更
conclusion   : 4cbf620 是终审窗口（原始受审 8cd6c78 起）之后的 docs-only subject
```

- 终审对照正文 SHA `7db45f29e1bf30261468ef03ec7acd80ae3b8b8d` 之后的 `cab8c30` / `5b326e4` / `4cbf620` 只编辑终审报告、qualification ledger 与 freeze-closure 日志本身（状态记录，非 normative schema/currentness/diagnostic 修改），不触发重新技术审查；独立 reviewer 应按本条复核其变更确实仅限状态编辑。
- 一次真实执行的辅助导航核查（不代替人工确认）：

```text
command      : npm run docs:check-links   (node scripts/run-python.mjs scripts/check-doc-links.py)
environment  : Windows / Node v22.12.0 / npm 10.9.0 / repo HEAD = 4cbf620 (glm/main)
exit code    : 0
raw output   : "Documentation links OK: 663 relative link(s) across 113 Markdown file(s)."
conclusion   : 全部 663 个相对链接可达；仅证明链接可达性，不构成规范内容审查或独立签署
```

## 2. Owner attestation（2026-09-17，本任务对话）

**证据类型：owner attestation**——项目负责人在 2026-09-17 工程任务对话中的明确确认。它**不是** registry 查询、分发渠道扫描、第三方验证或任何已执行测试的结果；不得将其改写为“已检查外部渠道”“已验证无消费者”或任何运行性 PASS。

覆盖范围（对应 ledger §2 此前全部 PENDING 项）：

- [x] 非 npm 的明确旧 `/1` 协议/身份承诺与已知独立实现：owner 确认不存在已知承诺或独立对接者。
- [x] 持久化 profile identity、正在运行的旧 peer、rolling/rollback/mixed-binary 共存需求：owner 确认不存在；当前产品不需要跨版本互操作或混版部署。
- [x] 组合决策：采用**修正后四-child `loomrealm.renderer-data/1` 的统一（单套）build/deployment cohort**；不允许旧三-child 与新四-child 二进制混配。若未来出现真实混版/互操作义务，按 ADR0037 STOP 并另立版本/迁移 ADR。
- [x] npm 消费者：沿用 2026-09-16 既有 owner attestation（无消费者、禁止 npm 核查）；本登记未查询 npm，也未以任何其他名称恢复 npm 核查。

```text
npm owner/date          : project owner / 2026-09-16 / non-blocking（沿用既有 ledger 记录）
Non-npm compatibility  : project owner / 2026-09-17 / 无已知承诺、独立 peer、持久化身份或混版需求
                         （owner attestation；来源=本任务对话，非外部扫描/运行结果）
Single-cohort decision : project owner / 2026-09-17 / 修正后 /1 统一 build/deployment cohort，
                         禁止旧/新二进制混配；实际 artifact manifest 属 C1 evidence，本登记不预填任何 SHA
```

假设边界：owner attestation 表达负责人当期知识与部署政策，不证明未知第三方不存在。若后续发现与其冲突的真实互操作/混版事实，Freeze 结论按 ledger 规则重开。

## 3. CR 关闭核对（对 subject `4cbf620`）

依据 [final technical review §3](./viewport-core-final-review-2026-09-16.md)；证据提交存在性已于 2026-09-17 用 `git log` 逐条复核（全部命中且主题相符）：

| ID | 证据提交（已验证存在） | 终审结论 | 本登记核对 |
|---|---|---|---|
| CR-01 架构冲突修复 | `ce57cf1` | TEXT FIX VERIFIED | 修复包含于 subject；已核 |
| CR-02 模块入口遗漏 | `feb1054` / `ccb5304` / `2556dfc` | TEXT FIX VERIFIED | 修复包含于 subject；已核 |
| CR-03 非 npm 兼容/部署准入 | npm：owner 2026-09-16；非 npm/单 cohort：owner attestation 2026-09-17（§2） | 原判 OPEN — Freeze blocking | owner 事实已闭合；独立签署部分仍缺 |
| CR-04 terminal 后 subscribe | `b896173` / `a8ff94e` | TEXT + CONFORMANCE FIX VERIFIED（未执行） | 修复包含于 subject；已核 |
| CR-05 历史 Frozen 误用 | `047e4ba` / `eb2e488` / `66b2009` | NAVIGATION FIX VERIFIED | 修复包含于 subject；已核 |

技术文本修复 ≠ Freeze；上表所有 TEXT VERIFIED 均不转成 executable PASS，可执行断言在 C1 之后的新 subject 上运行。

## 4. 唯一缺失项：独立 reviewer 签署

当前 gate 状态：

- [x] §2 owner compatibility facts（2026-09-16 npm + 2026-09-17 非 npm/单 cohort，见 §2）
- [x] 技术终审 + CR-01/02/04/05 修复（同作者技术证据，供独立 reviewer 复用）
- [ ] **独立 reviewer 对最终 docs-only SHA 的批准**：一名独立于文档作者、亦非本登记执行者/实施 agent 的真实 reviewer，对 subject `4cbf620` 复核并记录身份/日期/范围/结论。

仓库现有全部提交均在同一 owner 账号（`lithdoo`）下完成；终审署名者为原修复执行 AI（ChatGPT，见终审报告抬头），两者均不构成独立签署，也不得互相冒充。本登记执行者（实施工程 agent）同样不具备独立 reviewer 身份。

独立 reviewer 建议最小复核范围：

1. subject SHA `4cbf620` 与本登记 §1 的 docs-only 核实一致；
2. 修正后 Profile `/1`、Viewport v1、两份 conformance、ADR0037、Connection §1/§22 编辑性投影、受影响架构/模块/Data 投影之间导航与状态一致（`npm run docs:check-links` 结果可作辅助，工具输出不代替人工确认）；
3. 旧三-child Profile/Conformance verbatim 原文副本与 NOT CURRENT wrapper 可达且不被误标 current；
4. ledger 与各文档状态行一致（均 NOT Frozen / Not Implemented）。

### Signoff block（PENDING — 仅可由真实独立 reviewer 填写）

```text
Reviewer identity      : ________（真实身份；文档作者/实施 agent 不得代填）
Role / affiliation     : ________
Review date            : ________
Subject SHA reviewed   : 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
Scope confirmed        : ________
Verdict                : APPROVED / REJECTED（附理由）
Evidence location      : ________
```

## 5. Recording commit ≠ approved subject

本登记所在的提交（recording commit）只记录 owner attestation 与待签材料，被批准对象始终是 §1 的 subject SHA `4cbf620`。若独立 reviewer 在登记提交之后签署且期间无 normative schema/currentness/diagnostic 变更，ledger 登记“subject `4cbf620` / approved by … / date … / recording commit …”即可，不产生循环引用。签署后任何 normative 变更按 ledger 规则需要新 docs-only subject SHA 重新复核。

## 6. C1 实施状态（明确未开始）

按 C0 验收条件（正式冻结具有可追溯真实签署后才能进入 C1），独立签署缺失期间**不进行任何生产代码实施**。C1-A（Data 四-child）、C1-B（Subsystem `scope.viewport`）、C1-C（Renderer 物理尺寸来源）、C1-D（产品统一组合）与全部新测试在本次任务中均为 **NOT STARTED**；不以计划或本登记冒充交付。
