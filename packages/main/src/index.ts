export { MainRuntimeFatalError } from "./errors.js";
export { runMainInternal as runMain } from "./internal/main-session.js";
export type {
  LogicalGameBootstrap,
  MainFrameFailure,
  MainFrameOutcome,
  MainPlatform,
  MainPolicy,
  MainRuntimeFailure,
  MainSessionResult,
  RunMainOptions,
} from "./model.js";
