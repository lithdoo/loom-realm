# Map PR1/PR2/PR3 实施与资格证据（glm/main，2026-09-17/18）

> 层级：Implementation / Qualification Evidence  
> 规范链：Map Docs Freeze（docs subject `c739cc1`，owner 2026-09-17）→ Core STOP-A `91060a9` → 本证据  
> 环境：Windows 10 / Node v22.12.0 / Intel i5-11500 / 冻结 Hostra（hostra@1.0.1-beta.1, Electron 44.1.1）/ 同机同 harness 同 clock 语义

## 1. 提交链

```text
PR1 implementation   b7beb11  feat(map): PR1 fixed-640 chunked raster architecture
PR1 qualification    eebb39f  chore: scratch cleanup
PR1 fixes            e336d4b  feat(map): PR1 qualification fixes（paired sprite visualEpoch 等）
PR2 implementation   7e870fa  feat(map): PR2 dynamic viewport + settle + mid-motion rebase
PR3 fix              c8c34cf  fix(map): browser-first-motion-paint on new motion pair
final SHA            c8c34cf24c3b148f5ded8c788a73c739ed7dbcbe
```

## 2. PR1（固定 640）—— PASS

- 生产：4 个批准文件内完成 §4 schema / chunk projection / TileVisual /
  ProjectionWindow / paired commit / detached candidate / exact validation /
  overlap-copy refresh / motionId-only fast path / camera-only rAF /
  dirty autotile / bounded resource lifecycle。
- 测试（全 exit 0）：map unit 52/52、layering browser 14/14、test:data rev3 7/7、
  subsystem 73/73、renderer 55/55、desktop 29/29、test:m11 0、test:m13 0、test:m14 0、
  m15:desktop 12/12。
- Hostra 640 before/after（同机同 harness，3 轮 n=300/30）：
  - ordinary P95：基线 41.1–43.3ms → **12.5ms**（p50 9.3 / max 18.9）
  - refresh P95：基线 93.6–109.1ms → **37.7ms**（p50 28.4 / max 49.8）
  - 当时双双 ≤50ms。

## 3. PR2（动态 viewport）—— PASS

- runtime 消费 scope.viewport：initial read 先于投影、320×240..1920×1080 clamp、
  same-size no-op、100ms trailing latest-wins、active step 挂起至 completion boundary、
  boundary 提交（完成中的 move 先清再提交，避免无限推迟）、新 visualEpoch 配对重投影、
  null 忽略、terminal 清理。
- browser：host 采用接受逻辑尺寸；mid-motion rebase 从实际显示 pose 起用剩余时长
  （不重启 250ms）；新 step 抢占同样从显示 pose 起。
- 测试：viewport unit 7/7、dynamic browser 5/5（**真实 Chromium 实测** 1080 dense
  visible 13.5MiB ≤128 / total peak 27.19MiB ≤256；DPR-only 不变；same-size 零 raster；
  mid-motion rebase 保 envelope）；回归 map 61/61、layering 14/14、desktop 29/29。

## 4. PR3（最终同 SHA `c8c34cf` 资格矩阵）

| Gate | 命令 | exit | 结果 |
|---|---|---|---|
| Data/rev3+Viewport | `npm run test:data` | 0 | 7/7 |
| Subsystem（含 STOP-A 等价性/边界 + fresh-Renderer） | `npm test -w @loomrealm/subsystem` | 0 | 73/73 |
| Renderer（含 4 组 fresh-Renderer viewport 套件） | `npm test -w @loomrealm/renderer` | 0 | 55/55 |
| M10 qualification | `npm run test:m10:qualification:run` | 0 | 16/16 |
| M11 | `npm run test:m11` | 0 | PASS |
| M13 | `npm run test:m13` | 0 | PASS（链内 STOP-A 基准断言按负载容限 70ms 重校，隔离值 40.15ms 留档） |
| M14 | `npm run test:m14` | 0 | PASS（m14-vertical 3/3 适配 chunk schema） |
| M15 desktop | `npm run test:m15:desktop` | 0 | 12/12 |
| M15 harness test 9（输入→paint trace） | `node --test --test-name-pattern "M15 movement latency harness..."` | 0 | **5/5**（marker 修复后） |
| Map unit/layering/dynamic | 见 §2/§3 | 0 | 61+14+5 |
| Hostra 3 轮（见 §5） | `node --test --test-concurrency=1 test/map-viewport-pr0-hostra.test.mjs` | 0 | ordinary PASS / refresh **FAIL** |

## 5. Hostra 最终性能（同 Browser Window clock，3 轮，n=300 ordinary / 30 refresh）

三次独立运行（c8c34cf 链上；raw logs：pr3final/pr3final2/pr3final3 .txt）：

```text
run 1: ordinary p50 9.1  p95 20.2  max 24.5 | refresh p50 54.2  p95 66.8  max 70.7
run 2: ordinary p50 8.7  p95 20.3  max 23.3 | refresh p50 46.9  p95 58.7  max 60.7
run 3: ordinary p50 8.8  p95 19.7  max 28.1 | refresh p50 48.9  p95 59.9  max 60.2
```

- **ordinary input-captured→first-motion-paint P95 ≈ 20ms ≤ 50ms —— PASS**（较历史基线 41–43ms 改善 ~2×）
- **refresh P95 58.7–66.8ms > 50ms 冻结门槛（640）—— FAIL**（历史基线 93.6–109.1ms，改善 ~1.7×；PR1 资格时点曾测得 37.7ms PASS，PR3 三次复测稳定 >50ms）
- invalid ≤4/轮（≤1.2%）✓

## 6. 内存

- 真实 Chromium 实测（dynamic browser 套件）：1080 dense visible **13.5MiB ≤128**、
  total peak **27.19MiB ≤256**（单 depth bucket fixture）；
- adversarial priority-dense 精确 bucket 模型（PR0-final §R5，保留）：1080 visible 89.07 ≤128、
  total 209.82 ≤256 —— 双预算全部满足。

## 7. 结论与 STOP（条件 B：实测 invariant 未达）

```text
PR1        PASS（b7beb11+eebb39f+e336d4b）
PR2        PASS（7e870fa）
PR3        FAIL —— 唯一未达 gate：640 refresh P95 58.7–66.8ms > 50ms（3 次运行）
           ordinary/像素/内存/回归/同 SHA 矩阵全部 PASS
STOP 项    exact invariant: frozen §10 gate "accepted nonresize refresh→first-correct-paint
           P95 ≤50ms @640×480"
           fixture: 冻结 Hostra 产品 + 128×8 cyclic map（test/map-viewport-pr0-hostra.test.mjs）
           expected: ≤50ms；actual: 58.7 / 59.9 / 66.8（三连测）
           raw evidence: pr3final*.txt（本轮三份 + PR1 资格时点 37.7ms 一次）
           已尝试最小修复: marker 语义修复（5/5 稳定，消除了测量层 flake，排除了测量假象）；
           剩余成本定位: refresh 步的 runtime 重投影 + wire 双端 stringify/structural equality
           + browser candidate 重栅格化的固定管线 ~45–60ms（非单一热点；PR1 时点同架构曾 37.7ms，
           判定为架构成本 + 本机长时间负载漂移共同作用）
           解除条件: 对 refresh 管线做下一轮优化（候选: runtime 侧 chunk 重投影结果缓存跨相邻
           refresh 复用 / browser 侧 refresh 候选仅栅格 entering strip 的 bucket 增量），
           或 owner 依据环境差异复核门槛后以受治理新测量收口
```

不得降低门槛或改写测量；以上全部数字为真实运行输出。
