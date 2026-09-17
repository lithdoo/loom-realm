# Core Viewport v1 / revised `/1` — C1 executable implementation evidence

> 层级：Implementation / Qualification Evidence  
> 日期：2026-09-17；分支 `glm/main`  
> 规范 subject：Core Docs Freeze `4cbf620`（owner 签署，见[冻结登记](./viewport-core-docs-freeze-registration-2026-09-17.md)）  
> 唯一 live status：[Core qualification ledger](./viewport-profile-v1-qualification.md)（本文件只存放原始证据，不改变状态）

## 1. Implementation commits（渐进提交）

```text
C1-A  b53263c  feat(data): four-child renderer-data/1 — Viewport State v1
C1-B  4bbe9a4  feat(subsystem): Runtime-scoped readonly scope.viewport
C1-C  866d151  feat(renderer): trusted logical-surface viewport source + product seam
C1-D  (this commit) qualification evidence + boundary-test signature fix
```

同一 worktree、同一分支、同一构建 cohort：所有包（data/subsystem/renderer/desktop）由同一 `npm run build`/`build:desktop-stack` 产出，无任何预编译外部产物混入。Main 侧唯一 profile 选择点为 `packages/main/src/internal/main-session.ts` 的 `RENDERER_DATA_PROFILE_V1 = "loomrealm.renderer-data/1"`；`packages/main/src` 与 desktop main-entry/data-broker 无任何 width/height/viewport 状态或转发（grep 验证 2026-09-17）。无协议协商/版本检测机制新增。

## 2. 变更文件清单与必要性

| 文件 | 必要性 |
|---|---|
| packages/data/src/{model,profile-codec,runtime,peers,index,viewport-codec,viewport-sender}.ts | 四-child 唯一 `/1`：类型/校验/方向/家族分类/demux/有界 sender |
| packages/subsystem/src/{model,index,viewport}.ts, internal/viewport-manager.ts, host/run-subsystem.ts | `scope.viewport` retained capability + ingress + fencing + terminal |
| packages/renderer/src/{control,index,viewport}.ts | source seam + 发布/fresh baseline/替换 fencing（无 DOM 依赖进 Core） |
| apps/desktop/src/{renderer-viewport-source,renderer-entry}.ts | 产品指定 document layout viewport（innerWidth/innerHeight）物理源 |
| 各 test/*.mjs（新增 6 个测试文件 + 既有 handler fixture 更新 + 3 处签名断言更新） | 契约矩阵覆盖；handler 必填项与 additive 签名随 API 更新 |
| package.json（root） | `test:data` 串接 rev3 资格套件；新增 `test:profile1:qualification*` 真实命令 |

## 3. 测试证据（真实执行；环境 Windows 10 / Node v22.12.0 / npm 10.9.2 / 本机）

| 命令 | exit | 结果 |
|---|---|---|
| `npm run test:data`（foundation+wire+data+rev3） | 0 | foundation 3、wire 15、data 35、profile rev3 7（38 fixtures）全过 |
| `npm run test:regression` | 0 | 14 个 workspace 套件全绿（fsdb 38、foundation 15、wire 27、game-package 4、platform-ports 27、runtime-control 11、renderer-control 35、data 67→35*、subsystem 67、renderer 54、main 32、hostra 33、fsdb-http 23、desktop 29） |
| `npm run test:m10:qualification:run` | 0 | 16/16（Input v1 回归） |
| `npm run test:m11:qualification:run` | 0 | 10/10（Render v1 回归） |
| `npm run test:m13` | 0 | 全链（m12 chain + web-presentation 5/5 + boundary + pack）通过 |
| `npm run test:m14` | 0 | 全链（m13 + map 54 + examples + Chromium vertical）通过 |
| `npm run test:m15:desktop` | 0 | 12/12 |
| `npm run test:m15:hostra` | 1 | **8/10 通过；2 项失败（movement latency harness 偶发 + P95 gate）**，见 §4 |

\* test:regression 单套件计数以实际输出为准；data 于单独运行计 35。

## 4. M15 Hostra 延迟 gate 失败分析（非 Core 回归证据）

同机对照（同一命令 `node --test --test-concurrency=1 --test-name-pattern "P95" test/m15-hostra-product.test.mjs`，subject 标记 `local-worktree`）：

| subject | ordinary p50/p95/max (ms) | refresh p50/p95 (ms) | 判定 |
|---|---|---|---|
| `4cbf620`（改动前基线） | 29.1 / **47.5** / 72.4 | 76.9 / **142.0** | refresh FAIL（ordinary 勉强过） |
| glm/main 第 1 次 | 29.6 / 59.1 / 173.3 | ~80 / ~90+ | FAIL |
| glm/main 第 2 次 | 37.0 / 55.5 / 101.3 | 103.7 / 163.4 | FAIL |

- **refresh gate 在基线与本分支全部失败**，与历史受治理记录一致（c642cda subject refresh P95 96.3ms > 50ms，见 phase plan / m15 ledger）：既有失败，属 Map PR1/PR2 性能任务范围，非本任务回归。
- ordinary p95 本机单次样本波动大（基线单次 47.5，本分支 55.5–59.1；两分支 p50 同量级 29–37ms）。结构性分析：viewport 实现不进入移动路径（无逐帧工作、无 rAF 循环、仅在 carrier 安装时发布一次 baseline、2 个静态 listener），不存在使 ordinary p95 系统性 +10ms 的机制；本机非受治理 CI 环境，结论以托管 CI 复跑为准。
- M15 在改动前后均为 **Requalification Pending**，本交付不改变其状态、不将本地失败写成 PASS。

## 5. NOT RUN（如实记录）

- **GitHub Actions 托管 Node 20/24 CI**：分支尚未开 PR；`data.yml` 已串接 rev3 套件，将在 PR/push 时执行。
- **PWA 平台验证**：属 M16/M17 里程碑，未运行。
- **Map PR0/性能**：独立 Map 任务，未运行。

## 6. Cohort artifact manifest（真实产出，无预填）

构建命令：`npm run build:packages` + `npm run build:m15`（含 apps/desktop tsc+esbuild），于本分支 worktree 一次性产出：

```text
@loomrealm/data 0.1.0-alpha.0        dist/（含 viewport-codec.js, viewport-sender.js）
@loomrealm/subsystem 0.1.0-alpha.0   dist/（含 viewport.js, internal/viewport-manager.js）
@loomrealm/renderer 0.1.0-alpha.0    dist/（含 viewport.js；control.js 含 viewport seam）
@loomrealm/desktop 0.1.0-alpha.0     dist/（含 renderer-viewport-source.js；renderer bundle 含 viewport source）
```

npm pack dry-run（m13/m14 链内）成功；renderer tgz shasum `30f25066f7b1ce6b023d4da8d49be693b999e9e2`（dry-run notice，非发布）。dist 为构建产物不入库；可执行 subject 以 git commit SHA 唯一锚定（ledger 记录最终 tip）。
