from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, new: str, label: str) -> str:
    result, count = re.subn(pattern, new, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"expected one regex target for {label}, got {count}")
    return result


# ---------------------------------------------------------------------------
# Main code: retain one mutable authority owner, remove duplicate/dead state,
# preserve first Runtime failure cause, retire closed Frames, and distinguish
# termination resolution from termination-observation rejection.
# ---------------------------------------------------------------------------
path = "packages/main/src/internal/primitives.ts"
text = read(path)
text = replace_once(
    text,
    "export async function settleWithin(\n",
    "export async function resolvesWithin(\n",
    "rename settleWithin",
)
text = replace_once(
    text,
    "  const observed = Promise.resolve(task).then(\n    () => true,\n    () => true,\n  );",
    "  const observed = Promise.resolve(task).then(\n    () => true,\n    () => false,\n  );",
    "termination observation rejection semantics",
)
write(path, text)

path = "packages/main/src/internal/main-session.ts"
text = read(path)
text = replace_once(text, "  settleWithin,\n", "  resolvesWithin,\n", "import resolvesWithin")
text = text.replace("settleWithin(", "resolvesWithin(")
text = replace_once(text, 'type SessionPhase = "starting" | "running" | "stopping" | "closed";\n', "", "remove dead SessionPhase")
text = replace_once(text, "  readonly attemptId: string;\n", "", "remove unused attemptId")
text = replace_once(text, "  failed: boolean;\n", "  failure: MainRuntimeFailure | null;\n", "store Runtime failure cause")
text = replace_once(text, "export class MainSessionRuntime {", "class MainSessionRuntime {", "keep internal runtime internal")
text = replace_once(text, "  private readonly failedRuntimeKeys = new Set<string>();\n", "", "remove duplicate failed Runtime set")
text = replace_once(text, '  private phase: SessionPhase = "starting";\n', "", "remove dead Session phase")
text = replace_once(text, "  private nextAttempt = 1;\n", "", "remove unused attempt counter")
text = replace_once(text, '      attemptId: `l:${this.nextAttempt++}`,\n', "", "remove attempt id initialization")
text = replace_once(text, "      failed: false,\n", "      failure: null,\n", "initialize Runtime failure")
text = sub_once(
    text,
    r"  private markRuntimeFailed\(\n    record: RuntimeRecord,\n    _code: string,\n    _message: string,\n  \): boolean \{.*?\n  \}\n\n  private async ensureFailedRuntimeTermination",
    '''  private markRuntimeFailed(\n    record: RuntimeRecord,\n    code: string,\n    message: string,\n  ): boolean {\n    if (record.failure !== null) return false;\n    record.failure = failure(code, message, record.key);\n    record.phase = "failed";\n    record.ready.resolve("failed");\n    record.expectedTermination = true;\n    void this.ensureFailedRuntimeTermination(record);\n    return true;\n  }\n\n  private async ensureFailedRuntimeTermination''',
    "first-wins Runtime failure latch",
)
text = text.replace("!record.failed", "record.failure === null")
text = text.replace("record.failed", "record.failure !== null")
text = text.replace("!runtime.failed", "runtime.failure === null")
text = text.replace("runtime.failed", "runtime.failure !== null")
text = re.sub(r'\n    this\.phase = "(?:running|stopping|closed)";', "", text)
text = replace_once(
    text,
    "      frame.lifecycle = \"closed\";\n      this.stack.pop();\n      this.beginRootOutcome(frame.outcome);",
    "      frame.lifecycle = \"closed\";\n      this.stack.pop();\n      this.frames.delete(frame.id);\n      this.beginRootOutcome(frame.outcome);",
    "retire rejected initial Frame",
)
text = replace_once(
    text,
    "      this.stack.pop();\n      if (!(await this.tryResumeCaller(child, outcome))) {",
    "      this.stack.pop();\n      this.frames.delete(child.id);\n      if (!(await this.tryResumeCaller(child, outcome))) {",
    "retire rejected child Frame",
)
text = replace_once(
    text,
    "    frame.contextKnown = false;\n    frame.lifecycle = \"closed\";\n    this.stack.pop();\n    if (!(await this.tryResumeCaller(frame, frame.outcome))) {",
    "    frame.contextKnown = false;\n    frame.lifecycle = \"closed\";\n    this.stack.pop();\n    this.frames.delete(frame.id);\n    if (!(await this.tryResumeCaller(frame, frame.outcome))) {",
    "retire returned Frame",
)
text = replace_once(
    text,
    "        frame.lifecycle = \"closed\";\n        this.stack.pop();",
    "        frame.lifecycle = \"closed\";\n        this.stack.pop();\n        this.frames.delete(frame.id);",
    "retire unwound Frame",
)
text = replace_once(
    text,
    "      // Resume failure adds the Caller Runtime to failedRuntimeKeys. Recompute\n      // the lowest failed occurrence over the remaining Stack.",
    "      // Resume failure marks the Caller Runtime failed. Recompute the\n      // lowest failed occurrence over the remaining Stack.",
    "unwind comment",
)
text = sub_once(
    text,
    r"  private lowestFailedFrameIndex\(\): number \{.*?\n  \}\n\n  private async invokeFrame",
    '''  private lowestFailedFrameIndex(): number {\n    for (let index = 0; index < this.stack.length; index += 1) {\n      const runtime = this.runtimes.get(this.stack[index]!.subsystemKey);\n      if (runtime !== undefined && runtime.failure !== null) return index;\n    }\n    return -1;\n  }\n\n  private async invokeFrame''',
    "derive failed Runtime membership",
)
write(path, text)

path = "packages/main/test/runtime.test.mjs"
text = read(path)
text = replace_once(
    text,
    "          terminated: terminatedGate.promise,",
    '''          terminated: options.rejectTerminationObservation?.(request.subsystemKey)\n            ? terminatedGate.promise.then(() => {\n                throw new Error(\n                  `termination observation failed ${request.subsystemKey}`,\n                );\n              })\n            : terminatedGate.promise,''',
    "fake termination observation failure",
)
text += '''\n\ntest("termination observation rejection is not accepted as physical termination proof", async () => {\n  let shutdownCalls = 0;\n  const fake = createFakePlatform(\n    {\n      root: defineSubsystem(() => ({\n        frame: () => completed("done"),\n        shutdown() {\n          shutdownCalls += 1;\n        },\n      })),\n    },\n    { rejectTerminationObservation: (key) => key === "root" },\n  );\n\n  const result = await runMain({\n    bootstrap: bootstrap(["root"], "root"),\n    platform: fake.platform,\n    policy,\n  });\n\n  assert.deepEqual(result, {\n    kind: "root-outcome",\n    outcome: { type: "completed", value: "done" },\n  });\n  assert.equal(shutdownCalls, 1);\n  assert.equal(fake.runtimes.get("root").terminationRequests, 1);\n});\n'''
write(path, text)

