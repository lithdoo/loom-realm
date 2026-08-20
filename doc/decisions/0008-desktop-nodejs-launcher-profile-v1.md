# ADR 0008：Desktop Node.js Launcher v1 旧直接 Entry 模型（历史）

> 状态：Superseded；current Hostra模型见 [ADR 0019](./0019-platform-launch-manifest-boundary.md) 与 [Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)  
> 日期：2026-08-03

## 历史背景

本 ADR曾冻结：

```text
Game Package launcher.entry
→ Node argv = business entry
```

其安全/监督原则仍被 current Hostra Profile继承：Host选择 Node、shell=false、installation containment、token-before-execute、safe env、spawn/connected/identified/ready分离、Supervisor actual exit、no auto restart。

## Current Hostra Model

```text
Game Entry {key}
        +
launch.hostra.json {key,module}
        ↓
full Hostra preflight / HostraLaunchPlan
        ↓
Main launch(key)
        ↓
Host-owned Node Runner = process entry
        ↓
Runner imports plan-selected Definition Module
```

Game common manifest不含 executable module；Hostra manifest也不能控制 Node executable、Runner entry、arbitrary argv/env/credential。

Late Data provisioning仍使用独立 Runner provisioning channel。

本文只保留历史说明，不形成 current contract。
