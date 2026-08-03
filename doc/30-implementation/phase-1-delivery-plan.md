# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-03

本计划按当前架构依赖顺序组织实施。

## 里程碑 0：文档与契约基线

目标：两个独立实现对 Subsystem、Runtime Bootstrap、Frame/Input、Render 和 Content 的边界理解一致。

已收敛：

- Descriptor identity = `key`；
- Desktop v1 Launcher = `nodejs`；
- Game Entry 一次声明全部 required Subsystem；
- eager all-required Bootstrap；
- Game Package v2 Bootstrap / Descriptor Contract；
- Desktop Node.js Launcher Profile v1；
- `launcher.entry` Installation-relative path / redirect / containment / extension 规则；
- Host-selected Node Runtime、`shell=false`、固定 `cwd`；
- explicit child environment / reserved env；
- Launch Attempt / Bootstrap Context / Token-before-spawn；
- Runtime Supervisor exit classification；
- Desktop v1 no automatic restart；
- Desktop Node.js executable code = trusted code，Entry 安全不等于 sandbox；
- Subsystem Control Protocol v1：`subsystem.hello / subsystem.status / subsystem.shutdown`；
- connection-bound `descriptor.key` identity；
- Main-owned Runtime shutdown intent；
- `stopped` 只来自 Supervisor termination observation；
- JSON-RPC `-32000` + stable `error.data.code` semantic error envelope；
- Subsystem Control v1 wire limits、timeout phase、retry / connection-loss semantics；
- Subsystem Control v1 无 application heartbeat、same-attempt reconnect / resume 或 automatic restart；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame = call/input context；
- Frame / Call 与 Subsystem Control 是独立协议域；
- Render = Subsystem-owned context；
- 每 Subsystem 一个 Runtime Container / 一个 Renderer System Data Connection。

仍需冻结：

- Frame / Call Protocol；
- Main ⇄ Renderer Control Protocol；
- Renderer ⇄ Subsystem Connection Protocol；
- Render Update Protocol；
- User Input Protocol；
- Render State Contract。

明确暂缓，不作为里程碑 0 缺口：

- PWA Launcher Descriptor / Bootstrap Credential / Control Transport 映射；
- 第二种 Desktop Launcher Type；
- executable sandbox / Publisher Trust / signing；
- automatic Runtime restart / resume / checkpoint；
- application-level heartbeat / health probe 扩展；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- Host timeout 默认数值；
- Bootstrap Token 精确熵 / 生成算法。

关闭条件：链路 1 与 Subsystem Control v1 已有 Normative Contract、ADR 与 conformance fixture；旧 Frame-scoped Render 契约已降为 Legacy。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：不创建任何 Frame 也能完成完整 Subsystem Runtime Bootstrap、Control identity、ready、正常 shutdown 与失败收敛。

- 实现 Manifest / Entry / Descriptor Loader；
- 实现 duplicate `key` / unsupported Launcher 校验；
- 实现 Launcher Entry syntax / symlink / containment / case-collision 校验；
- 实现 env reserved-key 与大小校验；
- 实现 Launcher Target Resolver；
- 实现 Node.js Launcher：Host-selected Node、shell=false、cwd=Installation Root；
- 实现显式 child environment 与 `LOOMREALM_BOOTSTRAP_CONTEXT`；
- 实现 Launch Attempt / Bootstrap Token，并保证 Token registration happens-before spawn；
- 实现 Runtime Supervisor / expected-unexpected exit classification；
- 实现 Main Control WebSocket Endpoint；
- 实现 `subsystem.hello` / version negotiation / connection-bound identity；
- 实现 `subsystem.status` lifecycle；
- 实现 Main-owned shutdown intent；
- 实现 `subsystem.shutdown(session-end | bootstrap-abort)`；
- 保证 shutdown intent happens-before shutdown Request / `status(stopping)` 合法性判断；
- 实现 shutdown Response 与 Supervisor-confirmed `stopped` 的分离；
- 实现 finite shutdown deadline / force termination；
- 实现 JSON-RPC semantic error envelope 与稳定 Subsystem Control error code；
- 实现 Subsystem Control v1 wire limits；
- 实现 unexpected Control loss / Process exit failure semantics；
- 明确不实现 application-level heartbeat、same-attempt reconnect / resume 或 automatic restart；
- 并行或顺序启动全部声明 Subsystem；
- 任一 required Subsystem 无法 ready 时 Game Bootstrap 失败；
- Game Bootstrap 失败后对其他已启动 Runtime 建立 `bootstrap-abort` shutdown intent 并统一清理。

关闭条件：

```text
valid Descriptor set
→ all required Process supervised
→ all hello / identified / ready
→ no Frame required

normal shutdown
→ Main shutdown intent
→ subsystem.shutdown
→ Supervisor confirms termination
→ stopped
```

并通过 invalid Entry、reserved env、spawn failure、early exit、invalid/replayed hello、never-ready、unsolicited-stopping、Control disconnect、exit-zero-after-ready、shutdown-fast-exit、shutdown-timeout、ignore-shutdown、wire-limit 与 semantic-error 测试。

## 里程碑 2：Frame / Call Control

目标：在已经 ready 的 Runtime Container 上验证调用栈和输入上下文，不重新定义 Subsystem Control v1。

