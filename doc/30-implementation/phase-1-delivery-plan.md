# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-02

本计划按当前架构依赖顺序组织实施。

## 里程碑 0：文档与契约基线

目标：两个独立实现对 Subsystem、Frame/Input、Render 和 Content 的边界理解一致。

已收敛：

- Descriptor identity = `key`；
- Desktop MVP Launcher = `nodejs`；
- Game Entry 一次声明全部 required Subsystem；
- eager all-required Bootstrap；
- Control Protocol v1 `subsystem.hello` / `subsystem.status`；
- `connected ≠ identified ≠ ready`；
- Frame = call/input context；
- Render = Subsystem-owned context；
- 每 Subsystem 一个 Runtime Container / 一个 Renderer System Data Connection。

仍需冻结：

- Game Package v2 / Descriptor Schema；
- `launcher.entry` 路径与安全；
- Frame / Call Protocol；
- Main ⇄ Renderer Control Protocol；
- Renderer ⇄ Subsystem Connection Protocol；
- Render Update Protocol；
- User Input Protocol；
- Render State Contract。

关闭条件：旧 Frame-scoped Render 契约已降为 Legacy，新实现不再依赖旧 Client State ownership。

## 里程碑 1：Game Package v2 与 Desktop Bootstrap

目标：不创建任何 Frame 也能完成完整 Subsystem Runtime Bootstrap。

- 实现 Manifest / Entry / Descriptor Loader；
- 实现 duplicate `key` / unsupported Launcher 校验；
- 冻结并实现 `launcher.entry` 安全边界；
- 实现 Node.js Launcher；
- 实现 Launch Attempt / Bootstrap Credential；
- 实现 Main Control WebSocket Endpoint；
- 实现 `subsystem.hello` / version negotiation；
- 实现 `subsystem.status` lifecycle；
- 并行或顺序启动全部声明 Subsystem；
- 任一 required Subsystem 无法 ready 时 Game Bootstrap 失败。

关闭条件：测试游戏声明多个 Subsystem 时，Main 在 Frame 创建前完成全部 Runtime ready，并正确拒绝伪造 hello / token / key / version。

## 里程碑 2：Frame / Call Control

目标：在已经 ready 的 Runtime Container 上验证调用栈和输入上下文。

- 冻结 Frame initialize / activate / suspend / resume / close；
- 冻结 call / completed / cancelled / failed；
- 实现 Frame Registry / Stack / Activation / Input Target；
- 实现三层嵌套调用；
- 实现同一 Subsystem 多 Frame/Input Context；
- 实现旧 Activation 拒绝；
- 实现 Runtime failure 调用链处理。

关闭条件：Frame 创建不启动新 Process/Worker，不创建 Render，不建立 per-Frame Transport。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized、per-Subsystem Data Transport。

- 冻结 Main ⇄ Renderer Control Protocol；
- 发布 ready Subsystem 状态；
- 发布 Frame Stack / Activation / Input Target；
- 冻结 Connection Protocol identity / auth / version；
- 实现 Desktop WebSocket Data Grant；
- 实现 Renderer System Data Connection Registry；
- 验证零 Frame Subsystem 仍可建立/保持 Data Connection；
- Renderer reload 根据 ready Subsystem / Grant 恢复连接。

关闭条件：Renderer 不从 Frame 集合发现 Subsystem，也不为每 Frame 创建 Transport。

## 里程碑 4：User Input Protocol

目标：建立纯 Frame/Input 域闭环。

- 冻结 `frameId + activationId` 路由；
- 实现 continuous intent latest/current-wins；
- 实现 discrete action 有序队列；
- 实现 input reset；
- 实现 Input Router / Frame Input Registry；
- 页面 blur、Input Target 改变、Activation 改变正确释放持续输入；
- 同 Subsystem 多 Frame 输入相互隔离。

关闭条件：输入只到 Main 声明的当前 Input Target；输入协议不依赖 Render identity。

## 里程碑 5：Render Update 与 Web Renderer

目标：在没有 Frame 绑定前提下建立声明式 Render 闭环。

- 冻结 Render identity；
- 冻结 Render create/update/destroy/recovery；
- 冻结 Render State / Scope / Node；
- 冻结 Revision / Event / backpressure；
- 实现 Render Registry / Store；
- 实现 Render Scheduler；
- 实现 DOM / Canvas / WebGL Reconciler；
- 实现 `render-without-frame` 测试 Subsystem；
- 实现一个 Frame 关闭但 Render 保持的测试；
- 实现多个 Frame 影响共享 Render 的测试；
- Renderer reload 按 Render Protocol 恢复，而非逐 Frame resync。

