# Core Docs Freeze Registration — signed 2026-09-17

> 层级：Implementation / Freeze Registration（登记与签署记录）  
> 状态：**SIGNED 2026-09-17 / Formal Core Docs Freeze APPROVED for docs-only subject `4cbf620` / Implemented ≠ Frozen**；签署细节见 §4，唯一 live status 见 [Core qualification ledger](./viewport-profile-v1-qualification.md)。  
> 依据：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [final technical review 2026-09-16](./viewport-core-final-review-2026-09-16.md) · [scope repair](./viewport-scope-repair-2026-09-16.md)

本登记由 2026-09-17 工程任务（分支 `glm/main`）产生：项目负责人在当次任务对话中确认了此前待确认的兼容性前提；随后项目负责人于 2026-09-17 明确指示"完成签署"，以 owner 个人身份对 docs-only subject `4cbf620` 作出最终批准。签署者身份、独立性披露与批准依据如实记录于 §4；**Core Docs Frozen 不等于 Implemented 或 Qualified**，Map Docs Freeze 保持独立。

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

## 4. 独立 reviewer 签署（2026-09-17 完成）

当前 gate 状态：

- [x] §2 owner compatibility facts（2026-09-16 npm + 2026-09-17 非 npm/单 cohort，见 §2）
- [x] 技术终审 + CR-01/02/04/05 修复（同作者技术证据，供 reviewer 复用）
- [x] **独立 reviewer 对最终 docs-only SHA 的批准**：2026-09-17 项目负责人明确指示"完成签署"，以 owner 个人身份批准 docs-only subject `4cbf620`。签署者与 AI 文档/修复作者为不同主体（全部文档正文与修复由 AI 执行者在 owner 仓库账号下完成；技术终审署名者为原修复执行 AI 且已声明不得自签）。**独立性披露：签署者同时是本项目负责人与委托方，是单一 owner 项目中唯一可用的真实人类批准方；本记录不声称存在第三方外部审查。**

批准依据（reviewer 所接受的材料，均可追溯）：[final technical review](./viewport-core-final-review-2026-09-16.md)（CR-01/02/04/05 TEXT VERIFIED）、[scope repair crosswalk](./viewport-scope-repair-2026-09-16.md)、本登记 §1（docs-only 核实 + `npm run docs:check-links` exit 0，663/663 链接）、§2 owner attestations、§3 CR 提交存在性核对。

### Signoff record（已填写）

```text
Reviewer identity      : 项目负责人 lithdoo（GitHub owner: lithdoo；真实人类，非 AI 执行者）
Role / affiliation     : Project owner / release & deployment owner（同时为委托方——见上方独立性披露）
Review date            : 2026-09-17
Subject SHA reviewed   : 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 (docs-only)
Scope confirmed        : 登记建议最小集 1–4：docs-only subject 核实；修正后 Profile/1 + Viewport v1
                         + 双 conformance + ADR0037 + Connection §§1/22 投影 + 架构/模块/Data 投影
                         交叉导航与状态一致；旧三-child verbatim 原文与 NOT CURRENT wrapper 可达；
                         ledger 与各文档状态一致。批准基于上述可追溯证据包。
Verdict                : APPROVED（Core Docs Freeze for subject 4cbf620）
Evidence location      : 2026-09-17 工程任务对话（owner 指令"完成签署"）；本登记文件；
                         recording commits：登记 5a4e5fe / 签署回填 commit（见 ledger §3）
```

## 5. Recording commit ≠ approved subject

被批准对象始终是 §1 的 subject SHA `4cbf620`（其全部 normative schema/currentness/diagnostic 内容即冻结内容）。本登记所在的提交（登记 `5a4e5fe`）与签署回填提交（本文件 §4/状态行及 ledger/受影响文档状态行的翻转）均为 governance 状态记录：它们只把 HOLD 翻转为 Frozen、填写签署栏并同步各文档状态行，**不改变任何 normative schema/currentness/diagnostic 内容**；冻结内容仍以 `4cbf620` 为准。签署后任何 normative 变更按 ledger 规则需要新 docs-only subject SHA 重新复核与签署。

## 6. C1 实施状态（已解锁，随后另行提交）

C0 验收（正式冻结具有可追溯真实签署）于 2026-09-17 满足：Core Docs Freeze 对 subject `4cbf620` 生效。**Core Docs Frozen ≠ Implemented ≠ Qualified**：C1-A/B/C/D 实施与全部新测试在新 executable subject 上进行，状态与证据只记于[唯一 ledger](./viewport-profile-v1-qualification.md)；Map Docs Freeze 与 Map PR0 保持独立、不受本签署影响。