# ---------------------------------------------------------------------------
# Package-local Main fact source.
# ---------------------------------------------------------------------------
write(
    "packages/main/DESIGN.md",
    '''# `@loomrealm/main`\n\n> 状态：**M5 Implemented Baseline / Runtime Control Consumer Qualified / M7+ Evolving**  \n> 阶段：M5 Main logical bootstrap + Runtime/Frame authority vertical  \n> 最近复核：2026-08-28  \n\n`@loomrealm/main` 是 platform-neutral Main application authority runtime。M5 已实现 `LogicalGameBootstrap → required Runtime bootstrap/ready → initial Frame → nested call/return → Runtime failure unwind → Session terminal` 的完整纵向切片。\n\nM5 closure **不**表示最终 Main role 已全部实现；Renderer Control、DataAuthority/DataConnectionBroker 等 capability 仍按 M7+ milestone 增长。\n\n---\n\n## 1. Public Surface\n\n当前 root export：\n\n```text\nrunMain\nMainRuntimeFatalError\n\nLogicalGameBootstrap\nMainPlatform\nMainPolicy\nRunMainOptions\nMainSessionResult\nMainFrameOutcome / MainFrameFailure\nMainRuntimeFailure\n```\n\n没有 class/service-locator lifecycle API；一个 `runMain()` 拥有一个 Main Session lifetime。\n\n```ts\ninterface MainPlatform {\n  readonly scheduler: DeadlineScheduler;\n  readonly bootstrapTokens: BootstrapTokenGenerator;\n  readonly runtimeHosting: RuntimeHosting;\n}\n\ninterface RunMainOptions {\n  readonly bootstrap: LogicalGameBootstrap;\n  readonly platform: MainPlatform;\n  readonly policy: MainPolicy;\n  readonly signal?: AbortSignal;\n}\n```\n\n`MainPlatform` 只是 Main 当前需要的 narrow structural capability view，不是 universal LoomRealm Platform interface。Concrete `HostraPlatform` / `PwaPlatform` 可以 structural-satisfy 它。\n\n---\n\n## 2. Runtime Dependencies\n\n```text\n@loomrealm/main\n    ├── @loomrealm/platform-ports\n    ├── @loomrealm/runtime-control\n    └── @loomrealm/wire\n```\n\n测试使用 `@loomrealm/foundation` MemoryCarrier 与真实 `@loomrealm/subsystem/host`，但它们不是 Main runtime dependency。\n\n禁止：\n\n```text\n@loomrealm/game-package\n@loomrealm/game-launcher-hostra / pwa\nconcrete Hostra/PWA types\nNode/Worker/WebSocket/MessagePort\nRenderer/Data/Content M7+ capability\n```\n\n---\n\n## 3. Logical Bootstrap / Runtime Establishment\n\n```text\nLogicalGameBootstrap\n→ defensive logical key/initial validation\n→ one required Runtime record per declared subsystemKey\n→ BootstrapTokenGenerator.generate()\n→ Main validates/registers fresh token material\n→ RuntimeHosting.launch({subsystemKey, bootstrapToken})\n→ HostedRuntime.runtimeControl.acquire()\n→ createMainRuntimeControlPeer()\n→ Main authenticate/consume hello token\n→ identified\n→ subsystem.status(ready)\n```\n\nPhase 1 all declared Runtime are eager + required。Main 不读取 Game Entry、PlatformLaunchPlan 或 executable material。\n\n`BootstrapTokenGenerator` 只提供 environment-backed high-entropy material；Launch Attempt/currentness、token registration/binding/consumption authority 始终属于 Main。\n\nM5 不发布无消费价值的 LaunchAttempt ID；当前一个 Runtime record 本身就是该 subsystem 的唯一 current Launch Attempt lifetime。新 attempt/restart 仍禁止。\n\n---\n\n## 4. Authority Model\n\nMain M5 mutable authority 由一个 `MainSessionRuntime` coordinator 单点拥有：\n\n```text\nRuntime records\nFrame records\nStack\ncurrent Activation per active Frame\nSession terminal\n```\n\n这不是“所有 noun 一个 manager”的 registry architecture。M5 刻意保持一个 mutable authority owner，并只抽离纯 helper/deadline/clone mechanics，避免 Runtime/Frame/Unwind 多 owner 竞态。\n\nInputTarget 不保存第二份 mutable registry，而由：\n\n```text\nStack top + active Frame + current Activation\n```\n\n即时派生。Failed-Runtime membership 同样由 Runtime record 的 first-wins failure fact 派生，不维护第二份 failed-key set。\n\nFrame/Activation ID session-unique、monotonic、never reused。Closed Frame 从 live registry 退休；ID uniqueness 由 monotonic allocator 保证，不靠永久保留历史对象。\n\n---\n\n## 5. Frame / Call Transactions\n\nMain 使用真实 `MainRuntimeControlPeer`，并保持 Frozen Frame v1 causal barriers。\n\n```text\nInitial\ninitialize Success\n→ activate(fresh A) Success\n→ publish active authority\n\nCall\nvalidate F/A/current top/target ready\n→ revoke caller A + suspend caller + allocate/push child\n→ frame.call Response send accepted\n→ child initialize\n→ child activate(fresh Achild) Success\n→ publish child active authority\n\nReturn\naccept immutable child outcome + revoke Achild + closing\n→ frame.return Response send accepted\n→ close child\n→ pop/retire child\n→ resume caller with fresh A' Success\n→ publish caller active authority\n```\n\nKnown precommit target missing/unavailable 是 recoverable semantic rejection；caller Activation 保持 current。Timeout/terminal/nonrecoverable divergence 进入 Runtime failure，绝不猜 commit、retry/replay 或重新使用旧 Activation。\n\n---\n\n## 6. Runtime Failure / Fixed-point Unwind\n\n每个 Runtime record 保存一个 **first-wins immutable business-safe `MainRuntimeFailure` fact**。后续 Control terminal、physical termination 或 Frame ambiguous outcome 不覆盖 primary cause。\n\nFrame business-facing unwind 不泄漏 transport/protocol diagnostics；如果 failed Runtime 的 doomed root 尚无 accepted business outcome，则合成为：\n\n```text\nfailed { code: "SUBSYSTEM_RUNTIME_FAILED" }\n```\n\nUnwind：\n\n```text\nfind lowest live Frame whose Runtime has failure\n→ whole suffix doomed\n→ revoke current Activation\n→ healthy-runtime contexts close Top→Bottom\n→ close failure may expand failed Runtime set\n→ recompute until fixed point\n→ preserve accepted outcome\n→ fresh-resume surviving healthy direct Caller\n→ or produce root outcome\n```\n\nNormal call/return、Control/physical failure callbacks与 unwind 共享一个 serialized mutation lane。\n\n---\n\n## 7. Session Terminal / Cleanup\n\nPublic terminal semantics：\n\n```text\nroot business outcome\n    → resolve {kind:"root-outcome", outcome}\n\nexternal AbortSignal\n    → resolve {kind:"shutdown"}\n\nbootstrap/Main invariant fatal\n    → reject MainRuntimeFatalError\n```\n\nGraceful terminal cleanup：\n\n```text\nMain latches Session terminal\n→ subsystem.shutdown\n→ if shutdown Success: bounded wait HostedRuntime.terminated\n→ if no successful physical termination observation: requestTermination()\n→ bounded wait again\n```\n\n`shutdown Success != terminated`；`requestTermination Success != terminated`；`HostedRuntime.terminated` **resolution** is the physical fact。Promise rejection/observation failure不是 termination proof。\n\nAlready-failed Runtime 不重新走 graceful shutdown；failure path 可直接 request physical termination。Cleanup failure 不替换已经 committed 的 Session terminal。\n\n---\n\n## 8. Executable Evidence\n\nM5 tests 使用 fake Platform 只替代 physical hosting，真实运行：\n\n```text\n@loomrealm/main\n↕\n@loomrealm/runtime-control\n↕\nFoundation MemoryCarrier\n↕\n@loomrealm/subsystem/host\n↕\nreal Subsystem Definition\n```\n\n覆盖：\n\n```text\npublic package boundary\ncross-Subsystem nested Frame\nsame-Subsystem recursion / no reentrant deadlock\nrecoverable undeclared target\nchild Runtime failure whole-suffix unwind + fresh Caller resume\nroot Runtime loss + stale continuation non-reentry\nduplicate bootstrap token fail-closed\nexternal abort graceful shutdown\nroot-outcome graceful shutdown\ntermination observation rejection is not physical termination proof\n```\n\nNode 20 / Node 24 build、tests、`npm pack --dry-run` 是 M5 merge gate。\n\n---\n\n## 9. M5 Closure / Non-goals\n\nM5 允许声明：\n\n```text\n@loomrealm/main M5 Runtime/Frame Authority Implemented Baseline\nMain Runtime Control real consumer qualified\nPlatform Ports M5 Main slice real consumer qualified\nLogicalGameBootstrap → Runtime/Frame → Session terminal vertical closed\n```\n\nM5 不允许声明：\n\n```text\n@loomrealm/main full package implemented\nRenderer Control implemented\nDataAuthority/DataConnectionBroker implemented\nInput/Render/Content integration complete\nHostra/PWA physical Runtime implementation complete\n```\n\n下一真实 consumer/vertical gate 是 M6 Hostra Platform vertical。\n''',
)

