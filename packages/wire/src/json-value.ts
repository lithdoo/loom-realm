export type JsonPrimitive = null | boolean | number | string;

export type JsonArray = readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
