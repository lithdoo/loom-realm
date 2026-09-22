# Battle 游戏库（设计占位包）

> 状态：**Design only / 未实现**。本目录当前只有包清单与设计文档；没有 `src/`、运行入口、导出、依赖、构建脚本或测试。不要把它当作已经可以加载的 LoomRealm Subsystem。

设计主文档：[`docs/BATTLE_V0_DESIGN.md`](./docs/BATTLE_V0_DESIGN.md)。

## 一句话定位

Battle 在同一个 Subsystem Frame 内驱动一场双 Actor 回合制战斗：**复用 RPGMap 的地图、通行与角色行走；Battle 负责回合、技能和结算；LLM 从合法行动中作选择；技能效果仅在目标格叠加贴图渐显渐隐。** 玩家未来通过四选一提示卡扮演训练师；提示词优化、学习及跨战斗记忆不属于 v0。

## 当前真实依赖及待实现点

- RPGMap 目前的运行实现仍以单一 Player + 键盘移动为中心；已设计但未交付的 RPGMap v1 NPC 为静态角色。Battle 所需「双方 Actor 均可被程序按 ID 驱动移动」尚不能视为已存在。
- `SubsystemScope` 尚无公开 LLM 服务能力；真实模型接入需要独立的受控服务边界。
- 现有 Web Presentation 是只读投影；四选一按钮输入以及格子贴图与 Map View 的对接，需要在实施前确认契约，不能让 DOM 直接改战斗状态。
- 这里只创建包占位和文档；没有修改 Map、Main、Renderer、Hostra 或现有示例。

## npm workspace 注意

根 `package.json` 使用 `game-libs/*` workspace 通配符，因此本目录添加 `package.json` 后也会被 npm 识别为新的 workspace。**此设计分支尚未同步根 `package-lock.json`，不能视为可直接合并的完整 npm 工作区变更；在准备合并或实施前，应在具备仓库环境的工作树运行 `npm install --package-lock-only --ignore-scripts` 并提交锁文件，随后验证 `npm ci`。** 此处未声称构建或测试通过。