# ---------------------------------------------------------------------------
# Platform Ports fact source: M5 now has a real Main consumer and graceful
# shutdown must not collapse into immediate physical termination.
# ---------------------------------------------------------------------------
path = "packages/platform-ports/DESIGN.md"
text = read(path)
text = replace_once(
    text,
    "> 真实消费者：M4 `@loomrealm/subsystem/host` 已 qualification；M5 `@loomrealm/main` consumer qualification pending。",
    "> 真实消费者：M4 `@loomrealm/subsystem/host`、M5 `@loomrealm/main` 均已通过真实 role consumer qualification。",
    "platform ports consumer status",
)
text = replace_once(
    text,
    "`HostedRuntime.terminated` resolves only after the physical Runtime has actually terminated.\n\n```text\ntermination request resolved != terminated\nControl lost != terminated\nRuntime failed != terminated\n```",
    "`HostedRuntime.terminated` resolves only after the physical Runtime has actually terminated. Promise rejection/observation failure is **not** termination proof.\n\n```text\ntermination request resolved != terminated\nControl lost != terminated\nRuntime failed != terminated\ntermination observation rejected != terminated\n```",
    "terminated rejection semantics",
)
text = replace_once(
    text,
    '''Terminal cleanup:\n\n```text\nMain shutdown/failure intent\n→ H.requestTermination(...)\n→ await H.terminated\n→ only then physical stopped fact exists\n```''',
    '''Terminal cleanup separates graceful role shutdown from physical escalation:\n\n```text\ngraceful Session terminal\n→ Runtime Control shutdown accepted\n→ bounded await H.terminated\n→ if no successful termination observation: H.requestTermination(...)\n→ bounded await H.terminated\n\nRuntime failure / bootstrap abort\n→ H.requestTermination(...) as needed\n→ bounded await H.terminated\n```\n\n`requestTermination()` is escalation capability, not the default first step after a successful graceful shutdown.''',
    "platform ports terminal cleanup",
)
text = replace_once(
    text,
    "M5 @loomrealm/main\n    pending real consumer qualification",
    "M5 @loomrealm/main\n    ✅ real consumer qualified",
    "platform ports qualification",
)
text = replace_once(
    text,
    "    M5 Main Slice Frozen / Contract Baseline Implemented\n    M5 Main consumer qualification pending",
    "    M5 Main Slice Frozen / Contract Baseline Implemented\n    M5 Main consumer qualified",
    "platform ports current claim",
)
write(path, text)

# ---------------------------------------------------------------------------
# Main module fact source.
# ---------------------------------------------------------------------------
path = "doc/20-modules/main-system/README.md"
text = read(path)
text = replace_once(text, "> 状态：Active Design  \n> 稳定程度：Experimental  ", "> 状态：M5 Implemented Baseline / M7+ Active Design  \n> 稳定程度：M5 Frozen Baseline / Later Slices Evolving  ", "main module status")
text = replace_once(
    text,
    "Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority。它不拥有 Game Entry document contract、Platform executable binding，也不等于 Process/Worker/WebSocket/MessagePort realization。",
    "Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority。它不拥有 Game Entry document contract、Platform executable binding，也不等于 Process/Worker/WebSocket/MessagePort realization。\n\n当前 M5 已实现 Session/Runtime/Frame/Activation/InputTarget 与 failure unwind；Renderer Control/DataAuthority 属于后续 M7+ slice，不作为 M5 closure 条件。",
    "main module M5 scope",
)
text = replace_once(
    text,
    '''M5 建议先形成一个 consumer-owned role-local view：\n\n```ts\ninterface MainPlatform {\n  readonly scheduler: DeadlineScheduler;\n  readonly runtimeHosting: RuntimeHosting;\n}\n```''',
    '''M5 已冻结并由真实 Main consumer 验证的 consumer-owned role-local view：\n\n```ts\ninterface MainPlatform {\n  readonly scheduler: DeadlineScheduler;\n  readonly bootstrapTokens: BootstrapTokenGenerator;\n  readonly runtimeHosting: RuntimeHosting;\n}\n```''',
    "main module MainPlatform",
)
text = replace_once(
    text,
    '''create Launch Attempt/token\n→ RuntimeHosting.launch(key)\n→ accept Control carrier''',
    '''create current Launch Attempt\n→ BootstrapTokenGenerator.generate()\n→ Main validates/registers token against key/attempt\n→ RuntimeHosting.launch({subsystemKey:key, bootstrapToken})\n→ accept Control carrier''',
    "main module launch flow",
)
text = sub_once(
    text,
    r"## 10\. Runtime Hosting / Supervisor Facts.*?---\n\n## 11\.",
    '''## 10. HostedRuntime / Physical Facts\n\nM5 `RuntimeHosting.launch({subsystemKey,bootstrapToken}, signal)` 返回一个 `HostedRuntime`，把同一 physical Runtime lifetime 的：\n\n```text\nMain-side Runtime Control establishment\nrequestTermination()\nterminated Promise\n```\n\n自然关联在一起，不再需要平行 RuntimeControlHost/Supervisor handle registry。\n\n`terminated` 只有 **resolve** 才是 actual physical termination fact；rejection/observation failure 不得被解释为 stopped。`requestTermination()` 只请求终止，也不等于 stopped。\n\nM5 public port 暂不暴露 PID/Worker/exit code/signal 等 diagnostics；这些保持 Platform-local，直到真实 portable consumer 证明需要。\n\nNo automatic restart；新 Runtime必须 fresh Launch Attempt/token/HostedRuntime/Control lifetime。\n\n---\n\n## 11.''',
    "main module HostedRuntime section",
)
text = sub_once(
    text,
    r"## 16\. Tests.*?---\n\n## 17\.",
    '''## 16. Tests\n\nM5 executable qualification 已使用 fake physical Platform + real Runtime Control + real Subsystem Host 验证：\n\n```text\nLogicalGameBootstrap defensive install\nMain public boundary has no Game Package/launcher/concrete Platform dependency\nrequired Runtime hello/identified/ready\ncross-Subsystem nested Frame call/return\nsame-Subsystem recursion without reentrant deadlock\nrecoverable undeclared target preserves current Activation\nchild Runtime failure fixed-point unwind + fresh healthy Caller resume\nroot Runtime loss does not re-enter stale business continuation\nduplicate bootstrap token fails closed\nroot outcome / external abort graceful shutdown\ntermination observation rejection is not physical termination proof\n```\n\nM7+ Renderer/Data tests remain future milestone gates and MUST NOT be used to weaken or reinterpret M5 closure.\n\n---\n\n## 17.''',
    "main module tests",
)
text = replace_once(
    text,
    "5. RuntimeHosting封闭绑定 PlatformLaunchPlan，Main launch只用 key；",
    "5. RuntimeHosting封闭绑定 PlatformLaunchPlan，Main launch request只投影 key + bootstrapToken；",
    "main module invariant 5",
)
write(path, text)

