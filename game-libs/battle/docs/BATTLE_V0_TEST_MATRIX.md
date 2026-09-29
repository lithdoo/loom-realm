# Battle v0 测试矩阵

> 状态：**Core + Presentation FROZEN Acceptance Matrix；Presentation IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED，Core Simulation/Decision 尚未实现**。本文不重新定义规则；Core Expected 追溯到 SPEC Rule ID，Presentation Expected 追溯到 FROZEN Presentation/Contracts。
>
> 尚未冻结的真实 LLM provider、Guidance/Host wiring 不在本矩阵中被实现代码自行假设。

## 1. Architecture / Authority

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-ARCH-001 | ARCH-001, ARCH-003 | Presentation 动画提前/延后结束 | Simulation Tick、tile、HP、result 不变 |
| T-ARCH-002 | ARCH-002 | AI 想走 Engine 未预生成的路线 | Decision 可直接提交 path；Simulation 只校验，不替换路线 |
| T-ARCH-003 | ARCH-004 | Battle 加载 RPGMap-compatible Map/Character | 复用素材形式，不调用 RPGMap Runtime movement/timer |
| T-ARCH-004 | ARCH-001, ARCH-003 | camera/DOM/Sprite 状态变化 | 不改变权威 Battle State |
| T-ARCH-005 | ARCH-005, TIME-001, TIME-002, TIME-003 | 业务只构造 Simulation + ScriptDecision + Null/Recording Presentation，并用可控 clock 推进时间；业务不调用 public tick | Simulation 自己按 200 ms scheduler / event queue / reducer 运行完整 Battle、结算 BattleResult 并记录 Replay |
| T-ARCH-006 | ARCH-005 | 不创建 Decision/Simulation instance，只给 Presentation BattleSceneInit + synthetic RenderProjection | 可初始化 Map/Actor 并表现 movement/effect；无需了解 Decision/Simulation concrete implementation |
| T-ARCH-007 | ARCH-002, ARCH-005 | 仅替换注入的 ScriptDecision 为 LLMDecision，二者实现同一 DecisionPort | Simulation 的 clock/reducer/Plan 规则无需改变；Presentation 无感知 |
| T-ARCH-008 | ARCH-006, BATTLE-001 | v0 BattleConfig 提供 3 个 combat Actor | 启动前 validation reject；actor collection N-ready 不等于 v0 支持多人 |
| T-ARCH-009 | ARCH-006 | 同一合法 1v1 Config 只交换 actors collection 的排列顺序，actorId/team/其他事实不变 | identity、side 与规则语义不随数组位置改变；需要稳定遍历时按稳定 actorId key |
| T-ARCH-010 | ARCH-005 | Runtime 注入 Presentation 后，业务只调用 battle.run/pause/resume/cancel/close | Runtime 自己调用 Presentation initialize/render/pause/resume/close；业务不承担 Projection 转发或 Presentation lifecycle |
| T-ARCH-011 | ARCH-005 | headless Simulation 只注入 FakeClock + AbortSignal + ScriptDecision + RecordingPresentation | 不需要构造 SubsystemScope/Frame/Viewport/RenderDomain；Core Runtime 仍可完整运行 |
| T-ARCH-012 | BATTLE-001, ARCH-006 | v0 BattleConfig 为两个 Actor，但 team 是 ally+ally 或 enemy+enemy | 启动前 validation reject；v0 必须恰好 1 ally + 1 enemy |

