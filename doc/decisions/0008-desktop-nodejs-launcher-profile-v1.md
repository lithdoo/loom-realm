# ADR 0008：冻结 Desktop Node.js Launcher Profile v1

> 状态：Accepted  
> 日期：2026-08-03；版本归一复核：2026-08-09  
> 影响范围：Game Package v1、Runtime Bootstrap、Main Launcher、Runtime Supervisor、Desktop Host  
> 补充并部分替代：[ADR 0007：Subsystem Descriptor MVP 收敛](./0007-subsystem-descriptor-mvp.md) 中 `launcher.entry` 尚未冻结的结论

## 背景

ADR 0007 已冻结 Descriptor `key`、Desktop `nodejs`、完整 Descriptor 集合、eager/all-required Bootstrap和 unsupported Launcher failure，但仍留下实际执行能力空白：

- `launcher.entry` 路径基准与文件系统安全；
- Node Runtime由谁选择；
- module type是否依赖 `package.json.type` 等宿主状态；
- Shell/argv/cwd；
- Descriptor env与 Main ambient env；
- Bootstrap Context传递；
- Bootstrap Credential与 spawn顺序；
- Process Supervisor / exit classification / restart；
- Node executable code trust boundary。

这些内容若留给实现自行决定，会导致 Desktop实现不可互操作。

## 决定

采用 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)，并由 [Game Package v1 Bootstrap / Descriptor Contract](../15-contracts/game-package-v1.md) 冻结 Descriptor声明侧语义。

```text
launcher.entry
    Installation Root relative package logical path

Entry module type
    .mjs = ESM
    .cjs = CommonJS
    plain .js unsupported in v1

Desktop Node Runtime
    selected by LoomRealm Host

Process creation
    shell = false
    argv = [validated physical entry]
    cwd = Installation Root

Child environment
    Host Safe Baseline
    + validated descriptor.env
    + LoomRealm Bootstrap Context

Bootstrap Context
    LOOMREALM_BOOTSTRAP_CONTEXT
    Base64URL(UTF-8 JSON)

Process supervision
    spawn success remains public starting
    Supervisor observes actual exit
    unexpected exit = failure
    exit code 0 does not imply normal stop

Restart
    no automatic restart in v1
```

普通 `.js` 暂缓，因为其 module interpretation依赖 `package.json.type`、Node版本等隐式状态；`.mjs/.cjs`让语义直接由 Entry确定。

## Entry 安全

- package-relative only；
- reject absolute/URL/`..`/backslash escape；
- path chain禁止 symlink/junction/reparse redirect；
- final target必须是 Installation Root内 regular file；
- only `.mjs/.cjs`；
- reject executable namespace case collision。

未经验证的 Entry string不能直接提交 Process Creation API。

## Bootstrap 顺序

```text
Create Launch Attempt
→ Generate Bootstrap Token
→ Register Token + key in Main Control authentication state
→ Construct child environment
→ Spawn Process
```

Token注册必须发生在 Process可执行之前。

## Trust Model

Desktop `nodejs` Subsystem JavaScript属于 trusted executable code。

```text
safe launcher.entry != sandboxed Node.js process
```

不可信 executable sandbox、权限 Broker、签名与 Publisher Trust不在本阶段。

## 链路边界

```text
Descriptor
→ resolve target
→ Launch Attempt
→ Bootstrap Context
→ spawn
→ Supervisor registration
```

链路完成不等于 Runtime ready：

```text
spawned != connected != identified != ready
```

Control Transport、`subsystem.hello`、identity binding 与 `subsystem.status` 由 [Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md) 定义。

## 暂缓

- PWA Launcher Descriptor mapping；
- second Launcher Type；
- `.js` + `package.json.type` profile；
- untrusted executable sandbox；
- automatic restart/checkpoint/crash recovery；
- lazy/idle recycle；
- multiple Runtime per key；
- remote Subsystem；
- Game-supplied Node executable/flags/argv；
- Node version negotiation；
- timeout default numbers；
- executable integrity/signature verification。

## 结果

- `launcher.entry` boundary已闭合；
- module type不依赖隐式 `package.json.type`；
- Game Package Validator与 Main Launcher可共享 stable fixtures；
- Main ambient env不默认泄露；
- spawn/connect/identified/ready边界明确；
- Supervisor observation与 Runtime self-report分离；
- crash后为 failure而不是隐式 restart；
- Launcher安全边界与 Content API能力边界保持独立。

Game Package最初设计稿曾使用过不同文档版本号，但在任何 conformant implementation前完成了 Descriptor/Launcher模型修订；first implementation contract最终归一为 Game Package v1，历史编号不构成 compatibility obligation。