# ---------------------------------------------------------------------------
# Runtime hosting architecture: exact M5 port is now frozen.
# ---------------------------------------------------------------------------
path = "doc/10-architecture/runtime-hosting-system.md"
text = read(path)
text = sub_once(
    text,
    r"## 6\. Main-facing RuntimeHosting.*?---\n\n## 7\.",
    '''## 6. Main-facing RuntimeHosting\n\nRuntimeHosting 是 prepared concrete Platform instance 对 Main 暴露的 logical launch capability，而不是 module loader API。M5 exact contract 已由 `@loomrealm/platform-ports` 冻结：\n\n```ts\ninterface RuntimeLaunchRequest {\n  readonly subsystemKey: string;\n  readonly bootstrapToken: string;\n}\n\ninterface MainRuntimeControlBinding {\n  acquire(signal: AbortSignal): Promise<MessageCarrier>;\n}\n\ninterface HostedRuntime {\n  readonly runtimeControl: MainRuntimeControlBinding;\n  readonly terminated: Promise<void>;\n  requestTermination(signal: AbortSignal): Promise<void>;\n}\n\ninterface RuntimeHosting {\n  launch(request: RuntimeLaunchRequest, signal: AbortSignal): Promise<HostedRuntime>;\n}\n```\n\n`RuntimeLaunchRequest` 是 Main-owned Launch Attempt 的窄 projection；只含 logical key + already-registered bootstrap token。\n\n```text\nlaunch({subsystemKey,bootstrapToken})\n→ lookup immutable PlatformLaunchPlan[subsystemKey]\n→ create exact Host-owned Runner Container\n→ inject key/token\n→ return one HostedRuntime lifetime\n```\n\n`HostedRuntime` 自然关联该 physical Runtime 的 Main-side Control establishment、termination request capability 与 actual termination fact；不需要为了 correlation 再暴露平行 `RuntimeControlHost` / `RuntimeSupervisor` registry。\n\nMain MUST NOT传 Game Entry、PlatformLaunchPlan、module/path/URL、Node/Worker options、Control endpoint/Port、Renderer/Data/Content material。RuntimeHosting不负责 ready/Frame/Activation/InputTarget/DataAuthority/failure unwind。\n\n---\n\n## 7.''',
    "runtime hosting M5 exact port",
)
text = sub_once(
    text,
    r"## 8\. Supervisor Boundary.*?---\n\n## 9\.",
    '''## 8. Physical Termination Fact Boundary\n\nM5 shared port只冻结最小 portable fact：\n\n```text\nHostedRuntime.terminated resolves\n    = actual physical Runtime termination observed\n\nHostedRuntime.terminated rejects\n    = termination observation failed\n    != stopped proof\n```\n\n`requestTermination()` 只请求 physical termination；resolution 不等于 actual terminated。PID/Worker/exit code/signal/reason 等 richer diagnostics MAY 保持 concrete Platform-local，直到独立 portable consumer 证明需要才进入 shared port。\n\nMain解释 physical facts为 Runtime lifecycle；Platform不能选择 Frame unwind root、Data generation或 application recovery。\n\n---\n\n## 9.''',
    "runtime hosting physical fact section",
)
text = replace_once(
    text,
    '''正常：\n\n```text\nMain shutdown intent\n→ subsystem.shutdown\n→ bounded Runner/business cleanup\n→ Platform terminate if needed\n→ Supervisor observes actual termination\n→ stopped\n```''',
    '''正常：\n\n```text\nMain shutdown intent\n→ subsystem.shutdown\n→ if shutdown accepted: bounded wait HostedRuntime.terminated\n→ if no successful termination observation: requestTermination()\n→ bounded wait HostedRuntime.terminated\n→ only resolved termination fact can support stopped\n```''',
    "runtime hosting graceful termination",
)
text = replace_once(
    text,
    "6. Main-facing RuntimeHosting只接受 logical key/Launch Attempt material；",
    "6. Main-facing RuntimeHosting只接受 `{subsystemKey, bootstrapToken}` Launch Attempt projection；",
    "runtime hosting invariant 6",
)
write(path, text)