## 2. Time / Scheduler

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-TIME-001 | TIME-001 | 推进 1 Tick | 逻辑时长固定 200 ms |
| T-TIME-002 | TIME-003 | 上次处理 Tick 10，scheduler/event loop 晚醒时 target Tick 14 | 依次处理 11/12/13/14 |
| T-TIME-003 | TIME-003 | catch-up 中 scheduled events 分别 due 11 和 14 | 不视为同一批同时事件 |
| T-TIME-004 | DEC-001, TIME-002 | Tick 20 reducer 已结束，Decision completion 在 Tick 21 snapshot 前进入 inbox | Tick 21 消费/校验；若合法且 Actor 可行动，最早 Tick 21 Action phase 执行 |
| T-TIME-005 | DEC-001, TIME-002 | Decision completion 在 Tick 21 snapshot 后、Tick 21 reducer 处理中到达 | 不得重入 Tick 21；最早 Tick 22 消费 |
| T-TIME-006 | DEC-001 | Promise callback 拿到合法 Plan | callback 只 enqueue；Actor/acceptedPlan/HP/position 等权威状态在 reducer 前完全不变 |
| T-TIME-007 | TIME-004 | Battle pause/background 期间现实经过 30 秒 | currentTick 不推进，不产生 150 个 catch-up Tick |
| T-TIME-008 | TIME-003, TIME-004 | Battle clock 正常运行但 scheduler 晚醒 4 Tick | 仍逐 Tick catch-up；每个 Tick 独立建立 event/inbox snapshot |
| T-TIME-009 | DEC-001, TIME-004 | Battle pause 时 LLM completion 返回并进入 inbox | pause 中不消费；resume 后第一个实际 reducer Tick 才可消费 |
| T-TIME-010 | DEC-001, REPLAY-001 | 两次真实运行的 LLM wall-clock latency 不同，但 Replay 记录相同 consumed/accepted Tick | Replay 不依赖 completion timestamp，不重新调用 LLM，按记录 Tick 复现 Plan 生效 |

## 3. PlanSubmission

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-PLAN-001 | PLAN-003 | Actor 在 (2,2)，path 为 (3,2),(4,2) | 合法；path 不重复当前格 |
| T-PLAN-002 | PLAN-003 | 从 (2,2) 直接走 (3,3) | reject `path_not_adjacent` |
| T-PLAN-003 | PLAN-001, PLAN-003 | 默认 maxPathSteps=6 时提交 7 步 | reject `path_too_long` |
| T-PLAN-004 | PLAN-003 | 空 path、无 skill | hold/reobserve |
| T-PLAN-005 | PLAN-003 | 空 path、有合法 skill | direct cast |
| T-PLAN-006 | PLAN-004 | Skill 只有 {0.5,1.0}，提交 0.73 | reject `invalid_min_coefficient` |
| T-PLAN-007 | PLAN-005 | 未来 path 某格当前被动态占用，但静态可走 | 不仅因为未来动态占用就拒绝整份提交 |
| T-PLAN-008 | PLAN-006 | 第一次非法提交 | 返回 machine-readable reason，允许一次修正 |
| T-PLAN-009 | PLAN-006 | 修正后仍非法 | 当前 generation 失败；Actor idle；最早后续 Tick 新 generation |
| T-PLAN-010 | DEC-002 | 旧 generation 响应迟到 | 无提交权 |
| T-PLAN-011 | PLAN-007 | path 走完仍没达到 minCoefficient | 不自动降级用更低 coefficient 攻击 |
| T-PLAN-012 | PLAN-008 | move-only plan 途中进入技能合法格 | 不自动施法 |
| T-PLAN-013 | PLAN-003, PLAN-005 | 同时提交 turn + 非空 path | reject `turn_with_path` |
| T-PLAN-014 | PLAN-003 | turn 使用非法 Direction | reject `invalid_turn` |