关闭条件：Frame suspend / close 不产生隐式 Render 行为；Renderer 不以 Stack order 作为 Render z-order。

## 里程碑 6：Content API 与游戏内容

目标：安全打开只读内容并按需读取。

- 实现 Safe Package Root；
- 实现 Catalog / Package Index；
- 实现 Repository Toolkit；
- 实现 FSDB localhost Readonly HTTP Content Service；
- 实现 resource route、MIME、ETag、Content Version；
- 实现 `validate` 聚合错误。

关闭条件：Runtime / Renderer 只通过逻辑 Content API 读取业务内容；Launcher 与 Content 权限不混用。

## 里程碑 7：`loom.map` 最小运行时

目标：完成原创测试内容地图纵向闭环。

- 实现 System Control Adapter；
- 实现 Frame Input Adapter；
- 实现 Session Coordinator；
- 实现 Execution Loop / Runtime Core；
- 实现方向意图、移动、碰撞和 Portal；
- 实现 Render Manager / Render Projector；
- world/hud/loading Render 使用 Render Protocol 发布；
- 验证一个 `loom.map` Process 服务多个 Frame/Input Context；
- 验证 Frame lifecycle 不隐式销毁地图 Render。

关闭条件：两张原创测试地图可双向往返；Render 与 Frame 解耦测试通过。

## 里程碑 8：Pokémon Essentials 兼容工具链

- 定义导出中间 JSON Schema；
- 导入三个 Tile 层和原始 Tile ID；
- Autotile 预编译；
- Passage / Priority / 人物行走图；
- Golden Fixture；
- 受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

- LoomRealm Main 独立于 Hostra Main；
- Hostra 只打开/管理 Renderer BrowserWindow；
- Renderer ⇄ Main 一条 Control WebSocket；
- Subsystem → Main 每 Subsystem 一条 Control WebSocket；
- Renderer ⇄ Subsystem 每 Subsystem 一条 Data WebSocket；
- Data WebSocket 内拆分 Connection / Render Update / User Input；
- Origin / credential / loopback 校验；
- Renderer reload 独立恢复 Control、Input 与 Render；
- 有限关闭和强制终止。

关闭条件：Main/Hostra 不转发普通输入或 Render State；Frame lifecycle 不决定 Render/Data Transport lifecycle。

## 里程碑 10：PWA Transport Profile

- Main Runtime Dedicated Worker；
- 每 Subsystem 一个 Dedicated Worker；
- Bootstrap 阶段建立全部 required Worker；
- Main ⇄ Subsystem 每 Subsystem Control MessagePort；
- Window ⇄ Subsystem 每 Subsystem Data MessagePort；
- Service Worker Content API；
- OPFS 安装；
- 页面隐藏/恢复；
- Frame Input 与 Render 独立恢复。

关闭条件：PWA 与 Desktop 保持相同 Subsystem/Frame/Render 所有权语义；PWA Launcher Descriptor 映射若仍未冻结，不得伪装成跨平台稳定契约。

## 第一阶段最终验收

- Game Entry 一次声明全部 Subsystem；
- Desktop MVP `key + nodejs + eager all-required bootstrap`；
- `connected ≠ identified ≠ ready`；
- 每 Subsystem 最多一个有效 Runtime Container；
- 同一 Container 可承载多个 Frame/Input Context；
- Frame 不拥有 Render；
- Renderer 与每 Subsystem 最多一个有效 Data Transport；
- User Input 只到当前 active Input Target；
- Render 可在零 Frame 时存在；
- Frame suspend/resume/close 不自动影响 Render；
- Renderer reload 不从 Frame 集合推导 Render/Data Connection；
- 两张地图移动、碰撞、Portal 正常；
- Content API 只读且路径安全；
- Hostra 不承载 LoomRealm Main；
- 公共仓库不包含无再分发权素材。

## 暂缓

- Save System；
- 未声明的任意插件执行；
- 第二种 Desktop Launcher Type；
- 在线系统商店和签名；
- 多主栈和后台 Frame Graph；
- 完整菜单、对话、战斗和任务；
- 多人同步和客户端预测；
- 高级 Canvas/WebGL 优化；
- ZIP / ASAR / remote game package。