# ---------------------------------------------------------------------------
# Runtime bootstrap architecture.
# ---------------------------------------------------------------------------
path = "doc/10-architecture/runtime-bootstrap-system.md"
text = read(path)
text = replace_once(
    text,
    '''Main creates Launch Attempt\n→ generate/register bootstrap credential for key\n→ RuntimeHosting lookup frozen PlatformLaunchPlan[key]''',
    '''Main creates current Launch Attempt for key\n→ BootstrapTokenGenerator.generate()\n→ Main validates/registers fresh bootstrap credential\n→ RuntimeHosting.launch({subsystemKey:key, bootstrapToken})\n→ RuntimeHosting lookup frozen PlatformLaunchPlan[key]''',
    "runtime bootstrap credential flow",
)
text = replace_once(
    text,
    '''Main establishes shutdown intent\n→ subsystem.shutdown\n→ SDK aborts instance/frame signals and runs bounded shutdown hook\n→ Platform terminates Runner if needed\n→ Supervisor observes actual termination\n→ stopped''',
    '''Main establishes shutdown intent\n→ subsystem.shutdown\n→ SDK aborts instance/frame signals and runs bounded shutdown hook\n→ if shutdown accepted: bounded wait HostedRuntime.terminated\n→ if no successful termination observation: requestTermination()\n→ only HostedRuntime.terminated resolution is physical stopped evidence''',
    "runtime bootstrap shutdown",
)
text = sub_once(
    text,
    r"## 20\. Recommended Session Sequence.*?---\n\n## 21\.",
    '''## 20. Recommended Session Sequence\n\n```text\n1  create session-scoped concrete HostraPlatform / PwaPlatform\n2  platform.prepareGame(source) delegates to matching Launcher component\n3  Launcher validates Game Entry via @loomrealm/game-package\n4  validate current Platform Launch Manifest\n5  exact Game↔Platform key-set join\n6  resolve/preflight all required executable/security capabilities\n7  freeze immutable PlatformLaunchPlan\n8  platform installs PlatformLaunchPlan privately\n9  return immutable LogicalGameBootstrap\n10 runMain({bootstrap, platform, policy})\n11 Main installs logical registry / initial input\n12 for each required key: generator produces token; Main registers it\n13 RuntimeHosting.launch({subsystemKey,bootstrapToken}) creates Runner lifetime\n14 HostedRuntime.runtimeControl.acquire() establishes Main carrier\n15 hello authentication → identified → ready\n16 Main starts initial Frame independently from Data\n17 M7+ realize Renderer and publish Renderer Control authority\n18 M8/M9+ publish DataAuthority / provision Data carriers\n19 M10/M11+ establish Input/Render fresh baselines\n20 Session terminal performs graceful shutdown then physical escalation if needed\n```\n\n具体 physical creation order 可不同，只要满足 causal/authority/PREPARE boundary。\n\n---\n\n## 21.''',
    "runtime bootstrap recommended sequence",
)
text = replace_once(
    text,
    "7. Main launch不携 module/path/URL；",
    "7. Main Runtime launch request只携 logical key + bootstrapToken，不携 module/path/URL；",
    "runtime bootstrap invariant 7",
)
write(path, text)

# ---------------------------------------------------------------------------
# Phase plan: M5 is now closed; M6 is next vertical.
# ---------------------------------------------------------------------------
path = "doc/30-implementation/phase-1-delivery-plan.md"
text = read(path)
text = sub_once(
    text,
    r"## M5：Main Core \+ LogicalGameBootstrap \+ Frozen Frame Slice.*?---\n\n## M6：",
    '''## M5：Main Core + LogicalGameBootstrap + Frozen Frame Slice ✅\n\nImplemented Baseline：\n\n```text\n@loomrealm/main\n    LogicalGameBootstrap\n    MainPlatform narrow capability view\n    MainPolicy / runMain / MainSessionResult\n    Runtime Registry / current Launch Attempt lifetime\n    Main-owned bootstrap credential registration/consumption\n    Frame / Activation / Stack authority\n    derived InputTarget\n    serialized mutation lane\n    first-wins Runtime failure cause\n    fixed-point failure unwind\n    graceful Session shutdown + physical termination escalation\n```\n\nM5 `@loomrealm/platform-ports` slice frozen and real-consumer qualified：\n\n```text\nBootstrapTokenGenerator\nRuntimeLaunchRequest {subsystemKey,bootstrapToken}\nMainRuntimeControlBinding\nHostedRuntime {runtimeControl,terminated,requestTermination}\nRuntimeHosting\n```\n\nRuntime Control consumer qualification：\n\n```text\nMain uses real MainRuntimeControlPeer\nMain authentication owns key/attempt/token decision\nResponse afterResponse barrier drives dependent child/close/resume operations\nRuntime Control terminal/ambiguous request outcomes feed Main failure authority\nno same-attempt reconnect/retry/replay\n```\n\nExecutable evidence uses fake physical Platform only; real chain is：\n\n```text\nMain ↔ runtime-control ↔ MemoryCarrier ↔ subsystem/host ↔ business Definition\n```\n\nClosed behavior includes initial Frame, cross/same-Subsystem nesting, recoverable target rejection, accepted outcome preservation, child/root Runtime loss, whole-suffix unwind, fresh Caller resume, duplicate token fail-closed, graceful shutdown, and termination-observation rejection handling.\n\nM5 closure allows：\n\n```text\nMain M5 Runtime/Frame Authority Implemented Baseline\nMain Runtime Control real consumer qualified\nPlatform Ports M5 Main slice real consumer qualified\n```\n\nM5 does not implement Renderer Control/Data/Input/Render/Content or Hostra/PWA physical hosting.\n\n---\n\n## M6：''',
    "phase plan M5 closure",
)
text = replace_once(
    text,
    "Hostra Launcher PREPARE\n→ LogicalGameBootstrap + RuntimeHosting\n→ Main / Node Runner / Runtime Control",
    "HostraPlatform.prepareGame() / Launcher PREPARE\n→ LogicalGameBootstrap + prepared HostraPlatform\n→ runMain({bootstrap, platform}) / Node Runner / Runtime Control",
    "phase plan M14 flow",
)
write(path, text)