- 冻结 Frame initialize / activate / suspend / resume / close；
- 冻结 call / completed / cancelled / failed；
- 冻结 Frame / Call error、timeout、rollback 与 Runtime-failure unwind；
- 实现 Frame Registry / Stack / Activation / Input Target；
- 实现三层嵌套调用；
- 实现同一 Subsystem 多 Frame/Input Context；
- 实现旧 Activation 拒绝；
- 实现 Runtime failure 调用链处理；
- 保证 Frame / Call 不定义 Runtime ready / shutdown / reconnect / restart。

关闭条件：Frame 创建不启动新 Process/Worker，不创建 Render，不建立 per-Frame Transport；Frame / Call 只在已认证 Control Connection 上提供独立协议域。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized、per-Subsystem Data Transport。

- 冻结 Main ⇄ Renderer Control Protocol；
- 发布 ready / stopping / stopped / failed Subsystem 状态；
- 发布 Frame Stack / Activation / Input Target；
- 冻结 Connection Protocol identity / auth / version；
- 实现 Desktop WebSocket Data Grant；
- 实现 Renderer System Data Connection Registry；
- Runtime 进入 stopping / failed 后不再签发新的 Data Grant；
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

目标：在没有 Frame ownership 前提下建立声明式 Render 闭环。

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

关闭条件：业务内容通过逻辑 Content API 读取；Launcher 与 Content 权限不混用；文档不把 Content API 限制错误描述为 Node Process OS sandbox。

## 里程碑 7：`loom.map` 最小运行时

目标：完成原创测试内容地图纵向闭环。

- 实现 Subsystem Control Adapter；
- 实现 Frame Input Adapter；
- 实现 Session Coordinator；
- 实现 Execution Loop / Runtime Core；
- 实现方向意图、移动、碰撞和 Portal；
- 实现 Render Manager / Render Projector；
- world/hud/loading Render 使用 Render Protocol 发布；
- 正确响应 `subsystem.shutdown` 并进行有限 cleanup；
- 验证一个 `loom.map` Process 服务多个 Frame/Input Context；
- 验证 Frame lifecycle 不隐式销毁地图 Render。

关闭条件：两张原创测试地图可双向往返；Render 与 Frame 解耦测试通过；Runtime 能按 Subsystem Control v1 正常启动与关闭。

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
- Subsystem Control WebSocket 实现 frozen hello / status / shutdown semantics；
- Renderer ⇄ Subsystem 每 Subsystem 一条 Data WebSocket；
- Data WebSocket 内拆分 Connection / Render Update / User Input；
- Origin / credential / loopback 校验；
- WebSocket ping/pong 只作为 Transport health，不引入 `subsystem.ping`；
- Renderer reload 独立恢复 Control、Input 与 Render；
- Session end 由 Main 建立 shutdown intent → `subsystem.shutdown` → Supervisor termination observation；
- 有限关闭和强制终止。

关闭条件：Main/Hostra 不转发普通输入或 Render State；Frame lifecycle 不决定 Runtime/Render/Data Transport lifecycle；`stopped` 不由 shutdown RPC ACK 推导。

## 里程碑 10：PWA Transport Profile

- Main Runtime Dedicated Worker；
- 每 Subsystem 一个 Dedicated Worker；
- 冻结 Descriptor → Worker Script / Bootstrap Credential 映射；
- 冻结 Main ⇄ Subsystem Control MessagePort Profile；
- 映射 Subsystem Control v1 hello / status / shutdown identity 与 lifecycle semantics；
- 定义 Worker termination observation → stopped；
- 明确 PWA Host health detection，不偷偷增加 Subsystem Control heartbeat；
- Bootstrap 阶段建立全部 required Worker；
- Window ⇄ Subsystem 每 Subsystem Data MessagePort；
- Service Worker Content API；
- OPFS 安装；
- 页面隐藏/恢复；
- Frame Input 与 Render 独立恢复。

关闭条件：PWA 与 Desktop 保持相同 Subsystem/Frame/Render 所有权和 Subsystem Control 生命周期语义；任何 Transport 差异不静默改变协议含义。

## 第一阶段最终验收

- Game Entry 一次声明全部 Subsystem；
- Desktop `key + nodejs + eager all-required bootstrap`；
- Entry / env / spawn / Supervisor 符合 Launcher v1；
- Subsystem Control v1 hello / status / shutdown / error / limits 全部符合 Normative Contract；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Main 拥有正常 Runtime shutdown intent；
- `stopped` 只来自实际 Runtime termination observation；
- 没有 shutdown intent 的 Control loss / Process exit 是 failure；
- Subsystem Control v1 没有 application heartbeat / same-attempt reconnect / resume；
- 每 Subsystem 最多一个有效 Runtime Container；
- unexpected Process exit 不被隐式 restart；
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
- 不可信 executable Sandbox；
- 第二种 Desktop Launcher Type；
- PWA Launcher / Bootstrap Credential / Control Transport 的具体 Profile（里程碑 10 前完成）；
- automatic Runtime restart / resume / checkpoint / crash recovery；
- application-level heartbeat / health probe 扩展；
- same-attempt Control reconnect；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- Host timeout 默认数值；
- Bootstrap Token 精确熵 / 生成算法；
- online system store / Publisher Trust / signing；
- 多主栈和后台 Frame Graph；
- 完整菜单、对话、战斗和任务；
- 多人同步和客户端预测；
- 高级 Canvas/WebGL 优化；
- ZIP / ASAR / remote game package。
