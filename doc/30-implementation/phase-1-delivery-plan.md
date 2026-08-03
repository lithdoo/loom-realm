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
- Launch Attempt / Bootstrap Context / Token-before-spawn；
- Runtime Supervisor exit classification；
- Desktop v1 no automatic restart；
- Subsystem Control Protocol v1 全部 Frozen；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame / Call 与 Subsystem Control 是独立协议域；
- Frame / Call v1 Batch A：Identity / Authority / Lifecycle / Activation 已 Frozen；
- `frameId` Main-generated、Session unique、never reused；
- Frame 永久绑定 `descriptor.key` 与 immutable `callerFrameId`；
- Frame lifecycle = `starting / active / suspended / closing / closed`；
- `completed / cancelled / failed` = outcome，不是 lifecycle state；
- Frame v1 没有 `ready / initialized / frame.status`；
- Activation Main-generated、Session unique、never reused / never rolls back；
- 只有 active Frame 拥有 current Activation；
- 稳定 Stack Top active、其他 live Frame suspended；
- Render = Subsystem-owned context；
- 每 Subsystem 一个 Runtime Container / 一个 Renderer System Data Connection。

仍需冻结：

```text
Frame / Call Batch B
    7 RPC final Schema / pre-postcondition

Frame / Call Batch C
    Call/Return transaction / commit barrier / rollback

Frame / Call Batch D
    error / timeout / retry / cancellation

Frame / Call Batch E
    Runtime failure unwind

Frame / Call Batch F
    limits / fixtures / profile completion

Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
Render Update
User Input
Render State
```

明确暂缓，不作为里程碑 0 缺口：

- PWA Launcher Descriptor / Bootstrap Credential / Control Transport 映射；
- 第二种 Desktop Launcher Type；
- executable sandbox / Publisher Trust / signing；
- automatic Runtime restart / resume / checkpoint；
- application-level Control heartbeat；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- 多主栈 / 一般 Frame Graph；
- Frame migration；
- Activation reuse / persistent resume。

关闭条件：Launcher、Subsystem Control、Frame Batch A 都已有权威 Contract / ADR；旧 Frame 生命周期草案路径与旧 Frame-scoped Render 契约均明确 Legacy。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：不创建任何 Frame 也能完成完整 Subsystem Runtime Bootstrap、Control identity、ready、正常 shutdown 与失败收敛。

- 实现 Manifest / Entry / Descriptor Loader；
- 实现 Launcher Entry / env 校验；
- 实现 Launcher Target Resolver；
- 实现 Node.js Launcher：Host-selected Node、shell=false、cwd=Installation Root；
- 实现显式 child environment 与 `LOOMREALM_BOOTSTRAP_CONTEXT`；
- 实现 Launch Attempt / Bootstrap Token；
- 实现 Runtime Supervisor；
- 实现 Main Control WebSocket Endpoint；
- 实现 `subsystem.hello` / version / connection-bound identity；
- 实现 `subsystem.status` lifecycle；
- 实现 Main-owned shutdown intent；
- 实现 `subsystem.shutdown(session-end | bootstrap-abort)`；
- 实现 finite shutdown deadline / force termination；
- 实现 Subsystem Control semantic error / wire limits / failure semantics；
- 明确不实现 application-level heartbeat、same-attempt reconnect / resume 或 automatic restart；
- 任一 required Runtime 无法 ready 时 Game Bootstrap 失败并清理其他 Runtime。

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

## 里程碑 2：Frame / Call Control

目标：在已经 ready 的 Runtime Container 上完成 Frame 调用栈与 ordinary input control，且不重新定义 Subsystem Control v1。

### 已冻结基线：Batch A

实现现在可以直接依赖：

- `frameId` Main-generated / Session unique / never reused；
- permanent `frameId → subsystemKey`；
- immutable `callerFrameId`；
- lifecycle only `starting / active / suspended / closing / closed`；
- outcome 与 lifecycle 分离；
- no Frame `ready / initialized / frame.status`；
- active ↔ currentActivationId；
- fresh Activation on first active / every reactivation；
- revoked Activation permanently invalid；
- stable Stack Top active / lower live Frames suspended；
- no two ordinary Input Targets；
- Frame 只能在 ready + no-shutdown-intent Runtime 上建立；
- Frame lifecycle 不控制 Runtime / Render / Data Connection。

### 下一冻结批次：Batch B

冻结最终 wire Schema：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

同时冻结：

- params/result Schema；
- method type / direction；
- operation precondition / postcondition；
- Frame / Activation ID wire constraints；
- business JSON value shape。

### Batch C

冻结：

- initial Frame transaction；
- child call establishment；
- return / caller resume；
- suspend / activate / resume commit barrier；
- Main ⇄ Renderer Input Target publication happens-before / happens-after 关系；
- rollback boundaries；
- Activation never rolls back 的事务实现。

### Batch D

冻结：

- initialize business rejection；
- lifecycle control divergence；
- semantic error code；
- timeout；
- no application retry；
- cancellation scope。

### Batch E

冻结：

- Runtime failure multi-Frame suffix-unwind；
- initial Frame failure；
- best-effort close；
- surviving caller failed outcome + fresh Activation resume。

### Batch F

冻结：

- wire limits；
- complete conformance fixtures；
- Desktop / PWA transport-independent fixture；
- Frame / Call protocol profile/version completion；
- 整体协议转 Active / Normative / Frozen。