# ---------------------------------------------------------------------------
# Root README current status and product bootstrap model.
# ---------------------------------------------------------------------------
path = "README.md"
text = read(path)
text = sub_once(
    text,
    r"## Game / Platform / Main Bootstrap 闭环.*?关键规则：",
    '''## Game / Platform / Main Bootstrap 闭环\n\n```text\nGame installation / source\n        ↓\ncreate HostraPlatform / PwaPlatform\n        ↓\nplatform.prepareGame(source)\n    → matching game-launcher-* component\n    → @loomrealm/game-package validation\n    → current Platform Launch Manifest\n    → exact key-set join / executable resolution / security preflight\n    → immutable PlatformLaunchPlan\n        ↓\nconcrete Platform installs LaunchPlan privately\n+ returns immutable LogicalGameBootstrap\n        ↓\nrunMain({bootstrap, platform, policy})\n        ↓\nMain generates/registers bootstrap token\n        ↓\nplatform.runtimeHosting.launch({subsystemKey, bootstrapToken})\n        ↓\nHostedRuntime / Host-owned Runner\n        ↓\nplatform-selected Definition Module\n        ↓\n@loomrealm/subsystem/host\n```\n\n关键规则：''',
    "root README bootstrap diagram",
)
text = replace_once(
    text,
    "Matching Launcher 在 full PREPARE 后只向 Main投影：",
    "Concrete Platform 的 `prepareGame()` 通过 matching Launcher 完成 full PREPARE 后，只向 Main投影：",
    "root README logical bootstrap wording",
)
text = replace_once(
    text,
    '''@loomrealm/game-launcher-hostra\n→ game-package validation\n+ launch.hostra.json\n→ exact join / safe filesystem resolution\n→ HostraLaunchPlan + LogicalGameBootstrap\n→ Node Runner RuntimeHosting''',
    '''HostraPlatform.prepareGame()\n→ @loomrealm/game-launcher-hostra component\n→ game-package validation + launch.hostra.json\n→ exact join / safe filesystem resolution\n→ HostraLaunchPlan installed privately + LogicalGameBootstrap returned\n→ HostraPlatform exposes Node Runner RuntimeHosting''',
    "root Hostra boundary",
)
text = replace_once(
    text,
    '''@loomrealm/game-launcher-pwa\n→ game-package validation\n+ launch.pwa.json\n→ exact join / installation + same-origin resolution\n→ PwaLaunchPlan + LogicalGameBootstrap\n→ Worker Runner RuntimeHosting''',
    '''PwaPlatform.prepareGame()\n→ @loomrealm/game-launcher-pwa component\n→ game-package validation + launch.pwa.json\n→ exact join / installation + same-origin resolution\n→ PwaLaunchPlan installed privately + LogicalGameBootstrap returned\n→ PwaPlatform exposes Worker Runner RuntimeHosting''',
    "root PWA boundary",
)
text = replace_once(
    text,
    "两个 launcher package 是窄 Subsystem Runtime launch capabilities，不是 Renderer/DataBroker/Content Platform mega-package。",
    "两个 launcher package 是 concrete Platform 内部的窄 Game PREPARE / Runner integration components，不是完整 Platform object，更不是 Renderer/DataBroker/Content mega-package。",
    "root launcher positioning",
)
text = sub_once(
    text,
    r"## 当前实现状态.*?---\n\n## Cross-platform Equivalence",
    '''## 当前实现状态\n\n```text\n@loomrealm/foundation\n    Implemented Baseline / Core Contract Frozen\n\n@loomrealm/wire\n    Implemented Baseline / Core Contract Frozen\n\n@loomrealm/game-package\n    Implemented Baseline / Core Contract Frozen\n    M2 local closure complete\n    M6/M15 real launcher consumer qualification pending\n\n@loomrealm/runtime-control\n    Implemented Baseline / Core Contract Frozen\n    M3 local closure complete\n    M4 Subsystem + M5 Main real role consumers qualified\n\n@loomrealm/platform-ports\n    Implemented Baseline / Core Boundary Frozen\n    M4 Slice Frozen + Subsystem consumer qualified\n    M5 Main Slice Frozen + Main consumer qualified\n    M7+ Evolving\n\n@loomrealm/subsystem\n    M4 Runtime/Frame Core Implemented\n    M4 Host Runtime Control consumer qualified\n    M8/M10/M11/M12 later capability slices pending\n\n@loomrealm/main\n    M5 Runtime/Frame Authority Implemented Baseline\n    Main Runtime Control consumer qualified\n    M7+ Renderer/Data slices pending\n\n@loomrealm/data\n    Package-local Core Baseline Implemented\n    M8 role integration pending\n\n@loomrealm/game-launcher-hostra\n    design/PREPARE component ready; M6 implementation pending\n\n@loomrealm/game-launcher-pwa\n    design/PREPARE component ready; M15 implementation pending\n\n@loomrealm/fsdb-http\n    v1 Release Candidate implementation + tests\n```\n\n下一实现门：\n\n```text\nM6 Hostra Platform Vertical\n    HostraPlatform + Launcher PREPARE + Node Runner + RuntimeHosting\n    first runnable Main ↔ Runtime Control ↔ Subsystem product vertical\n```\n\n---\n\n## Cross-platform Equivalence''',
    "root implementation status",
)
write(path, text)

# ---------------------------------------------------------------------------
# Contract catalog tracks current consumer boundary (not a new formal M5 wire
# protocol, but it must not describe the superseded prepared bag).
# ---------------------------------------------------------------------------
path = "doc/15-contracts/README.md"
text = read(path)
text = text.replace("            → plan-bound RuntimeHosting", "            → concrete Platform installs plan / exposes RuntimeHosting")
text = text.replace("    │       → plan-bound RuntimeHosting", "    │       → concrete Platform installs plan / exposes RuntimeHosting")
text = replace_once(
    text,
    '''Main consumes：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial subsystemKey/input\n\nplan-bound RuntimeHosting port\n```''',
    '''Main consumes：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial subsystemKey/input\n\nMainPlatform narrow capability view\n    DeadlineScheduler\n    BootstrapTokenGenerator\n    RuntimeHosting\n```''',
    "contract catalog Main boundary",
)
text = replace_once(
    text,
    '''Main launch(subsystemKey)\n→ RuntimeHosting lookup frozen plan\n→ Host-owned Runner''',
    '''Main registers bootstrap token\n→ RuntimeHosting.launch({subsystemKey,bootstrapToken})\n→ RuntimeHosting lookup frozen plan\n→ Host-owned Runner''',
    "contract catalog launch flow",
)
text = replace_once(
    text,
    '''Platform Launcher\n    primary Runtime-product Game consumer\n    Game + Platform PREPARE\n    PlatformLaunchPlan\n    LogicalGameBootstrap projection\n    plan-bound RuntimeHosting / Runner integration''',
    '''Platform Launcher\n    primary Runtime-product Game consumer\n    Game + Platform PREPARE component\n    PlatformLaunchPlan + LogicalGameBootstrap projection\n\nConcrete Platform\n    installs PlatformLaunchPlan privately\n    exposes Main-facing RuntimeHosting / scheduler / bootstrap token capability''',
    "contract authority summary",
)
text = sub_once(
    text,
    r"## 16\. Current Closure Priorities.*$",
    '''## 16. Current Closure Priorities\n\nImplemented Baseline：\n\n```text\n@loomrealm/foundation\n@loomrealm/wire\n@loomrealm/game-package\n@loomrealm/runtime-control\n@loomrealm/platform-ports\n    M4 Subsystem + M5 Main consumer qualified\n@loomrealm/subsystem\n    M4 Runtime/Frame slice implemented\n@loomrealm/main\n    M5 Runtime/Frame authority slice implemented\n@loomrealm/data\n    Package-local Core Baseline Implemented\n    != M8 milestone closed\n```\n\nCurrent next implementation gate：\n\n```text\nM6 Hostra Platform vertical\n    concrete HostraPlatform\n    Launcher PREPARE component\n    Node Runner / RuntimeHosting / Control carrier realization\n```\n\nThen：\n\n```text\nM7 Renderer Control\nM8 integration of existing Data baseline\nM9 Desktop DataConnectionBroker\nM10 User Input role managers\nM11 Render role managers\n...\nM15 PWA Platform vertical\n```\n\nImplementation priority：\n\n```text\nM6 first runnable physical Runtime vertical\n→ M7 authority mirror\n→ M8 shared Data integration\n→ M9 physical Data provisioning\n→ M10/M11 Input/Render role consumers\n```\n''',
    "contract closure priorities",
)
write(path, text)