## 4. Turn / Movement / Contention

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-TURN-001 | TURN-001, STATE-004 | Actor 原地 turn right | committed tile 不变，direction 立即变 right，本 Tick不能再启动第二个 Action |
| T-TURN-002 | TURN-001, PLAN-003 | Plan = turn right + skill intent | Tick N 只执行 turn；skill 最早后续 Tick重新校验后起手 |
| T-TURN-003 | TURN-001, HIT-005 | protected Actor 执行 turn | 允许 turn；仍不能 windup |
| T-TURN-004 | TURN-001, SKILL-004 | recovery Actor 尝试 turn | recovery 是 action lock，不能 turn |
| T-MOVE-001 | MOVE-001 | Actor 视觉上处于 A→B 中间 | committed/occupied 仍是 A，B 被预约 |
| T-MOVE-002 | MOVE-001 | `move_complete` 到期且 step 未被中断 | 原子释放 A、占用 B、释放 reservation |
| T-MOVE-003 | MOVE-002 | path A→B→C | A→B 提交前不得启动 B→C |
| T-MOVE-004 | MOVE-003, RNG-001 | A/B 同 Tick 抢同一格 | 只一个赢家；使用 seeded 等概率裁决 |
| T-MOVE-005 | MOVE-003 | 相同 seed/Tick/tile/competitors Replay | 得到同一赢家 |
| T-MOVE-006 | MOVE-003 | 改变 Promise/遍历顺序 | 裁决结果仍只由稳定输入决定 |
| T-MOVE-007 | MOVE-004 | 相邻 Actor 同 Tick 直接 swap | v0 禁止 |
| T-MOVE-008 | MOVE-005 | Actor 输掉 contested tile | 留原格、plan 结束、后续重规划，不同 Tick 零时间重试 |
| T-MOVE-009 | MOVE-006 | Actor 从 A 向右 move_start | direction 立即变 right，但 committed tile 仍是 A |
| T-MOVE-010 | MOVE-007, HIT-003 | active step A→B 中受到非致命 positive damage | step 立即失败；释放 B reservation；留在 A；获得 protection；旧 plan/Decision 失效并创建一次受击后 Decision |
| T-MOVE-011 | MOVE-007, HIT-003 | active step A→B 中受到致命 damage | step 立即失败；释放 B reservation；dead 留在 A；无新 protection/Decision |
| T-MOVE-012 | MOVE-007, TICK-001 | Tick N phase 3 已成功 move_complete 到 B，随后 phase 5–7 被命中 | 伤害发生时 step 已完成，Actor 留在 B，不回滚到 A |
| T-MOVE-013 | MOVE-006, MOVE-007 | move_start 向右后被中断 | committed tile 留 origin，但 direction 保持 right，不回滚 |
| T-MOVE-014 | MOVE-002, PLAN-007 | path A→B→C 被接受 | start 时只 materialize A→B；不得提前 schedule B→C 的 move_complete |
| T-MOVE-015 | MOVE-002, PLAN-007 | A→B 成功提交且 Plan 仍有 B→C | move_complete 后推进 plan cursor；后续 Action phase 才重新校验并尝试 B→C |
| T-MOVE-016 | MOVE-005, PLAN-007 | A→B 在 reservation contention 失败 | 当前 Plan 终止；未 materialize 的 B→C 不产生 event；后续合法 Tick 重规划 |

## 5. Skill Range / Coefficient

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-SKILL-001 | SKILL-001 | range 没有 `"↑"` | Content validation fail |
| T-SKILL-002 | SKILL-001 | range 有两个 `"↑"` | Content validation fail |
| T-SKILL-003 | SKILL-001 | range 行长度不同 | Content validation fail |
| T-SKILL-004 | SKILL-001, DAMAGE-001 | coefficient 超过 3 位小数 | validation fail，不隐式 rounding |
| T-SKILL-005 | DAMAGE-001 | baseDamage=7, coefficient=0.5 | units=500，finalDamage=3 |
| T-SKILL-006 | DAMAGE-001 | baseDamage=1, coefficient=0.5 | finalDamage=0 |
| T-SKILL-007 | SKILL-002 | current=0.5, plan min=1.0 | 不起手；有合法剩余 path 则继续 |
| T-SKILL-008 | SKILL-002 | current 达到 1.0, plan min=1.0 | Actor 可攻击时停止剩余 path 并开始 windup |
| T-SKILL-009 | SKILL-003 | 1.0 起手，前摇中目标退到 0.5 | 按 resolve 时 0.5 结算 |
| T-SKILL-010 | SKILL-003, HIT-001 | 前摇中目标离开矩阵 | `miss` |
| T-SKILL-011 | SKILL-002, SKILL-003 | min=1.0 起手，resolve 时只剩 0.5 | 不二次检查 min；按 0.5 结算 |
| T-SKILL-012 | SKILL-006 | caster 与 target 中间有不可通行 Tile，但 target 在正 coefficient 格 | v0 不做 LOS；范围规则仍合法 |

