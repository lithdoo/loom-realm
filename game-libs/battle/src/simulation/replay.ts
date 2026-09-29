import type {
  ActorId,
  BattleResult,
  GridPosition,
  MovementFailureReason,
  PlanRejectReason,
  PlanSubmission,
  SkillResolveResult,
} from "../contracts.js";
import type { ResolvedBattleDefinition } from "./state.js";

export interface ReplayDecisionRecord {
  readonly actorId: ActorId;
  readonly generation: number;
  readonly attempt: 0 | 1;
  readonly requestId: string;
  readonly requestTick: number;
  readonly planningOrigin: GridPosition;
  readonly consumedTick: number;
  readonly completion:
    | { readonly type: "completed"; readonly plan: PlanSubmission }
    | { readonly type: "failed"; readonly category: "attempt_failure" | "session_fatal"; readonly code: string };
  readonly consumeOutcome:
    | { readonly type: "accepted"; readonly acceptedTick: number; readonly planId: string }
    | { readonly type: "rejected"; readonly rejectedTick: number; readonly reason: PlanRejectReason }
    | { readonly type: "attempt_failed" }
    | { readonly type: "session_fatal" }
    | { readonly type: "stale" };
}

export type ReplayMovementFact =
  | { readonly type: "move_started"; readonly actorId: ActorId; readonly from: GridPosition; readonly to: GridPosition; readonly motionId: number }
  | { readonly type: "contention"; readonly tile: GridPosition; readonly competitors: readonly ActorId[]; readonly winnerActorId: ActorId }
  | { readonly type: "move_failed"; readonly actorId: ActorId; readonly tile: GridPosition; readonly reason: MovementFailureReason }
  | { readonly type: "move_interrupted"; readonly actorId: ActorId; readonly reason: "damaging_hit" };

export interface ReplaySkillFact {
  readonly effectId: string;
  readonly casterActorId: ActorId;
  readonly targetActorId: ActorId;
  readonly skillId: string;
  readonly result: SkillResolveResult;
  readonly coefficientUnits: number;
}

export interface ReplayDamageFact {
  readonly sourceActorId: ActorId;
  readonly targetActorId: ActorId;
  readonly skillId: string;
  readonly amount: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
}

export interface ReplayProtectionFact {
  readonly actorId: ActorId;
  readonly startTick: number;
  readonly protectedUntilTickExclusive: number;
}

export interface ReplayTickRecord {
  readonly tick: number;
  readonly movements: readonly ReplayMovementFact[];
  readonly skills: readonly ReplaySkillFact[];
  readonly damage: readonly ReplayDamageFact[];
  readonly protections: readonly ReplayProtectionFact[];
}

export interface ReplayRecord {
  readonly version: 1;
  readonly initial: ResolvedBattleDefinition;
  readonly decisions: readonly ReplayDecisionRecord[];
  readonly ticks: readonly ReplayTickRecord[];
  readonly replayability:
    | { readonly type: "in_progress" }
    | { readonly type: "deterministic" }
    | { readonly type: "audit_only"; readonly reason: "cancelled" | "presentation_failure" | "invariant_rejection" };
  readonly result?: BattleResult;
}

export class ReplayRecorder {
  readonly #definition: ResolvedBattleDefinition;
  readonly decisions: ReplayDecisionRecord[] = [];
  readonly ticks: ReplayTickRecord[] = [];
  replayability: ReplayRecord["replayability"] = { type: "in_progress" };
  result: BattleResult | undefined;

  constructor(definition: ResolvedBattleDefinition) {
    this.#definition = definition;
  }

  appendDecision(record: ReplayDecisionRecord): void {
    this.decisions.push(structuredClone(record));
  }

  appendTick(record: ReplayTickRecord): void {
    this.ticks.push(structuredClone(record));
  }

  finish(result: BattleResult, replayability: ReplayRecord["replayability"]): void {
    this.result = structuredClone(result);
    this.replayability = replayability;
  }

  rejectInvariant(): void {
    this.result = undefined;
    this.replayability = { type: "audit_only", reason: "invariant_rejection" };
  }

  snapshot(): ReplayRecord {
    return deepFreeze({
      version: 1,
      initial: this.#definition,
      decisions: structuredClone(this.decisions),
      ticks: structuredClone(this.ticks),
      replayability: structuredClone(this.replayability),
      ...(this.result === undefined ? {} : { result: structuredClone(this.result) }),
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