# ---------------------------------------------------------------------------
# Package architecture.
# ---------------------------------------------------------------------------
path = "doc/30-implementation/package-architecture.md"
text = read(path)
text = replace_once(
    text,
    '''M4 frozen root surface exactly：\n\n```text\nDeadlineScheduler\nRuntimeControlBinding\n```''',
    '''Frozen root surface through M5：\n\n```text\nM4\n    DeadlineScheduler\n    RuntimeControlBinding\n\nM5\n    BootstrapTokenGenerator\n    RuntimeLaunchRequest\n    MainRuntimeControlBinding\n    HostedRuntime\n    RuntimeHosting\n```''',
    "package architecture platform ports surface",
)
text = replace_once(
    text,
    "M5+ Main/Renderer/Data/Content ports 只在对应 real consumer closure 时增长；",
    "M5 Main ports 已由真实 consumer closure；M7+ Renderer/Data/Content ports 仍只在对应 real consumer closure 时增长；",
    "package architecture port status",
)
text = replace_once(
    text,
    '''Main consumes：\n\n```text\nLogicalGameBootstrap\n@loomrealm/runtime-control\n@loomrealm/renderer-control\nMain-facing Platform ports\n```''',
    '''M5 Main consumes：\n\n```text\nLogicalGameBootstrap\n@loomrealm/runtime-control\n@loomrealm/platform-ports M5 slice\n@loomrealm/wire\n```\n\n`@loomrealm/renderer-control` 从 M7 才进入 Main runtime dependency。''',
    "package architecture Main dependencies",
)
text = replace_once(
    text,
    "Main-facing RuntimeHosting implementation\nHost-owned Runner/bootstrap/supervision integration",
    "RuntimeHosting implementation primitives installed/exposed by the concrete Platform\nHost-owned Runner/bootstrap/supervision integration",
    "package architecture launcher ownership",
)
text = replace_once(
    text,
    "- `LogicalGameBootstrap` exact type placement waits for M5/M6 smallest Main-facing surface。",
    "- `LogicalGameBootstrap` exact type 已由 M5 `@loomrealm/main` root surface 拥有；",
    "package architecture bootstrap type placement",
)
write(path, text)

# ---------------------------------------------------------------------------
# Implementation index / repository layout / testing strategy.
# ---------------------------------------------------------------------------
path = "doc/30-implementation/README.md"
text = read(path)
text = replace_once(
    text,
    '''Current next implementation gate：\n\n```text\nM4 @loomrealm/subsystem\n    Runtime/Frame author core\n    @loomrealm/subsystem/host Runtime Control consumer qualification\n```''',
    '''Current next implementation gate：\n\n```text\nM6 Hostra Platform vertical\n    HostraPlatform + Launcher PREPARE + Node Runner + RuntimeHosting\n```''',
    "implementation index next gate",
)
text = sub_once(
    text,
    r"## Game / Platform Launch Baseline.*?---\n\n## Game Package Baseline",
    '''## Game / Platform Launch Baseline\n\n```text\nGame source / installation\n        ↓\nsession-scoped concrete Platform.prepareGame()\n    → matching Launcher component\n    → @loomrealm/game-package + current Platform manifest\n    → exact join / executable-security preflight\n    → immutable PlatformLaunchPlan\n        ↓\nPlatform installs LaunchPlan privately\n+ returns LogicalGameBootstrap\n────────────────────────────────────────\nfirst business Runtime side effect allowed\n        ↓\nrunMain({bootstrap, platform, policy})\n        ↓\nRuntimeHosting.launch({subsystemKey,bootstrapToken})\n        ↓\nHost-owned Runner\n```\n\nGame common document has no module；Main sees no executable/document material。\n\n---\n\n## Game Package Baseline''',
    "implementation launch baseline",
)
text = replace_once(
    text,
    '''M5 Main also becomes real Main-side Runtime Control consumer：authentication callback owns Launch Attempt/token decision，Runtime Control typed terminal/outcome feeds Main authority classifier。''',
    '''M5 Main is now a qualified real Main-side Runtime Control consumer：`MainPlatform = {scheduler, bootstrapTokens, runtimeHosting}`；authentication callback owns Launch Attempt/token decision，Runtime Control typed terminal/outcome feeds Main first-wins failure authority。''',
    "implementation Main baseline status",
)
text = sub_once(
    text,
    r"Main-facing：\n\n```text.*?```\n\nRuntime Control scheduler",
    '''Main-facing current M5：\n\n```text\nDeadlineScheduler\nBootstrapTokenGenerator\nRuntimeHosting → HostedRuntime\n    ├── MainRuntimeControlBinding\n    ├── terminated\n    └── requestTermination\n```\n\nM7+ Renderer/Data ports grow only with real consumers；Content does not automatically pass through Main.\n\nRuntime Control scheduler''',
    "implementation role-facing ports",
)
text = sub_once(
    text,
    r"## Current Implementation Order.*?---\n\n## Phase 1 Acceptance Direction",
    '''## Current Implementation Order\n\n```text\nFoundation ✅\nWire ✅\nGame Package ✅\nM3 Runtime Control ✅\nM4 Subsystem Runtime/Frame author+host ✅\nM5 Main Runtime/Frame authority ✅\n↓\nM6 Hostra Platform vertical\n↓\nM7 Renderer Control\n↓\nM8+ Data/Input/Render/Content slices\n...\nM15 PWA Platform vertical\nM16 cross-platform equivalence\n```\n\n---\n\n## Phase 1 Acceptance Direction''',
    "implementation order",
)
text = replace_once(
    text,
    "Game source\n→ matching Launcher PREPARE\n→ LogicalGameBootstrap + RuntimeHosting\n→ Main / Runner",
    "Game source\n→ concrete Platform.prepareGame() / matching Launcher PREPARE\n→ LogicalGameBootstrap + prepared Platform instance\n→ runMain({bootstrap, platform}) / Runner",
    "implementation acceptance loop",
)
write(path, text)