## 6. Instant Skill / Tick Batch

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-INSTANT-001 | SKILL-005, TICK-001 | windup=0 在 Tick N 起手 | Tick N instant batch 中 resolve |
| T-INSTANT-002 | STATE-004, TICK-002 | windup=0 + recovery=0 | 同 Actor 本 Tick不能启动第二个 Action |
| T-INSTANT-003 | SKILL-005, HIT-006 | 双方同 Tick 启动致命 instant skill | 两个技能都先收集；允许 simultaneous defeat |
| T-INSTANT-004 | TICK-001 | instant skill 杀死原本有“尚未启动移动意图”的 Actor | phase 12 不再为其启动 reservation |

## 7. Hit / Protection / Recovery

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-HIT-001 | HIT-001 | skill/target 有效、范围内、未保护 | `hit` |
| T-HIT-002 | HIT-001, HIT-004 | target 在 protection 且范围内 | `immune`；0 damage、不中断、不刷新 |
| T-HIT-003 | HIT-001 | target 在 resolve 前离开范围 | `miss`，不是 `invalid` |
| T-HIT-004 | HIT-001 | target 已死/消失/action invalid | `invalid` |
| T-HIT-005 | HIT-002 | Tick 10 hit 后给 3 个完整保护 Tick | 11/12/13 protected，14 normal |
| T-HIT-006 | HIT-003 | windup 中受到正 damage | windup invalid；protection set；只创建一个新 Decision generation |
| T-HIT-007 | HIT-003, SKILL-004 | recovery 中受到正 damage | recovery 中断并进入新 Decision 流程 |
| T-HIT-008 | HIT-004 | recovery 中收到 immune impact | recovery 继续 |
| T-HIT-009 | HIT-006 | 同 batch 两个攻击命中同一未保护 target | 两个都按 batch-start protection 判断 |
| T-HIT-010 | HIT-006 | 同 batch 双方都死亡 | simultaneous defeat |
| T-HIT-011 | HIT-005, PLAN-007 | protected Actor 有 accepted attack plan | 可 Thinking/移动/turn 但不能 windup；保护结束后按最新状态和同一 threshold 重检 |
| T-HIT-012 | DAMAGE-001, HIT-007 | 几何命中但 finalDamage=0 | outcome 仍为 hit；HP 不变；不打断、不 protection、不 redecision |
| T-HIT-013 | HIT-007 | recovery/moving Actor 收到 zero-damage hit | 当前 Action 正常继续 |

