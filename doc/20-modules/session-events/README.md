# Session Events：当前实现

> 状态：**Implemented / Qualified**
> Normative SSOT：[Session Events v1](../../15-contracts/session-events-v1.md) · [Runtime Integration Profile](../../15-contracts/session-events-runtime-profile-v1.md) · [Conformance](../../15-contracts/session-events-conformance-v1.md)
> Exact-subject evidence：[Session Events v1 qualification](../../30-implementation/session-events-v1-qualification.md)

`packages/session-events` 实现一个 Session-scoped `SessionEventHub`、trusted in-process binding、Runtime-scoped replaceable `SessionEventClient`、remote binding/server protocol 与 MessagePort adapter。它只拥有 transient exact-channel routing、subscription lifetime、bounded serial delivery 和 publish evidence；不拥有 business truth、RPC、history/replay、workflow 或 State transaction。

## Author / host boundary

Business Definition 只通过 `@loomrealm/subsystem` 使用 required `scope.events` 和 author-facing types/error guard。`@loomrealm/subsystem/host` 接收 required Runtime capability，并在 Runtime terminal 时终止 logical client 和 subscriptions。Main 只接收 `MainSessionEventsFatalSource`，不接触任何 business Event material。

## Current physical realization

- Hostra：Desktop process 内一个 Hub；每个 Runner 一个独立 private loopback capability-path WebSocket；initial binding 在 Definition import 前可用；环境 endpoint 先复制后清除。
- PWA：Session Worker 内一个 Hub；每个 Dedicated Worker Runtime 一个 dedicated MessagePort；既有 provisioning port 只负责 install/result，Event business traffic 不经过 provisioning control。
- binding loss：旧 subscription 以 `binding-terminal` 结束；logical client 保持 live 但无绑定时 fail-fast；fresh binding 需要 fresh subscribe，不 replay、不自动重试 author operation。

## Gates

```text
npm run build:session-events-stack
npm run test:session-events:packages
npm run test:session-events:qualification:run
npm run test:session-events:qualification
```

Qualification/currentness 遵循 [subject 与 staleness 规则](../../30-development/qualification.md)。
