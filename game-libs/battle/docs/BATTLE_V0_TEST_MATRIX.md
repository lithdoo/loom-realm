# Battle v0 Test Matrix

> Status: **Design-only acceptance matrix**. This document does not redefine Battle rules. Every expected result must trace back to Rule IDs in [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md).
>
> Tests for OPEN rules are listed separately and must not assert a behavior until that rule is frozen.

## 1. Architecture and authority

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-ARCH-001 | ARCH-001, ARCH-003 | Presentation animation finishes early/late | Simulation Tick, tile, HP, result are unchanged |
| T-ARCH-002 | ARCH-002 | AI wants a route not precomputed by engine | Decision may submit explicit path; Simulation validates it rather than choosing another route |
| T-ARCH-003 | ARCH-004 | Battle loads RPGMap-compatible Map/Character assets | Assets are reused; RPGMap Runtime movement/timers are not invoked |
| T-ARCH-004 | ARCH-001, ARCH-003 | Browser camera/DOM/Sprite changes | No authoritative battle state changes |

## 2. Time and scheduler

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-TIME-001 | TIME-001 | Advance one Battle Tick | Exactly 200 ms logical duration |
| T-TIME-002 | TIME-003 | Last processed Tick 10; host wakes at target Tick 14 | Process 11, 12, 13, 14 in order |
| T-TIME-003 | TIME-003 | Events due at 11 and 14 during catch-up | They are not treated as same-time events |
| T-TIME-004 | DEC-001 | Decision completes in 500 ms | Earliest usable boundary is 600 ms / 3 ticks |
| T-TIME-005 | DEC-001 | completedAt equals deadline | Decision succeeds |
| T-TIME-006 | DEC-001 | Model completes before deadline but callback is handled later | Trusted completion time, not callback order, determines success |

## 3. PlanSubmission

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-PLAN-001 | PLAN-003 | Actor at (2,2), path starts [(3,2),(4,2)] | Valid shape; current tile is not repeated |
| T-PLAN-002 | PLAN-003 | Path includes diagonal (3,3) from (2,2) | Reject `path_not_adjacent` |
| T-PLAN-003 | PLAN-001, PLAN-003 | Path has 7 steps under default maxPathSteps=6 | Reject `path_too_long` |
| T-PLAN-004 | PLAN-003 | Empty path, no skill | Hold/reobserve plan |
| T-PLAN-005 | PLAN-003 | Empty path with valid skill | Direct-cast plan |
| T-PLAN-006 | PLAN-004 | Skill coefficients are {0.5,1.0}, submission uses 0.73 | Reject `invalid_min_coefficient` |
| T-PLAN-007 | PLAN-005 | Future path tile is currently dynamically occupied but statically walkable | Submission is not rejected solely for future dynamic occupancy |
| T-PLAN-008 | PLAN-006 | First invalid submission | Return reason and allow one correction |
| T-PLAN-009 | PLAN-006 | Corrected submission is invalid again | Generation fails; Actor idle; no new generation until a later Tick |
| T-PLAN-010 | DEC-002 | Old generation result returns late | Cannot submit |

## 4. Movement and contention

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-MOVE-001 | MOVE-001 | Actor halfway through visual movement A→B | Committed/occupied tile remains A; B is reserved |
| T-MOVE-002 | MOVE-001 | `move_complete` fires | Atomically release A, occupy B, release reservation |
| T-MOVE-003 | MOVE-002 | Multi-step path A→B→C | C step cannot start before A→B commits |
| T-MOVE-004 | MOVE-003, RNG-001 | A and B claim same tile same Tick | Exactly one wins via seeded equal-chance arbitration |
| T-MOVE-005 | MOVE-003 | Replay same seed/Tick/tile/competitors | Same contention winner |
| T-MOVE-006 | MOVE-003 | Change Promise or iteration order | Contention winner remains determined by stable inputs |
| T-MOVE-007 | MOVE-004 | Adjacent Actors attempt direct swap same Tick | Swap is rejected in v0 |
| T-MOVE-008 | MOVE-005 | Actor loses contested tile | Stays at origin, plan ends, replans later; no same-Tick retry |
| T-MOVE-009 | MOVE-006 | Actor is moving and takes nonlethal damaging hit | Current step still completes; future old path steps cancel |

## 5. Skill range and coefficient

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-SKILL-001 | SKILL-001 | Range matrix has no `"↑"` | Content validation fails |
| T-SKILL-002 | SKILL-001 | Range matrix has two `"↑"` cells | Content validation fails |
| T-SKILL-003 | SKILL-001 | Ragged matrix rows | Content validation fails |
| T-SKILL-004 | SKILL-001, DAMAGE-001 | Coefficient has >3 decimals | Content validation fails; no implicit rounding |
| T-SKILL-005 | DAMAGE-001 | baseDamage=7, coefficient=0.5 | coefficientUnits=500, finalDamage=3 |
| T-SKILL-006 | DAMAGE-001 | baseDamage=1, coefficient=0.5 | finalDamage=0 |
| T-SKILL-007 | SKILL-002 | Current coefficient=0.5, plan min=1.0 | Do not start skill; continue legal path |
| T-SKILL-008 | SKILL-002 | Current coefficient reaches 1.0, plan min=1.0 | Stop remaining path and start windup if attack is allowed |
| T-SKILL-009 | SKILL-003 | Start at 1.0; target moves to 0.5 during windup | Resolve as in-range at 0.5 |
| T-SKILL-010 | SKILL-003, HIT-001 | Target moves outside matrix before resolve | `miss` |
| T-SKILL-011 | SKILL-003 | Skill already started at min=1.0; resolve coefficient is 0.5 | Do not reapply minCoefficient at resolve |