关闭条件：

```text
Frame create
    does not spawn Runtime
    does not create Render
    does not create per-Frame Transport

Frame return/failure
    outcome separate from lifecycle cleanup

Activation
    no reuse / no rollback / stale input rejected
```

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized、per-Subsystem Data Transport，并遵守 Frame Batch C 的 Input Target commit barrier。

- 冻结 Main ⇄ Renderer Control Protocol；
- 发布 ready / stopping / stopped / failed Subsystem 状态；
- 发布 Frame Stack / lifecycle / current Activation / Input Target；
- 不发布两个同时有效 ordinary Input Target；
- 冻结 Connection Protocol identity / auth / version；
- 实现 Desktop WebSocket Data Grant；
- 实现 Renderer System Data Connection Registry；
- Runtime stopping / failed 后不再签发新的 Data Grant；
- Renderer reload 根据 ready Subsystem / Grant 恢复连接。

关闭条件：Renderer 不从 Frame 集合发现 Subsystem，也不为每 Frame 创建 Transport。

## 里程碑 4：User Input Protocol

目标：建立纯 Frame/Input 域闭环。

- 冻结 `subsystemRef + frameId + activationId` 路由；
- 继承 Batch A：只有 active/current Activation 合法；
- 实现 stale/revoked Activation rejection；
- 实现 continuous intent latest/current-wins；
- 实现 discrete action 有序队列；
- 实现 input reset；
- 页面 blur、Input Target 改变、Activation 改变正确释放持续输入；
- 同 Subsystem 多 Frame 输入相互隔离。

关闭条件：输入只到 Main 声明的当前 Input Target；输入协议不依赖 Render identity。

## 里程碑 5：Render Update 与 Web Renderer

目标：在没有 Frame ownership 前提下建立声明式 Render 闭环。

- 冻结 Render identity；
- 冻结 Render create/update/destroy/recovery；
- 冻结 Render State / Scope / Node；
- 冻结 Revision / Event / backpressure；
- 实现 Render Registry / Store / Scheduler；
- 实现 DOM / Canvas / WebGL Reconciler；
- 实现 `render-without-frame`；
- 实现 Frame closed 但 Render 保持；
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

关闭条件：业务内容通过逻辑 Content API 读取；Launcher 与 Content 权限不混用。

## 里程碑 7：`loom.map` 最小运行时

目标：完成原创测试内容地图纵向闭环。

- 实现 Subsystem Control Adapter；
- 实现 Frame Control / Input Adapter；
- Frame Context 按 `frameId` 路由；
- active/current Activation 输入接受，旧 Activation 拒绝；
- 实现 Session Coordinator / Execution Loop / Runtime Core；
- 实现方向意图、移动、碰撞和 Portal；
- 实现 Render Manager / Render Projector；
- world/hud/loading Render 使用 Render Protocol 发布；
- 正确响应 `subsystem.shutdown`；
- 验证一个 `loom.map` Process 服务多个 Frame/Input Context；
- 验证 Frame lifecycle 不隐式销毁地图 Render。

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
- 同一 Subsystem Control WebSocket 逻辑承载 Subsystem Control v1 + Frame / Call；
- Renderer ⇄ Subsystem 每 Subsystem 一条 Data WebSocket；
- Data WebSocket 内拆分 Connection / Render Update / User Input；
- Origin / credential / loopback 校验；
- Renderer reload 独立恢复 Control、Input 与 Render；
- 有限关闭和强制终止。

## 里程碑 10：PWA Transport Profile

- Main Runtime Dedicated Worker；
- 每 Subsystem 一个 Dedicated Worker；
- 冻结 Descriptor → Worker Script / Bootstrap Credential；
- 冻结 Main ⇄ Subsystem Control MessagePort Profile；
- 映射 Subsystem Control v1；
- 映射 Frame Batch A identity/lifecycle/Activation；
- Window ⇄ Subsystem 每 Subsystem Data MessagePort；
- Service Worker Content API；
- OPFS 安装；
- 页面隐藏/恢复。

Transport 差异不得改变已经 Frozen 的协议语义。

## 第一阶段最终验收

- Game Entry 一次声明全部 Subsystem；
- Launcher / Subsystem Control v1 符合 Normative Contract；
- Frame / Call v1 完成 Batch A-F 并 Frozen；
- `frameId` / `activationId` 不复用；
- Frame outcome 与 lifecycle 分离；
- Frame v1 无 ready/status；
- stale Activation 永久拒绝；
- 每 Subsystem 最多一个有效 Runtime Container；
- 同一 Container 可承载多个 Frame/Input Context；
- Frame 不拥有 Render；
- Renderer 与每 Subsystem 最多一个有效 Data Transport；
- User Input 只到当前 active Input Target；
- Render 可在零 Frame 时存在；
- Frame suspend/resume/close 不自动影响 Render；
- Renderer reload 不从 Frame 集合推导 Render/Data Connection；
- Content API 只读且路径安全；
- Hostra 不承载 LoomRealm Main。

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
- 多主栈 / 一般 Frame Graph；
- Frame migration；
- Activation reuse / persistent resume；
- 完整菜单、对话、战斗和任务；
- 多人同步和客户端预测；
- 高级 Canvas/WebGL 优化；
- ZIP / ASAR / remote game package。