## 8. Decision / Recovery 并发

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-DEC-001 | STATE-003 | 同 Tick 多个原因调用 ensureDecision | 当前 generation 只存在一个有效 request |
| T-DEC-002 | SKILL-004 | Actor 在 recovery | Thinking 可以继续/开始 |
| T-DEC-003 | SKILL-004, DEC-001 | recovery 中 reducer 消费并接受 Decision Plan | Plan 可暂存，但 recovery 结束前不能启动新 Action |
| T-DEC-004 | DEC-002 | hit 使 generation 失效后旧 LLM 返回 | 无提交权 |
| T-DEC-005 | STATE-005, SKILL-004 | Actor 正在 recovery 时 Decision request thinking | actionState=recovery 与 decisionState=thinking 可同时存在，不互相覆盖 |
| T-DEC-006 | STATE-005 | Actor moving 时启动 Decision | actionState=moving 与 decisionState=thinking 可同时存在 |
| T-DEC-007 | DEC-003, PLAN-006 | 第一次 Decision completion 返回非法 Plan | Adapter 不自行重试；Simulation validation 后决定是否发起唯一 correction attempt |
| T-DEC-008 | DEC-001, DEC-003 | DecisionCompletion 返回 Plan/failure | Completion 只含 requestId/generation/result；无 gameplay timing/dueTick；callback 只 enqueue，Simulation reducer 决定 stale/validation/acceptance |
| T-DEC-009 | STATE-005, STATE-006 | 当前 Plan 仍有未 materialize 的后续 path/skill intent | 不为“下一 Plan”提前开启新 generation；当前 Plan 继续拥有 future intent |
| T-DEC-010 | STATE-006 | 当前 Plan 的最后一个 intent 已 materialize 成 active move/windup/recovery | 当前 Action 可继续，同时允许最多一个 next Decision 进入 thinking |
| T-DEC-011 | STATE-006, SKILL-004 | action lock 未结束时 next Decision completion 被 reducer 接受 | 保存为唯一 pending accepted plan；不得启动 Action，也不得接受第三份排队 Plan |
| T-DEC-012 | STATE-006, HIT-003 | active Action 受 damaging hit 且 pending Plan 已存在 | 旧 action/plan/decision authority 一并失效；不允许 stale pending Plan 在后续启动 |

## 9. Control Plane / Replay

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-CTRL-001 | CTRL-001 | 两个 Tick 之间 Frame abort | 立即失效 authority，不等下个 Tick |
| T-CTRL-002 | CTRL-001 | Battle cancel 后 Promise/LLM 返回 | 不得修改结束 Battle |
| T-CTRL-003 | CTRL-001, RESULT-001 | RUNNING 时 battle.close() | 取消 authority、清理资源，run() 通过单一结果通道得到 cancelled，不同时产生同义 Promise rejection |
| T-CTRL-004 | RESULT-001 | Presentation initialize/render 出现已分类 fatal | Runtime cleanup，run() 返回 failure；programmer/invariant error 才允许 throw/reject |
| T-CTRL-005 | RESULT-001 | Presentation resize timer/internal callback 出现已分类 async fatal | Presentation 立即 cleanup 并只完成一次 `failure` channel；Runtime 观察后停止 authority并归约为 Battle failure；不得成为 unhandled callback exception |
| T-REPLAY-001 | REPLAY-001 | Replay 一场已记录 Battle | 不重新调用 LLM；按记录的 request/consume/accept Tick 与 Plan 复现，不依赖真实 completion timestamp |
| T-REPLAY-002 | REPLAY-001, RNG-001 | Replay seeded contention | 相同 winner/result |
| T-REPLAY-003 | REPLAY-002 | 开关 diagnostics | gameplay result 不变 |