## 6. Instant skill and Tick batching

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-INSTANT-001 | SKILL-005, TICK-001 | windup_ticks=0 skill starts at Tick N | Resolves in Tick N instant batch |
| T-INSTANT-002 | STATE-004, TICK-002 | windup=0 and recovery=0 | Actor cannot start a second Action in the same Tick |
| T-INSTANT-003 | SKILL-005, HIT-005 | Both Actors start lethal instant skills same Tick | Both instant skills are collected; simultaneous defeat remains possible |
| T-INSTANT-004 | TICK-001 | Instant skill kills an Actor that had a not-yet-started movement intent | Dead/invalid movement intent is not reserved in phase 12 |

## 7. Hit, protection, and recovery

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-HIT-001 | HIT-001 | Skill valid, target in range, unprotected | `hit` |
| T-HIT-002 | HIT-001, HIT-004 | Target is protected and in range | `immune`, 0 damage, no interrupt, no refresh |
| T-HIT-003 | HIT-001 | Target leaves range before resolve | `miss`, not `invalid` |
| T-HIT-004 | HIT-001 | Target dead/missing/action invalid | `invalid` |
| T-HIT-005 | HIT-002 | Tick 10 hit grants 3 full protection ticks | Ticks 11/12/13 protected; Tick 14 normal |
| T-HIT-006 | HIT-003 | Surviving Actor takes positive damage during windup | Windup invalidated; protection set; one new Decision generation |
| T-HIT-007 | HIT-003, SKILL-004 | Surviving Actor takes positive damage during recovery | Recovery interrupted; new Decision flow |
| T-HIT-008 | HIT-004 | Immune impact during recovery | Recovery continues |
| T-HIT-009 | HIT-005 | Two attacks hit same unprotected target in one batch | Both use protection state from batch start |
| T-HIT-010 | HIT-005 | Same-batch attacks kill both Actors | Simultaneous defeat supported |

## 8. Decision and recovery concurrency

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-DEC-001 | STATE-003 | Multiple same-Tick reasons call ensureDecision | At most one valid request for current generation |
| T-DEC-002 | SKILL-004 | Actor in recovery | Thinking may continue/start |
| T-DEC-003 | SKILL-004 | Decision becomes ready during recovery | Plan may buffer but no new Action starts until eligible |
| T-DEC-004 | DEC-002 | Hit invalidates generation while LLM request is pending | Late old result cannot submit |

## 9. Control plane and replay

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-CTRL-001 | CTRL-001 | Frame abort between logical ticks | Authority invalidates immediately; no need to wait for next Tick |
| T-CTRL-002 | CTRL-001 | LLM/Promise returns after Battle cancel | Cannot mutate ended Battle |
| T-REPLAY-001 | REPLAY-001 | Replay recorded battle | Does not call LLM |
| T-REPLAY-002 | REPLAY-001, RNG-001 | Replay seeded contention | Same winner/result |
| T-REPLAY-003 | REPLAY-002 | Diagnostics change/logging enabled | Gameplay result unchanged |

## 10. Presentation acceptance

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-PRES-001 | ARCH-003 | Browser drops frames | Simulation result unchanged |
| T-PRES-002 | ARCH-003 | Effect asset load fails | Damage/result unchanged; diagnostic may be emitted |
| T-PRES-003 | ARCH-003 | Camera zoom/focus changes | No Simulation state changes |
| T-PRES-004 | STATE-001 | Character frame interpolates at x=2.7 | Decision/Simulation still observe committed integer tile |

## 11. Result and termination

| Test ID | Rules | Scenario | Expected |
| --- | --- | --- | --- |
| T-RESULT-001 | RESULT-001 | Enemy alone reaches 0 HP at terminal gate | Ally win |
| T-RESULT-002 | RESULT-001 | Ally alone reaches 0 HP | Enemy win |
| T-RESULT-003 | RESULT-001, HIT-005 | Both reach 0 in same batch | Simultaneous defeat |
| T-RESULT-004 | CTRL-001, RESULT-001 | External Battle cancel | Cancelled result/termination path |

## 12. Open-rule test placeholders

These cases must be implemented only after the corresponding rule is frozen:

| Placeholder | Open rule | Question |
| --- | --- | --- |
| T-OPEN-DIR | OPEN-DIR-001 | Does direction change at move start or move_complete; does explicit turn exist? |
| T-OPEN-LETHAL-MOVE | OPEN-MOVE-001 | Does a lethally hit Actor finish an already-started atomic step? |
| T-OPEN-ZERO-DAMAGE | OPEN-HIT-001 | Does a `hit` with finalDamage=0 cause interruption/protection? |
| T-OPEN-LOS | OPEN-LOS-001 | Does terrain block skill reach? |
| T-OPEN-CLOCK | OPEN-CLOCK-001 | Freeze clock or catch up while backgrounded/paused? |
| T-OPEN-STALEMATE | OPEN-STALEMATE-001 | Is there a formal stalemate result? |

## 13. Minimum pre-LLM gate

Before real LLM integration, headless Mock/Script tests should demonstrate at least:

- overdue Tick catch-up;
- timeout/ready on the same boundary;
- moving Actor hit;
- move completion and skill resolve in one Tick;
- protection plus retained attack intent;
- recovery interruption;
- target movement causing lower coefficient and `miss`;
- 0-Tick instant batch;
- seeded tile contention;
- plan rejection/correction failure;
- simultaneous lethal attacks;
- abort with late async completion.

Passing this matrix means the rule reducer is coherent; it does not by itself prove Browser integration or production LLM integration.