path = "doc/30-implementation/repository-layout.md"
text = read(path)
text = replace_once(text, "M4 current layout：", "Current implemented layout through M5：", "repo layout platform ports status")
text = replace_once(
    text,
    '''M4 root export exactly：\n\n```text\nDeadlineScheduler\nRuntimeControlBinding\n```''',
    '''Current root export：\n\n```text\nM4\n    DeadlineScheduler\n    RuntimeControlBinding\nM5\n    BootstrapTokenGenerator\n    RuntimeLaunchRequest\n    MainRuntimeControlBinding\n    HostedRuntime\n    RuntimeHosting\n```''',
    "repo layout platform ports exports",
)
text = sub_once(
    text,
    r"## 7\. `packages/main`.*?---\n\n## 8\.",
    '''## 7. `packages/main`\n\nM5 current implemented layout：\n\n```text\npackages/main/\n├── DESIGN.md\n├── package.json\n├── tsconfig.json\n├── src/\n│   ├── index.ts\n│   ├── model.ts\n│   ├── errors.ts\n│   └── internal/\n│       ├── main-session.ts\n│       └── primitives.ts\n└── test/\n    ├── boundary.test.mjs\n    └── runtime.test.mjs\n```\n\n`main-session.ts` deliberately remains the single mutable M5 authority coordinator for Runtime/Frame/Stack/failure/unwind. Pure deadline/clone/deferred mechanics live in `primitives.ts`; future splits MUST NOT create independent stateful registries solely to reduce file length.\n\nM5 runtime dependencies：\n\n```text\n@loomrealm/platform-ports\n@loomrealm/runtime-control\n@loomrealm/wire\n```\n\nMain consumes `LogicalGameBootstrap` directly and MUST NOT import Game Package/concrete Launcher。Renderer/Data directories are not pre-created before their M7+ consumer slices.\n\n---\n\n## 8.''',
    "repo layout Main actual layout",
)
text = replace_once(
    text,
    '''M4 frozen：\n\n```text\nplatform-ports owns DeadlineScheduler / RuntimeControlBinding\nsubsystem/host consumes them\nsubsystem/host owns SubsystemRuntimeControlPolicy\n```\n\nFuture `RuntimeHosting` / Renderer Data binding / Subsystem Data binding exact shapes are added only at their real milestone closure；''',
    '''Frozen through M5：\n\n```text\nM4\n    platform-ports owns DeadlineScheduler / RuntimeControlBinding\n    subsystem/host consumes them\n\nM5\n    platform-ports owns BootstrapTokenGenerator / RuntimeHosting / HostedRuntime / MainRuntimeControlBinding\n    main consumes them through MainPlatform\n```\n\nFuture Renderer Data binding / Subsystem Data binding exact shapes are added only at their real milestone closure；''',
    "repo layout role ports",
)
text = replace_once(
    text,
    "main\n    → runtime-control / renderer-control / wire as required",
    "main M5\n    → platform-ports + runtime-control + wire\n\nmain M7+\n    → renderer-control / later capability packages as required",
    "repo layout Main dependencies",
)
text = replace_once(
    text,
    '''→ runtime-control       ← M3 current\n→ subsystem author/host\n→ main LogicalGameBootstrap + fake RuntimeHosting\n→ game-launcher-hostra''',
    '''→ runtime-control ✅\n→ subsystem author/host M4 ✅\n→ main LogicalGameBootstrap + fake physical Platform M5 ✅\n→ HostraPlatform / game-launcher-hostra M6''',
    "repo layout creation order",
)
text = replace_once(
    text,
    "9. launcher packages own schema/planner/resolver/RuntimeHosting/Runner integration；",
    "9. launcher packages own schema/planner/resolver and RuntimeHosting/Runner implementation primitives；session-scoped concrete Platform exposes the Main-facing capability；",
    "repo layout final launcher rule",
)
write(path, text)

path = "doc/30-implementation/testing-strategy.md"
text = read(path)
text = sub_once(
    text,
    r"## 19\. Main Authority / Fake Platform Ports.*?---\n\n## 20\.",
    '''## 19. Main Authority / Fake Platform Ports\n\nM5 real consumer qualification implemented：\n\n```text\nmain-root-public-boundary\nlogical-bootstrap-defensive-install\nMainPlatform-scheduler-bootstrapTokens-runtimeHosting-only\nbootstrap-token-freshness-and-duplicate-fail-closed\nRuntimeHosting-launch-request-key-plus-token-only\nmain-uses-real-MainRuntimeControlPeer\nhello-auth-callback-owns-token-registration-consumption\nrequired-runtime-identified-ready-gate\ninitial-frame-activate-ACK-before-publication\ncross-subsystem-nested-call-return\nsame-subsystem-recursion-no-reentrant-deadlock\nrecoverable-target-rejection-preserves-Activation\nchild-runtime-loss-whole-suffix-unwind-fresh-caller-resume\nroot-runtime-loss-no-stale-business-continuation\nroot-outcome-and-external-abort-graceful-shutdown\nshutdown-success-waits-natural-termination-before-escalation\ntermination-observation-rejection-not-treated-as-terminated\nnpm-pack-dry-run\n```\n\nFake Platform replaces physical hosting only；test path still uses real Runtime Control peers + MemoryCarrier + `@loomrealm/subsystem/host` business Definitions. Renderer Control/DataAuthority tests remain M7/M8 gates, not M5 requirements.\n\n---\n\n## 20.''',
    "testing strategy M5",
)
write(path, text)

# Review record kept outside the published package file allowlist.
write(
    "doc/30-implementation/main-m5-implementation-review.md",
    '''# Main M5 Implementation Review\n\n> 层级：实施复核  \n> 状态：PASS / merge candidate  \n> 最近复核：2026-08-28  \n\n## Scope\n\nReviewed slice：`@loomrealm/main` M5 Runtime/Frame authority vertical + `@loomrealm/platform-ports` M5 real consumer qualification。Renderer/Data/Input/Render/Content/Hostra/PWA physical implementation不在本 closure。\n\n## Findings closed during review\n\n1. **Fact-source drift**：Main package DESIGN、Main module、Runtime Hosting/Bootstrap、Phase Plan、root README、contract catalog、package/repository/testing plans still described pre-M5 or old prepared-bag shapes. Updated to current `platform.prepareGame() → runMain({bootstrap,platform})` + M5 exact ports.\n2. **Runtime failure cause was discarded**：`markRuntimeFailed(code,message)` only set a boolean. Runtime record now latches the first business-safe `MainRuntimeFailure`; later causes cannot overwrite it.\n3. **Duplicate failed Runtime authority**：removed `failedRuntimeKeys`; unwind derives failed membership from Runtime records.\n4. **Dead speculative state**：removed write-only Session phase and unused LaunchAttempt id/counter. M5 one Runtime record is the current attempt lifetime; no public/internal fake ID needed without restart/retry semantics.\n5. **Closed Frame retention**：closed/popped Frames are removed from the live registry. Monotonic IDs still guarantee no reuse, avoiding unbounded live-registry growth in long Sessions.\n6. **Termination observation bug**：a rejected `HostedRuntime.terminated` Promise was previously counted as “settled” and could suppress physical escalation. Graceful cleanup now requires successful resolution; rejection is not physical termination proof. Regression test added.\n\n## Elegance decision\n\n`main-session.ts` remains one stateful coordinator intentionally. The file is large because M5 authority is causally coupled, but all mutable Runtime/Frame/Stack/terminal state has one owner and one serialized mutation lane. Splitting by nouns into independent `RuntimeRegistry` / `FrameRegistry` / `FailureManager` objects would increase correlation and dual-owner risk without creating a new semantic boundary.\n\nAccepted extraction rule：extract pure helpers/value validation/protocol adapters when independently useful；do not split mutable authority merely to reduce line count.\n\n## Closure evidence\n\nNode 20 and Node 24 must pass：\n\n```text\nFoundation/Wire/Platform Ports/Runtime Control/Subsystem dependency build\n@loomrealm/main build\nMain integration tests\nnpm pack --dry-run\ndocs link/build checks\n```\n\nIntegration uses fake physical Platform only and real：\n\n```text\nMain ↔ Runtime Control ↔ MemoryCarrier ↔ Subsystem Host ↔ Business Definition\n```\n\n## Verdict\n\n```text\nMain M5 semantic closure        PASS\nMain public boundary            PASS\nPlatform Ports M5 consumer      PASS\nFrame/Activation causal order   PASS\nFailure/unwind ownership        PASS\nGraceful/physical termination   PASS\nM7+ scope containment           PASS\n```\n\nNext vertical：M6 Hostra Platform implementation。\n''',
)

print("M5 review closure patch applied")