## 10. Presentation

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-PRES-001 | ARCH-003 | Browser 掉帧 | Simulation result 不变 |
| T-PRES-002 | ARCH-003 | Effect asset load fail | damage/result 不变，可发 diagnostic |
| T-PRES-003 | ARCH-003 | Presentation camera/viewport 重新布局 | 不改 Simulation State；v0 camera 无 zoom/focusHint/animation |
| T-PRES-004 | STATE-001 | Sprite 插值位置 x=2.7 | Decision/Simulation 仍只看到 committed integer tile |
| T-PRES-005 | ARCH-006, BATTLE-001 | 仅用 synthetic Presentation input 初始化 4 个唯一 actorId | Presentation 可创建 4 个 actor visual/HUD entry 且无固定 ally/enemy slot；这不使 v0 Simulation 接受 4 Actor |
| T-PRES-006 | ARCH-003, ARCH-005 | Runtime 启动 Battle session | 先 await Presentation.initialize，再 render initial Projection，之后才启动 200ms Battle clock；SceneInit 不重复维护 tile/direction/HP 初值 |
| T-PRES-007 | ARCH-003 | 正常 BattleResult 已 resolve 但 scene 尚未退出 | final Projection 保持可见；直到 battle.close() 才关闭 Presentation |
| T-PRES-008 | CTRL-001 | RUNNING 状态直接调用 battle.close() | 等价于 cancel authority + cleanup；scheduler/late completion 无提交权，Presentation close 幂等 |
| T-PRES-009 | ARCH-003 | 没有新 Simulation Projection，仅 viewport resize | Simulation state/tick 不变；Presentation 自行推进 visualEpoch 并提交新 layout |
| T-PRES-010 | ARCH-003 | Tick N 发布 effectStarts=[effect-1]，Tick N+1 effectStarts=[] | effect-1 继续按 Presentation-local visual timing 播放并自行 cleanup；Simulation 不维护 active visual effect |
| T-PRES-011 | ARCH-003 | 同一个 effectId 因重复 render 再次出现 | 不重复创建 transient visual |
| T-PRES-012 | ARCH-003, ARCH-005 | initialize 完成后 first render | 只创建一次完整 RenderDomain；root/actor/effects/HUD key、tag、slot 与 FROZEN Render Tree 完全一致 |
| T-PRES-013 | ARCH-006 | Scene actor 输入顺序交换 | actor RenderNode 仍按 Contracts 定义的 ActorId ECMAScript ordinal string order 稳定排列，identity 不随输入顺序改变 |
| T-PRES-014 | ARCH-003 | Actor active movement，同时 viewport resize/camera 改变 | Actor data 只含 world motion，不含 screenX/fromScreenX；motionId/fingerprint/elapsed 不重启，只改变 parent transform |
| T-PRES-015 | ARCH-003 | 两个 alive Actor 分处地图两点 | camera 使用 movement.to-or-tile target 的 bounding midpoint，clamp Map bounds；无 zoom/animation |
| T-PRES-016 | ARCH-003 | Map 小于 logical viewport | 对应 camera 轴为 0，并通过 originX/originY 在 logical viewport 居中 |
| T-PRES-017 | ARCH-003 | initialize 首个 viewport 与后续连续 resize | 首次立即接受且不 clamp；后续只在 trailing-edge 100ms 提交 latest layout；相同 layout no-op |
| T-PRES-018 | TIME-004, ARCH-003 | PAUSED 中 movement/effect/autotile 正在进行且发生 resize | visual elapsed 全部冻结；resize 仍可提交且 paused=true；resume 后从冻结点继续 |
| T-PRES-019 | ARCH-003 | hit/immune/miss/invalid 四种 effectStarts | hit opacity 1.0；immune 0.6；miss/invalid 不创建 visual；四种 outcome 都消费 effectId |
| T-PRES-020 | ARCH-003 | initialize twice、pre-init render、pause before initial render | 按 Handler FROZEN 状态机产生 programmer/state error；close 幂等，CLOSED 后 render race-safe no-op |
| T-PRES-021 | ARCH-003 | older tick、same tick identical replay、same tick conflicting Projection | older ignore；identical replay no commit/no visualEpoch++；conflict fail fast |
| T-PRES-022 | ARCH-003 | Character/BattleEffect/Tileset/Autotile Browser decode failure | actor/tile 使用 placeholder或 effect skip + diagnostic；不改变 gameplay、不产生 Battle ACK |
| T-PRES-023 | ARCH-003 | first render 后执行 move/turn/damage/effect/pause/resume/resize | 全部使用 domain.update()；normal path 不调用 domain.replace() |
| T-PRES-024 | ARCH-003 | 两个 Actor 同时拥有不同 motionId | 两个 Browser motion 并行插值，不共享 scene-global motion id |
| T-PRES-025 | ARCH-006 | ActorId 恰好 115 UTF-8 bytes / 超过 115 UTF-8 bytes | 上界值生成的 `battle:actor:<actorId>` 不超过 Renderer 128-byte key limit；超界 ActorId 在进入 RenderDomain 前 reject |
| T-PRES-026 | ARCH-003 | hit/immune effect 与 actor、priority tile 位于同一 world 区域 | effect 作为 world-space overlay 始终绘制在 battlefield tile/actor 之上；HUD 独立，不参与 world overlay |
| T-PRES-027 | ARCH-003 | 超大合法 viewport 使 required +1-tile view payload 超过 Renderer capacity guard | 不 clamp、不截断、不 chunk；整次 visual commit 以 PRESENTATION_COMMIT_FAILED 失败且不产生 partial visualEpoch |
| T-PRES-028 | ARCH-003, TIME-004 | animated Autotile 无 suffix / `[N]` suffix，期间 pause/resume | 默认 250ms/frame；`[N]` 为 N*50ms/frame；pause 冻结 visual time，resume 从冻结点继续 |
| T-PRES-029 | ARCH-003 | resource/decode 延迟 >200ms，期间连续多个 visual commit | Character 与 Tileset/Autotile 的同 identity 请求共享 in-flight Promise，最终显示且 decoded Image 复用；seq fencing 不造成 starvation；reject 后允许 retry |
| T-PRES-030 | ARCH-003, ARCH-005 | synthetic Scene/Projection 驱动真实 BattlePresentationHandler | Handler 自建 RenderDomain，数据经 RenderManager → renderer-data → RendererRenderStore → WebProjector 到 lr-battle DOM；movement/effect/resize/close 可见 |
| T-PRES-031 | ARCH-003 | package build 后通过 Browser/HTTP 加载 Battle CSS | `dist/browser/battle.css` 存在、package export 正确、请求非 404 |
| T-PRES-032 | ARCH-003 | first full state 与 later update 分别做 capacity preflight | full state 使用 16384 node count；update 使用 4096 node operations并检查 prospective state；两者不混用 |


