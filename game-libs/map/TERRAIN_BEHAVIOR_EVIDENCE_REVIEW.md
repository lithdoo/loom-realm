# 地形行为证据复核（Map 7 严格扫描 + Map 21 静态正例）

> 状态：**Review / evidence scope only / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 续轮关闭前次复核列出的取证器缺口，并完成 Map 21 静态取证。原始事实以 [证据文档](./TERRAIN_BEHAVIOR_EVIDENCE.md) 为准（Map 7 复核 + §14）。本文件不再把 Map 21 写成「尚未取证」；动态 RGSS、Map 47、可分发 fixture 仍 OPEN。

## 1. 地图职责与事实边界（替代所有旧的 Map 7 桥正例要求）

| 地图 | 本轮职责 | 已有证据 | 尚不能宣称 |
|---|---|---|---|
| Map 7 Cedolan City | **Bridge 负例** | 严格扫描后仍为 11/19/521、cells=0、candidates=0、completeness=COMPLETE、provenNegativeBridge=true；新增覆盖移动路线 45、111 type 12（8 条 `get_self.onEvent?`）、117 图、缺表 INCOMPLETE | 不能索取 Map 7 桥头 ID；不能用它做桥上/桥下逐帧验收 |
| Map 21 Route 2 | **Bridge 正例（静态取证已完成）** | §14：93 格/5 簇、8 个确认事件命令序列、2 个进化邻接非桥、`size()` 源码链、四组 STATIC-INFERRED 路线、传送审计无已证实误删 | 未跑原版逐帧；不是玩法实现；不能标 FG-01 整项 PASS |
| Map 47 Route 7 | Ledge 正例 | 已有问题分析；本轮只知不放置 Bridge 图块 | 尚无完整 Ledge 路线取证；不得标 FG-01 PASS |
| Map 27 Day Care | 排除的误认样本 | 室内地图，不是桥正例 | 不以 Map 27 代替 Map 21 |

“本 corpus 唯一发现 Map 21”仍限于官方 v21.1 本地 69 个 `Map*.rxdata` 以及取证器已实现入口（355/655、move-route 45、111 type 12、117 图、tag 15、名称/注释）。方法体内部间接 Ruby 与 RGSS 动态行为不在证明范围内。本轮已实际读取本地 FSDB 并重跑提取；仍未运行原版游戏。

## 2. 前次审查项本轮关闭情况

1. **已补强。** 取证器扫描 355/655（`command_355` 拼接）、page `@move_route` 与 209/509 中 code 45、111 type 12（含非默认页）、117 可达图与循环。间接 `send`/`eval` 记 UNVERIFIED。未实现通用解释器，未 eval 素材 Ruby。
2. **已补强。** 缺 Tilesets / 越界 tile ID / 缺 MapInfos / 缺 CommonEvents → `completeness=INCOMPLETE` 且 `provenNegativeBridge=false`，测试覆盖假零。Map 7 在表齐全时仍为 cells=0。
3. **已重跑。** Map 7 与 69 图 corpus：计数未变；corpus completeness=COMPLETE。CLI 默认 Map 7，白名单仅 7 与 21，拒绝 27；Map 21 另有专用 CLI。
4. **本机测试已记。** `node --test map-event-evidence.test.mjs`：18 pass / 0 fail / 0 skip（有 FSDB）。CI 无 FSDB 时 live 项 skip ≠ PASS。仍无合法可分发 golden rxdata。
5. **许可。** 附录 A 保留既有 Map 7 表；Map 21 不入库完整命令。见证据附录 L。

Map 7 零桥结论未被推翻。`Game_Event#start` 仍不是同步脚本。

## 3. Map 21 任务对照（静态已完成）

对照 [证据 §14](./TERRAIN_BEHAVIOR_EVIDENCE.md)。未把 Map 7 CLI 改成任意 map 执行器；未把 Event ID 写入 Runtime。

静态子项均已写入证据 §14。动态 RGSS 日志未产生（明确 UNVERIFIED）。合规 fixture 未入库（FG-05 OPEN）。清单：

- 来源 SHA、全事件/页/命令、117 图、move-route 45：**已记录**。
- 8 个桥事件命令序列 + 2 个进化邻接非桥：**已记录**。
- `size(w,h)` 源码链与 walk-on：**SOURCE-PROVEN**；逐帧：**UNVERIFIED**。
- 四组路线：**STATIC-INFERRED**。
- 传送审计：无已证实误删；D0-false 潜在风险未复现。
- 许可：附录 L；不提交 Map 21 全文。

**输出规范**：证据行包含 `source path + SHA-256 + map/event/page/command or tile x,y,z + v21.1 symbol/link + 观察方式 + 事实/推论/待测 + rule/test ID`；包括零命中覆盖分母、异常/未知统计。Map 21 静态取证只关闭 FG-01 的桥静态子项；Map 47 及其他门禁仍独立开放。

## 4. 门禁和流程同步

- FG-01：**整项 OPEN**。已消除：Map 7 严格扫描假零缺口；Map 21 静态命令/`size()`/路线/传送审计。剩余：Map 47、动态逐帧、间接方法体内 Ruby。
- FG-02：OPEN。Map 21 误删未复现；D0-false 桥格为潜在风险。无字段级合同。
- FG-03：OPEN。静态调用链已证 walk-on；动态帧对齐 UNVERIFIED。禁止同次输入立即重算。
- FG-04：OPEN。
- FG-05：OPEN。本机 18/18 pass 不能代替 CI fixture。
- FG-06：OPEN。

**下一步**：Map 47 Ledge 取证；若有 RGSS，按 §14.6 做带日志的动态验证；许可明确前不提交 Map 21 完整命令。不实施 Bridge/Ledge，不宣告冻结。