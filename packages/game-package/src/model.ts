import type { JsonValue } from "@loomrealm/wire";

export interface SubsystemDescriptorV1 {
  readonly key: string;
}

export interface InitialFrameTargetV1 {
  readonly subsystem: string;
  readonly input: JsonValue;
}

export interface RealmStateGameRecordV1 {
  readonly namespace: string;
  readonly key: string;
  readonly value: JsonValue;
}

export interface RealmStateGameDefinitionV1 {
  readonly records: readonly RealmStateGameRecordV1[];
}

export interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly state?: RealmStateGameDefinitionV1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

declare const validatedGameEntryV1Brand: unique symbol;

export type ValidatedGameEntryV1 = GameEntryV1 & {
  readonly [validatedGameEntryV1Brand]: never;
};