## 11. Result / Termination

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-RESULT-001 | RESULT-001 | enemy 单独在 terminal gate HP=0 | ally win |
| T-RESULT-002 | RESULT-001 | ally 单独 HP=0 | enemy win |
| T-RESULT-003 | RESULT-001, HIT-006 | 双方同 batch HP=0 | simultaneous defeat |
| T-RESULT-004 | CTRL-001, RESULT-001 | 外部 cancel | cancelled termination path |
| T-RESULT-005 | RESULT-002, REPLAY-002 | 长时间无伤害/无进展 | v0 不自动 stalemate/timeout；只更新 diagnostics |

## 12. Core OPEN 状态

当前 Core gameplay 的 6 个原 OPEN 均已冻结，因此不再保留“没有 Expected 的核心测试占位”。

Presentation blocking OPEN 已清零，§10 已给出 frozen Presentation acceptance。剩余 OPEN 只涉及非 Presentation Content 统一 schema、真实 Decision provider metadata/cancel defaults、Guidance/Host wiring 等；这些不得反向改变已冻结的 Core/Presentation Expected。

## 13. 接真实 LLM 前的最低 Gate

至少应先用 headless Mock/Script 测通：

- overdue Tick catch-up；
- Decision inbox snapshot 边界：snapshot 前到达本 Tick消费、snapshot 后到达下一 Tick消费；
- turn-only / turn+skill 的 Action 配额；
- move_start 瞬间转向；
- moving Actor 被 positive damage 中断并留 committed origin；
- moving Actor 被致命伤害时取消 step 且不新建 Decision；
- 同 Tick move completion + 后续 skill resolve；
- protection + retained attack intent；
- zero-damage hit 无 aftermath；
- recovery interruption；
- target movement 导致 lower coefficient / miss；
- no-LOS 行为；
- 0-Tick instant batch；
- seeded tile contention；
- Plan reject + correction failure；
- pause/background clock freeze；
- 长时间无进展不自动 stalemate；
- simultaneous lethal；
- abort 后 late async completion。

通过这些测试代表 Rule reducer 的核心一致性成立；不代表 Browser 或真实 LLM 集成已经完成。
