export {
  SharedStateError,
  isSharedStateFailure,
  type SharedStateFailure,
  type SharedStateFailureCode,
} from "./failure.js";
export type {
  PreparedSharedStateDefinition,
  PreparedSharedStateInitialRecord,
  SharedStateBindingCommitDispatch,
  SharedStateClient,
  SharedStateCommit,
  SharedStateCondition,
  SharedStateIndexRecord,
  SharedStateIndexSnapshot,
  SharedStateInitialRecord,
  SharedStateInitialSnapshot,
  SharedStateKey,
  SharedStatePhysicalBinding,
  SharedStatePut,
  SharedStateRecord,
  SharedStateSnapshot,
  SharedStateSubscription,
  SharedStateSubscriptionEvent,
  SharedStateTransaction,
} from "./model.js";
export {
  SHARED_STATE_LIMITS,
  prepareSharedStateDefinition,
} from "./validation.js";
export {
  SharedStateAuthority,
  createInMemorySharedStateBinding,
  createSharedStateAuthority,
  type SharedStateAuthorityFatalFact,
  type SharedStateAuthorityOptions,
} from "./authority.js";
export {
  ReplaceableSharedStateClient,
  createSharedStateClient,
} from "./client.js";
export {
  createSharedStateCarrierBinding,
  serveSharedStateCarrier,
  type SharedStateCarrierServer,
} from "./carrier.js";
export {
  createSharedStateMessagePortCarrier,
  type SharedStateMessagePort,
} from "./message-port-carrier.js";
