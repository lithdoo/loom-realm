# Frame-targeted Presentation Events Qualification

> 状态：Implementation qualification
> Contract：[Web Presentation API v3](../15-contracts/web-presentation-api-v3.md)、[Renderer Data Profile v3](../15-contracts/renderer-data-profile-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> 实施主线：[Frame-targeted Web Presentation Events](./frame-targeted-presentation-events.md)
> 日期：2026-10-23

## 1. Qualified topology

```text
current Web Presentation RenderNode
  → Control v2 stack.at(-1) TopFrameLease(S,F,A)
  → exact presentation.interest[S][F][channel]
  → target Renderer Data /3 peer (single DataRuntime writer)
  → PresentationEventManager
  → exact live Frame/Activation listener
```

boolean `false/true` 继续走既有 Platform → Session Events publication。`"top-frame"` 在 Renderer 内分支，不修改 Session Events、Main Frame authority 或 Control v2 wire。

## 2. F01–F30 executable evidence

| ID | 自动化证据 |
| --- | --- |
| F01 | `packages/renderer/test/presentation-seam.test.mjs`：省略/false publication regression |
| F02 | 同上：`broadcast:true` Session-wide publication regression |
| F03 | 同上：no active top silent drop，Platform publication 计数保持 0 |
| F04 | 同上：owner 与 Battle target 不同，wire source provenance 保持 owner |
| F05 | `packages/renderer/test/presentation-frame-gate.test.mjs`：A1 queue 在切 B1 后丢弃 |
| F06 | `packages/subsystem/test/presentation-events.test.mjs`：in-flight stale Activation receiver drop |
| F07 | Renderer Gate + Subsystem manager：A1→B1→A2 不执行旧 Event |
| F08 | Subsystem manager + Runtime carrier vertical：同 Subsystem parent/child 只调用 exact Frame |
| F09 | manager `deliveryOpen=false` gate |
| F10 | manager closeFrame cleanup 与 Interest shrink |
| F11 | Interest 安装前 drop、安装后 Effective；Runtime fresh publish |
| F12 | Gate Interest shrink fences queued work |
| F13 | manager fresh peer 自动 full Interest republish |
| F14 | Gate target peer replacement 清旧 queue |
| F15 | 既有 Web Projector stale-currentness regression；source retirement Gate test |
| F16 | Renderer seam invalid current `broadcast:"bad"` 同步 TypeError |
| F17 | Data presentation closed schema 与 wrong-direction protocol-fatal |
| F18 | manager sync throw / Promise rejection local isolation |
| F19 | Renderer top-frame Platform publication 0；manager 与 `scope.events` 独立 |
| F20 | 独立 Presentation client 不接收 Session Events；boolean regression 保持原路由 |
| F21 | Renderer、Data、Subsystem 全包 `render.event` regression |
| F22 | Data `/2` binding 在 claim reader 前拒绝；历史 v2 contract 未改写 |
| F23 | `apps/desktop/test/m9-vertical.test.mjs`：Renderer → Desktop Broker/WebSocket → Hostra process → Frame listener |
| F24 | `apps/pwa/test/frame-targeted-presentation.test.mjs`：Renderer → PWA Broker/MessagePort → Runtime → Frame listener |
| F25 | Main/Renderer Control/Data/Subystem `/3` cohort tests与 `/2` mismatch fail-closed |
| F26 | Gate 300 Event burst：1 in-flight + 256 pending、FIFO、overflow drop、无 Data local-fatal |
| F27 | manager unbound/foreign/closed/rebind rejection；Runtime close/terminal cleanup |
| F28 | Gate source current predicate与 target/source peer identity fencing |
| F29 | 第一个 handler 关闭 delivery 后 sibling 不执行；异常隔离 |
| F30 | 新 Activation 无 retained state/edge replay，仅新 State 更新 |

## 3. Qualification commands

最终 PR subject 上执行并记录：

```text
npm run test:frame-targeted-presentation:qualification
npm run test:game-common-controls-input:qualification
npm run test:regression
npm run docs:check-links
npm run docs:build
```

实际结果在提交前的 final qualification pass 后补充；任何未运行命令不得标记为 PASS。

## 4. Compatibility conclusion

- current runtime cohort 是一次性 `/3` 升级，不支持 `/2`/`/3` 混搭；
- Control protocolVersion 保持 2；
- old `/2` 和 User Input v1 文件保持历史冻结；
- Session Events 源码、Hub、Carrier、Client、Desktop/PWA routing 与 Hostra provisioning无功能修改；
- Desktop/PWA Broker 只搬运 `/3` Data carrier，不解析 Frame 或 `presentation.event`。
